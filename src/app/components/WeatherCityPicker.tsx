import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LocateFixed, Search } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { locateWeatherDevice } from '../lib/weatherGeolocation';
import {
  normalizeWeatherLocation,
  geocodingLocation,
  type WeatherLocationSource,
  needsWeatherCityName,
  type WeatherLocation,
} from '../lib/weatherLocation';
export function WeatherCityPicker({
  selected,
  onChange,
  onAttributionChange,
}: {
  selected: WeatherLocation | null;
  onAttributionChange: (
    provider: 'amap' | 'nominatim' | 'geonames' | 'photon' | 'dbip' | null,
  ) => void;
  onChange: (
    location: WeatherLocation | null,
    source: WeatherLocationSource,
  ) => boolean;
}) {
  const [editing, setEditing] = useState(!selected);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(WeatherLocation & { id: string })[]>(
    [],
  );
  const [busy, setBusy] = useState<'search' | 'locate' | ''>('');
  const [message, setMessage] = useState('');
  const [pendingChoice, setPendingChoice] = useState<{
    location: WeatherLocation;
    source: WeatherLocationSource;
    approximate?: boolean;
    networkReason?: 'permission' | 'unavailable' | 'manual';
  } | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pendingChoice && !confirmDialog.current?.open)
      confirmDialog.current?.showModal();
  }, [pendingChoice]);
  useEffect(() => {
    const visible =
      (selected && !needsWeatherCityName(selected)) || results.length > 0;
    onAttributionChange(
      visible
        ? results[0]?.provider || selected?.provider || 'nominatim'
        : null,
    );
  }, [selected, results, onAttributionChange]);
  function requestChoice(
    location: WeatherLocation,
    source: WeatherLocationSource = 'manual',
    approximate = false,
    networkReason?: 'permission' | 'unavailable' | 'manual',
  ) {
    generation.current++;
    controller.current?.abort();
    setBusy('');
    setPendingChoice({ location, source, approximate, networkReason });
  }

  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  function choose(
    location: WeatherLocation | null,
    source: WeatherLocationSource = 'manual',
  ) {
    generation.current++;
    controller.current?.abort();
    setBusy('');
    setResults([]);
    setMessage('');
    setEditing(!location);
    if (!onChange(location, source)) {
      setMessage(
        '浏览器未能保存城市选择，本次仍可使用，刷新后可能恢复。请允许此网站保存数据后重试。',
      );
    }
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    const request = ++generation.current;
    controller.current?.abort();
    const searchController = new AbortController();
    controller.current = searchController;
    setBusy('search');
    setMessage('');
    setResults([]);
    try {
      const response = await api('/weather-mood/cities', {
        method: 'POST',
        readOnly: true,
        timeoutMs: 15000,
        body: JSON.stringify({ query: query.trim() }),
        signal: searchController.signal,
      });
      if (generation.current !== request) return;
      const cities = Array.isArray(response.data)
        ? response.data.flatMap((item: any) => {
            const location = normalizeWeatherLocation(item);
            return location ? [{ ...location, id: String(item.id) }] : [];
          })
        : [];
      setResults(cities);
      if (!cities.length)
        setMessage('没有找到城市，试试城市简称或拼音；同名城市可加省份。');
    } catch (error: any) {
      if (generation.current === request)
        setMessage(
          error instanceof ApiError && error.kind === 'timeout'
            ? '搜索超时，请重试。'
            : error.message || '搜索失败，请重试。',
        );
    } finally {
      if (generation.current === request) setBusy('');
    }
  }
  async function resolveName(
    location: WeatherLocation,
    request: number,
    approximate = false,
  ) {
    controller.current?.abort();
    const locateController = new AbortController();
    controller.current = locateController;
    setBusy('locate');
    setMessage('正在识别城市名称…');
    try {
      const response = await api('/weather-mood/locate', {
        method: 'POST',
        readOnly: true,
        timeoutMs: 20000,
        body: JSON.stringify({ location }),
        signal: locateController.signal,
      });
      if (generation.current !== request) return;
      const resolved = normalizeWeatherLocation(response.data);
      if (!resolved || needsWeatherCityName(resolved))
        throw new Error('城市识别没有返回有效名称。');
      requestChoice(resolved, 'device', approximate);
    } catch (error: any) {
      if (generation.current !== request) return;
      // Only a confirmed, named city is saved; a failed lookup preserves selection.
      setBusy('');
      setEditing(true);
      setMessage(
        error instanceof ApiError && error.kind === 'timeout'
          ? '城市识别超时，请重试或手动选择城市。'
          : error instanceof ApiError && error.kind === 'http'
            ? error.message
            : '暂时无法识别城市名称，请重试或手动选择城市。',
      );
    }
  }
  async function locateNetwork(request = ++generation.current, reason: 'permission' | 'unavailable' | 'manual' = 'manual') {
    controller.current?.abort();
    const networkController = new AbortController();
    controller.current = networkController;
    setBusy('locate');
    setMessage('正在按网络识别大致城市…');
    try {
      const response = await api('/weather-mood/locate-network', { method: 'POST', readOnly: true, timeoutMs: 15000, body: '{}', signal: networkController.signal });
      if (generation.current !== request) return;
      const location = normalizeWeatherLocation(response.data);
      if (!location || needsWeatherCityName(location)) throw new Error('网络城市识别没有返回有效名称。');
      setMessage('');
      requestChoice(location, 'network', true, reason);
    } catch (error: any) {
      if (generation.current !== request) return;
      setBusy('');
      setEditing(true);
      setMessage(error.message || '当前网络暂未识别出城市，请重试或搜索城市。');
    }
  }
  async function locate() {
    const request = ++generation.current;
    controller.current?.abort();
    setResults([]);
    setMessage('');
    if (!navigator.geolocation) {
      await locateNetwork(request, 'unavailable');
      return;
    }
    setBusy('locate');
    setMessage('正在获取位置…');
    const deviceController = new AbortController();
    controller.current = deviceController;
    try {
        const position = await locateWeatherDevice(navigator.geolocation, deviceController.signal);
        if (generation.current !== request) return;
        const location = geocodingLocation({
          name: '当前位置附近',
          region: '',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (location) {
          await resolveName(location, request,
            !Number.isFinite(position.coords.accuracy) || position.coords.accuracy > 1000);
        } else {
          await locateNetwork(request, 'unavailable');
        }
    } catch (error: any) {
        if (generation.current !== request) return;
        if ([1, 2, 3].includes(error.code)) {
          await locateNetwork(request, error.code === 1 ? 'permission' : 'unavailable');
          return;
        }
        setBusy('');
        setEditing(true);
        setMessage(
          error.code === 1
            ? '定位未获授权，你仍可手动搜索城市。'
            : error.code === 3
              ? '定位超时，请重试或手动选择城市。'
              : '暂时无法取得位置，请手动选择城市。',
        );
    }
  }
  return (
    <div className="weather-city-picker">
      <div className="weather-city-current">
        <span>
          {selected?.name || '选择天气城市'}
          {selected?.region && (
            <small className="weather-city-privacy">{selected.region}</small>
          )}
        </span>
        {selected && (
          <button
            ref={changeButton}
            type="button"
            onClick={() => {
              generation.current++;
              controller.current?.abort();
              setBusy('');
              setEditing((value) => !value);
            }}
          >
            {' '}
            {editing ? '取消' : '切换城市'}{' '}
          </button>
        )}
      </div>
      {editing && (
        <>
          <form className="weather-city-search" onSubmit={search}>
            <label className="sr-only" htmlFor="weather-city-query">
              城市名称
            </label>
            <input
              id="weather-city-query"
              value={query}
              minLength={2}
              maxLength={80}
              required
              placeholder="搜索城市，如 杭州"
              onChange={(event) => {
                generation.current++;
                controller.current?.abort();
                setBusy('');
                setResults([]);
                setMessage('');
                setQuery(event.target.value);
              }}
            />
            <button
              type="submit"
              aria-label="搜索城市"
              disabled={query.trim().length < 2 || busy === 'search'}
            >
              <Search size={16} />
            </button>
          </form>
          <button
            type="button"
            className="weather-city-locate"
            onClick={locate}
            disabled={busy === 'locate'}
          >
            <LocateFixed size={15} />
            {busy === 'locate' ? '正在定位…' : '使用当前位置'}
          </button>
          <small className="weather-city-privacy">
            按浏览器提供的位置识别城市；境外取不到坐标时可按 IP 识别市一级城市，境内请允许位置权限。
          </small>
          <button type="button" className="weather-city-locate" disabled={busy === 'locate'} onClick={() => void locateNetwork()}>
            按网络识别城市
          </button>
          {busy === 'search' && (
            <p className="weather-city-message" role="status">
              正在搜索城市…
            </p>
          )}
          {results.length > 0 && (
            <ul className="weather-city-results" aria-label="城市搜索结果">
              {results.map((result) => (
                <li key={result.id}>
                  <button type="button" onClick={() => requestChoice(result)}>
                    <strong>{result.name}</strong>
                    <small>{result.region}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <button
              type="button"
              className="weather-city-clear"
              onClick={() => choose(null)}
            >
              清除已选城市
            </button>
          )}
        </>
      )}
      {message && (
        <p className="weather-city-message" role="status">
          {message}
        </p>
      )}
      {needsWeatherCityName(selected) && (
        <button
          type="button"
          className="weather-city-locate"
          disabled={busy === 'locate'}
          onClick={() => void locate()}
        >
          {busy === 'locate' ? '正在定位并识别城市…' : '重新定位并识别城市'}
        </button>
      )}
      <dialog
        ref={confirmDialog}
        className="weather-city-confirm"
        aria-labelledby="weather-city-confirm-title"
        onCancel={() => setPendingChoice(null)}
        onClose={() => setPendingChoice(null)}
      >
        {pendingChoice && (
          <>
            <p className="weather-city-confirm-eyebrow">天气地区</p>
            <h3 id="weather-city-confirm-title">
              使用{pendingChoice.location.name}？
            </h3>
            <p className="weather-city-confirm-region">
              {pendingChoice.location.region}
            </p>
            {pendingChoice.approximate && (
              <p>{pendingChoice.source === 'network'
                ? `${pendingChoice.networkReason === 'permission' ? '由于未获得位置权限，' : pendingChoice.networkReason === 'unavailable' ? '由于无法取得设备位置，' : ''}已改用网络 IP 识别市一级城市。如需更细致的定位和天气服务，请允许此网站使用位置权限。IP 识别可能受 VPN、代理或运营商出口影响。`
                : '设备返回的是大致位置，可能落在邻近城市或区县。'}请核对后确认，不正确时可取消并手动搜索。</p>
            )}
            <p>
              已选城市将在此浏览器保存 30
              天，期间不会自动切换。你可以随时更改地区或重新定位。
            </p>
            {pendingChoice.location.provider === 'dbip' && <p className="weather-companion-credits"><a href="https://db-ip.com" target="_blank" rel="noreferrer">IP 定位：DB-IP</a></p>}
            <div className="weather-city-confirm-actions">
              <button
                type="button"
                onClick={() => confirmDialog.current?.close()}
              >
                取消
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const choice = pendingChoice;
                  confirmDialog.current?.close();
                  choose(choice.location, choice.source);
                  requestAnimationFrame(() => changeButton.current?.focus());
                }}
              >
                确认使用
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
