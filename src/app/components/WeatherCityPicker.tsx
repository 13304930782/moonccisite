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
  const [busy, setBusy] = useState<'search' | 'locate' | 'network' | ''>('');
  const [notice, setNotice] = useState<{ title: string; body: string; search?: boolean } | null>(null);
  const noticeDialog = useRef<HTMLDialogElement>(null);
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
    if (notice && !noticeDialog.current?.open) noticeDialog.current?.showModal();
  }, [notice]);
  function showNotice(title: string, body: string, search = false) {
    setNotice({ title, body, search });
  }
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
    setEditing(!location);
    if (!onChange(location, source)) {
      showNotice('城市未保存', '本次选择仍可使用。请允许浏览器保存网站数据，避免刷新后丢失。');
    }
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    const request = ++generation.current;
    controller.current?.abort();
    const searchController = new AbortController();
    controller.current = searchController;
    setBusy('search');
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
      if (!cities.length) showNotice('未找到城市', '请检查城市名称，或加上省份重新搜索。');
    } catch (error: any) {
      if (generation.current === request)
        showNotice('搜索失败',
          error instanceof ApiError && error.kind === 'timeout'
            ? '搜索超时，请重试。'
            : '城市搜索暂不可用，请稍后重试。',
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
      showNotice('无法识别城市',
        error instanceof ApiError && error.kind === 'timeout'
          ? '城市识别超时，请重试或手动选择城市。'
          : '暂时无法识别城市名称，请重试或搜索城市。',
      );
    }
  }
  async function locateNetwork(request = ++generation.current, reason: 'permission' | 'unavailable' | 'manual' = 'manual') {
    controller.current?.abort();
    const networkController = new AbortController();
    controller.current = networkController;
    setBusy('network');
    try {
      const response = await api('/weather-mood/locate-network', { method: 'POST', readOnly: true, timeoutMs: 15000, body: '{}', signal: networkController.signal });
      if (generation.current !== request) return;
      const location = normalizeWeatherLocation(response.data);
      if (!location || needsWeatherCityName(location)) throw new Error('网络城市识别没有返回有效名称。');
      requestChoice(location, 'network', true, reason);
    } catch (error: any) {
      if (generation.current !== request) return;
      setBusy('');
      setEditing(true);
      if (error.code === 'CITY_NETWORK_LOCATION_PERMISSION') {
        showNotice('需要位置权限', '请在浏览器中允许位置权限，以获取更准确的天气。也可以手动搜索城市。', true);
      } else {
        showNotice('无法识别城市', 'IP 定位暂不可用，请重试或手动搜索城市。', true);
      }
    }
  }
  async function locate() {
    const request = ++generation.current;
    controller.current?.abort();
    setResults([]);
    if (!navigator.geolocation) {
      await locateNetwork(request, 'unavailable');
      return;
    }
    setBusy('locate');
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
        showNotice('无法获取位置',
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
                setQuery(event.target.value);
              }}
            />
            <button
              type="submit"
              aria-label={busy === 'search' ? '正在搜索城市' : '搜索城市'}
              disabled={query.trim().length < 2 || !!busy}
            >
              <Search size={16} />
            </button>
          </form>
          <button
            type="button"
            className="weather-city-locate"
            onClick={locate}
            disabled={!!busy}
          >
            <LocateFixed size={15} />
            {busy === 'locate' ? '正在定位…' : '使用当前位置'}
          </button>
          <button type="button" className="weather-city-locate" disabled={!!busy} onClick={() => void locateNetwork()}>
            {busy === 'network' ? '正在识别…' : '按 IP 定位'}
          </button>
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
      {needsWeatherCityName(selected) && (
        <button
          type="button"
          className="weather-city-locate"
          disabled={!!busy}
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
                ? `${pendingChoice.networkReason === 'permission' ? '未获得位置权限，' : pendingChoice.networkReason === 'unavailable' ? '无法获取设备位置，' : ''}已通过 IP 识别市一级城市，请确认是否正确。如需更细致的定位和天气，请允许位置权限。`
                : '设备仅提供了大致位置，请确认城市是否正确。'}</p>
            )}
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
      <dialog
        ref={noticeDialog}
        className="weather-city-confirm"
        aria-labelledby="weather-city-notice-title"
        aria-describedby="weather-city-notice-body"
        onCancel={() => setNotice(null)}
        onClose={() => setNotice(null)}
      >
        {notice && (
          <>
            <h3 id="weather-city-notice-title">{notice.title}</h3>
            <p id="weather-city-notice-body">{notice.body}</p>
            <div className="weather-city-confirm-actions">
              <button type="button" autoFocus onClick={() => {
                noticeDialog.current?.close();
                if (notice.search) requestAnimationFrame(() => document.getElementById('weather-city-query')?.focus());
              }}>{notice.search ? '搜索城市' : '知道了'}</button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
