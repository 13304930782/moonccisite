import { useI18n } from '../i18n';
import { confirmAction } from '../lib/confirmAction';
import { hasUnsavedChanges } from '../lib/useUnsavedLeave';
import { notify } from '../lib/feedback';
import { ThemeSelect } from './ThemeSelect';
import { AdminEmpty, AdminError, AdminLoading } from './admin/AdminState';
import { ReactNode, useEffect, useState } from 'react';
import { Plus, Users, Upload, X, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
export type ElectricityRoom = {
  id: string;
  name: string;
  active: boolean;
  legacy: boolean;
  memberCount: number;
  verifiedAt?: string;
};
const splitNames = (value: string) =>
  value
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
export function AdminElectricityRooms({
  children,
}: {
  children: (room: ElectricityRoom, onBusyChange: (busy: boolean) => void) => ReactNode;
}) {
  const { t } = useI18n();
  const [settingsBusy, setSettingsBusy] = useState(false);
  const canChangeRoom = async () => !settingsBusy && (!hasUnsavedChanges() || await confirmAction(t("m_89398dbb4c"), t("m_47df49807e")));
  const [rooms, setRooms] = useState<ElectricityRoom[]>([]),
    [selected, setSelected] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true),
    [mode, setMode] = useState<'' | 'add' | 'edit' | 'import'>('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [draft, setDraft] = useState({
    name: '',
    account: '',
    roomVerify: '',
    notifyTo: '',
    members: '',
    active: true,
  });
  const [bulk, setBulk] = useState(''),
    [preview, setPreview] = useState<
      | {
          name: string;
          schoolName: string;
          members: string[];
          notifyTo: string;
        }[]
      | null
    >(null);
  const room = rooms.find((r) => r.id === selected);
  const load = async (prefer?: string) => {
    const response = await api('/admin/electricity/rooms', {
      cache: 'no-store',
    });
    setRooms(response.data);
    setSelected(
      (current) =>
        prefer ||
        (response.data.some((r: ElectricityRoom) => r.id === current)
          ? current
          : response.data[0]?.id || ''),
    );
  };
  const reloadRooms = async () => {
    setLoading(true);
    setLoadError('');
    try { await load(); }
    catch (e) { setLoadError(e instanceof Error ? e.message : t("m_b3b75bd055")); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reloadRooms(); }, []);
  const open = async (next: typeof mode) => {
    if (!(await canChangeRoom())) return;
    setError('');
    setMessage('');
    setPreview(null);
    setBulk('');
    setDraft({
      name: next === 'edit' ? room?.name || '' : '',
      account: '',
      roomVerify: '',
      notifyTo: '',
      members: '',
      active: room?.active ?? true,
    });
    setMode(next);
    if (next === 'edit' && room) {
      setBusy(true);
      try {
        const result = await api(`/admin/electricity/rooms/${room.id}/members`);
        setDraft((d) => ({
          ...d,
          members: result.data
            .map((u: { username: string }) => u.username)
            .join(', '),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("m_0d4b979463"));
        setMode('');
      } finally {
        setBusy(false);
      }
    }
  };
  const submit = async (checkOnly = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'edit' && room) {
        await api(`/admin/electricity/rooms/${room.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: draft.name,
            active: draft.active,
            members: splitNames(draft.members),
            ...(draft.account || draft.roomVerify
              ? { account: draft.account, roomVerify: draft.roomVerify }
              : {}),
          }),
        });
        await load();
        notify.success(t("m_224441cea3"));
      } else {
        const inputs =
          mode === 'import'
            ? JSON.parse(bulk)
            : [{ ...draft, members: splitNames(draft.members) }];
        const result = await api(
          `/admin/electricity/rooms${checkOnly ? '/preview' : ''}`,
          { method: 'POST', body: JSON.stringify({ rooms: inputs }) },
        );
        if (checkOnly) {
          setPreview(result.data);
          return;
        }
        await load(result.data[0]?.id);
        setMessage(t("m_6dde6f4a4f", {v0: result.data.length})); notify.success(t("m_db01f8b0df"));
      }
      setMode('');
      setDraft({
        name: '',
        account: '',
        roomVerify: '',
        notifyTo: '',
        members: '',
        active: true,
      });
      setBulk('');
      setPreview(null);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? t("m_2c64696391")
          : e instanceof Error
            ? e.message
            : t("m_b3b75bd055"),
      ); notify.error(e instanceof SyntaxError
          ? t("m_2c64696391")
          : e instanceof Error
            ? e.message
            : t("m_b3b75bd055"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="electricity-admin electricity-admin-v2">
      <header className="electricity-admin-head">
        <div>
          <span>{t("m_d2232b15c8")}</span>
          <h1>{t("m_af99c07be8")}</h1>
          <p>{t("m_1efdcb27c0")}</p>
        </div>
      </header>
      {!loading && !loadError && rooms.length > 0 && <div className="electricity-room-toolbar">
        <label>
          <span>{t("m_3f50589be1")}</span>
          <ThemeSelect
            aria-label={t("m_5059efe0ac")}
            value={selected}
            disabled={Boolean(mode) || busy || settingsBusy || !rooms.length}
            onValueChange={async (value) => {
              if (value === selected || !(await canChangeRoom())) return;
              setSelected(value);
              setMessage('');
              setError('');
            }}
          >
            {!rooms.length && <option value="">{t("m_360a26014e")}</option>}
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {!r.active ? t("m_4826482624") : ''}
              </option>
            ))}
          </ThemeSelect>
        </label>
        <div className="electricity-room-toolbar-actions">
          <button
            className="electricity-button"
            disabled={busy || settingsBusy || Boolean(mode) || !room}
            onClick={() => open('edit')}
          >
            <Users />
             {t("m_353efbabce")} </button>
          <button
            className="electricity-button"
            disabled={busy || settingsBusy || Boolean(mode)}
            onClick={() => open('add')}
          >
            <Plus />
             {t("m_ee4512c271")} </button>
          <button
            className="electricity-button"
            disabled={busy || settingsBusy || Boolean(mode)}
            onClick={() => open('import')}
          >
            <Upload />
             {t("m_fd77192739")} </button>
        </div>
      </div>}
      {error && (
        <div className="electricity-admin-notice is-error" role="alert">
          {t(error || '')}
        </div>
      )}
      {message && (
        <div className="electricity-admin-notice" role="status">
          {t(message || '')}
        </div>
      )}
      {mode && (
        <section
          className="electricity-room-editor"
          aria-labelledby="room-editor-title"
        >
          <div className="electricity-manage-heading">
            <h2 id="room-editor-title">
              {mode === 'add'
                ? t("m_ee4512c271")
                : mode === 'edit'
                  ? t("m_353efbabce")
                  : t("m_948b0a8748")}
            </h2>
            <button
              className="electricity-schedule-remove"
              aria-label={t("m_34f75b9922")}
              disabled={busy}
              onClick={() => {
                setMode('');
                setBulk('');
                setPreview(null);
                setDraft((d) => ({ ...d, account: '', roomVerify: '' }));
              }}
            >
              <X />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(mode === 'import' && !preview);
            }}
          >
            <fieldset disabled={busy} className="electricity-manage-fieldset">
              {mode === 'import' ? (
                <>
                  <p className="electricity-manage-help">
                     {t("m_5f6eedeafd")} </p>
                  <label className="electricity-import-label">
                     {t("m_0ebdb62f56")} <textarea
                      aria-label={t("m_6507ddb472")}
                      spellCheck={false}
                      autoComplete="off"
                      rows={8}
                      value={bulk}
                      onChange={(e) => {
                        setBulk(e.target.value);
                        setPreview(null);
                      }}
                      placeholder={
                        t("m_6036e24c98")
                      }
                      required
                    />
                  </label>
                  <p className="electricity-manage-help">
                     {t("m_077e5c99dc")} </p>
                  {preview && (
                    <div className="electricity-import-preview">
                      <h3>{t("m_d36da78e2f")}</h3>
                      {preview.map((r, i) => (
                        <div key={i}>
                          <strong>{r.name}</strong>
                          <span>{t("m_a20387ab55")}{r.schoolName}</span>
                          <span>
                             {t("m_c73b90f735")}{r.members.join('、') || t("m_53f2067aef")}  {t("m_c082705f99")} {r.notifyTo || t("m_3cffa9757b")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="electricity-field-grid">
                  <label>
                    <span>{t("m_25de31f72e")}</span>
                    <input
                      required
                      maxLength={100}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                      placeholder={t("m_175b81b4af")}
                    />
                  </label>
                  <label>
                    <span>
                      {room?.legacy && mode === 'edit'
                        ? t("m_b3e8912ac6")
                        : t("m_4c2a1dc8c3")}
                    </span>
                    {room?.legacy && mode === 'edit' ? (
                      <p className="electricity-manage-help">
                         {t("m_501353afb2")} </p>
                    ) : (
                      <input
                        value={draft.members}
                        onChange={(e) =>
                          setDraft({ ...draft, members: e.target.value })
                        }
                        placeholder={t("m_12ddd09901")}
                      />
                    )}
                  </label>
                  <label>
                    <span>
                       {t("m_9a8ddf1a5e")}{mode === 'edit' ? t("m_1fa5481dd5") : ''}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      required={mode === 'add'}
                      maxLength={256}
                      value={draft.account}
                      onChange={(e) =>
                        setDraft({ ...draft, account: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>
                       {t("m_64f73f15ec")} {mode === 'edit' ? t("m_826bd0be54") : ''}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      required={mode === 'add'}
                      maxLength={4096}
                      value={draft.roomVerify}
                      onChange={(e) =>
                        setDraft({ ...draft, roomVerify: e.target.value })
                      }
                    />
                  </label>
                  {mode === 'add' && (
                    <label>
                      <span>{t("m_b836608abe")}</span>
                      <input
                        type="email"
                        value={draft.notifyTo}
                        onChange={(e) =>
                          setDraft({ ...draft, notifyTo: e.target.value })
                        }
                        placeholder={t("m_d1313cca0d")}
                      />
                    </label>
                  )}
                  {mode === 'edit' && (
                    <label className="electricity-room-active">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) =>
                          setDraft({ ...draft, active: e.target.checked })
                        }
                      />
                      <span>{t("m_c918462cc2")}</span>
                    </label>
                  )}
                </div>
              )}
              <div className="electricity-room-editor-actions">
                <button
                  className="electricity-button electricity-button--primary"
                  type="submit"
                >
                  {busy
                    ? t("m_fa87382eab")
                    : mode === 'import'
                      ? preview
                        ? t("m_4a8d6841b4")
                        : t("m_cfec9515a8")
                      : mode === 'edit'
                        ? t("m_8feefed5c6")
                        : t("m_e1d1aa5bb0")}
                </button>
                <button
                  className="electricity-button"
                  type="button"
                  onClick={() => {
                    setMode('');
                    setBulk('');
                    setPreview(null);
                    setDraft((d) => ({ ...d, account: '', roomVerify: '' }));
                  }}
                >
                   {t("m_2cd0f3be87")} </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {loading ? (
        <AdminLoading label={t("m_8e507acd9e")} />
      ) : loadError ? (
        <AdminError message={loadError} onRetry={() => void reloadRooms()} />
      ) : room ? (
        <div hidden={Boolean(mode)}>
          <div className="electricity-room-summary">
            <span>
              {room.legacy ? t("m_e5cb8acdc4") : t("m_2377df5f36", {v0: room.memberCount})}
              {!room.active ? t("m_4826482624") : ''}
            </span>
            <a
              className="electricity-room-panel-link"
              href={`/electricity?roomId=${room.id}`}
              target="_blank"
              rel="noreferrer"
            >
               {t("m_05941c46b0")} <ArrowUpRight size={14} />
            </a>
          </div>
          {children(room, setSettingsBusy)}
        </div>
      ) : (
        !mode && (
          <section className="admin-empty-result electricity-room-empty">
            <AdminEmpty title={t("m_41004ae4d2")} hint={t("m_0268fcbc12")} action={
              <div className="electricity-room-empty-actions">
                <button type="button" className="electricity-button electricity-button--primary" onClick={() => open('add')}><Plus />{t("m_ee4512c271")}</button>
                <button type="button" className="electricity-button" onClick={() => open('import')}><Upload />{t("m_fd77192739")}</button>
              </div>
            } />
          </section>
        )
      )}
    </div>
  );
}
