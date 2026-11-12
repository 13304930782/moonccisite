import { useI18n } from '../i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LocateFixed, Search, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { locateWeatherDevice } from '../lib/weatherGeolocation';
import {
  normalizeWeatherLocation,
  geocodingLocation,
  type WeatherLocationSource,
  needsWeatherCityName,
  weatherLocationFlag,
  weatherLocationRegion,
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
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
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
  const editorDialog = useRef<HTMLDialogElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = editorDialog.current;
    if (editing && !pendingChoice && !notice) {
      if (dialog && !dialog.open) {
        dialog.showModal();
        queryInput.current?.focus();
      }
    } else if (dialog?.open) dialog.close();
  }, [editing, pendingChoice, notice]);
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
  function closeEditor() {
    generation.current++;
    controller.current?.abort();
    setBusy('');
    setResults([]);
    setEditing(false);
    editorDialog.current?.close();
  }
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
    setEditing(false);
    if (!onChange(location, source)) {
      showNotice(t("m_be70cc03b9"), t("m_e8bf1e06ef"));
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
      if (!cities.length) showNotice(t("m_d12cfd4a24"), t("m_72ce4db918"));
    } catch (error: any) {
      if (generation.current === request)
        showNotice(t("m_6b5dde6e3a"),
          error instanceof ApiError && error.kind === 'timeout'
            ? t("m_dd6b5e8592")
            : t("m_e148b40371"),
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
        throw new Error(t("m_6dd2e07227"));
      requestChoice(resolved, 'device', approximate);
    } catch (error: any) {
      if (generation.current !== request) return;
      // Only a confirmed, named city is saved; a failed lookup preserves selection.
      setBusy('');
      setEditing(true);
      showNotice(t("m_0d614a7d24"),
        error instanceof ApiError && error.kind === 'timeout'
          ? t("m_a4faa9a447")
          : t("m_70c17168f1"),
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
      if (!location || needsWeatherCityName(location)) throw new Error(t("m_ece9e557f6"));
      requestChoice(location, 'network', true, reason);
    } catch (error: any) {
      if (generation.current !== request) return;
      setBusy('');
      setEditing(true);
      if (error.code === 'CITY_NETWORK_LOCATION_PERMISSION') {
        showNotice(t("m_fde7fd3e81"), t("m_080a62e083"), true);
      } else {
        showNotice(t("m_0d614a7d24"), t("m_1b99875fce"), true);
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
          name: t("m_85609ec92f"),
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
        showNotice(t("m_01ad7b751f"),
          error.code === 1
            ? t("m_15463de334")
            : error.code === 3
              ? t("m_acc3337524")
              : t("m_af9203c910"),
        );
    }
  }
  const flag = weatherLocationFlag(selected);
  return (
    <div className="weather-city-picker">
      <div className="weather-city-current">
        <span className={`weather-city-icon${flag === 'TW' ? ' weather-city-icon-text' : ''}`} aria-hidden="true">{flag}</span>
        <div className={`weather-city-copy${selected ? '' : ' weather-city-copy-empty'}`}>
          <strong>{selected?.name || t("m_b3725cc60e")}</strong>
          <small>{selected ? weatherLocationRegion(selected) : t('选一个，心情跟天气走')}</small>
        </div>
        <button
          ref={changeButton}
          type="button"
          onClick={() => {
            generation.current++;
            controller.current?.abort();
            setBusy('');
            setEditing(true);
          }}
        >
          {selected ? t('切换') : t("m_317f75c9da")}
        </button>
      </div>
      <dialog
        ref={editorDialog}
        className="weather-city-confirm weather-city-editor"
        aria-labelledby="weather-city-editor-title"
        onCancel={closeEditor}
      >
        {editing && (
        <>
          <div className="weather-companion-heading">
            <h3 id="weather-city-editor-title">{t("m_317f75c9da")}</h3>
            <button type="button" aria-label={t("m_25306a2072")} onClick={closeEditor}><X size={16} /></button>
          </div>
          <form className="weather-city-search" onSubmit={search}>
            <label className="sr-only" htmlFor="weather-city-query">
               {t("m_1864ef8d23")} </label>
            <input
              id="weather-city-query"
              ref={queryInput}
              value={query}
              minLength={2}
              maxLength={80}
              required
              placeholder={t("m_2c8ed14dbd")}
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
              aria-label={busy === 'search' ? t("m_b58d20ac3f") : t("m_a40a921387")}
              disabled={query.trim().length < 2 || !!busy}
            >
              <Search size={16} />
            </button>
          </form>
          <div className="weather-city-editor-actions">
            <button
              type="button"
              className="weather-city-locate"
              onClick={locate}
              disabled={!!busy}
            >
              <LocateFixed size={15} />
              {busy === 'locate' ? t("m_145fdf789f") : t("m_c789741b0d")}
            </button>
            <button type="button" className="weather-city-locate" disabled={!!busy} onClick={() => void locateNetwork()}>
              {busy === 'network' ? t("m_660640f5b0") : t("m_a6195119b7")}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="weather-city-results" aria-label={t("m_80c8980ede")}>
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
               {t("m_5eb75d6988")} </button>
          )}
        </>
        )}
      </dialog>
      <dialog
        ref={confirmDialog}
        className="weather-city-confirm"
        aria-labelledby="weather-city-confirm-title"
        onCancel={() => setPendingChoice(null)}
        onClose={() => setPendingChoice(null)}
      >
        {pendingChoice && (
          <>
            <p className="weather-city-confirm-eyebrow">{t("m_bdc98898a0")}</p>
            <h3 id="weather-city-confirm-title">
               {t("m_cdfd0b34e4")}{pendingChoice.location.name}？
            </h3>
            <p className="weather-city-confirm-region">
              {pendingChoice.location.region}
            </p>
            {pendingChoice.approximate && (
              <p>{pendingChoice.source === 'network'
                ? t("m_eacef2d239", {v0: pendingChoice.networkReason === 'permission' ? t("m_292d56eec0") : pendingChoice.networkReason === 'unavailable' ? t("m_1ce0c96138") : ''})
                : t("m_359cfc415f")}</p>
            )}
            {pendingChoice.location.provider === 'dbip' && <p className="weather-companion-credits"><a href="https://db-ip.com" target="_blank" rel="noreferrer">{t("m_f83e25f2ea")}</a></p>}
            <div className="weather-city-confirm-actions">
              <button
                type="button"
                onClick={() => confirmDialog.current?.close()}
              >
                 {t("m_2cd0f3be87")} </button>
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
                 {t("m_5acb7d6168")} </button>
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
                if (notice.search) setEditing(true);
              }}>{notice.search ? t("m_a40a921387") : t("m_de32e20193")}</button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
