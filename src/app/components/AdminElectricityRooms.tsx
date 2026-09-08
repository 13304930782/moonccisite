import { ThemeSelect } from './ThemeSelect';
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
  children: (room: ElectricityRoom) => ReactNode;
}) {
  const [rooms, setRooms] = useState<ElectricityRoom[]>([]),
    [selected, setSelected] = useState('');
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
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const open = async (next: typeof mode) => {
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
        setError(e instanceof Error ? e.message : '无法读取成员');
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
        setMessage('宿舍信息已保存；移除成员后其旧订阅链接立即失效。');
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
        setMessage(
          `已添加 ${result.data.length} 个宿舍，等待计划采集，也可点击立即查询。`,
        );
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
          ? '导入内容不是有效的 JSON 数组。'
          : e instanceof Error
            ? e.message
            : '操作失败。',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="electricity-admin electricity-admin-v2">
      <header className="electricity-admin-head">
        <div>
          <span>UTILITIES / 宿舍管理</span>
          <h1>水电监控设置</h1>
          <p>按宿舍管理采集与订阅，同宿舍成员共享一份电量数据。</p>
        </div>
      </header>
      <div className="electricity-room-toolbar">
        <label>
          <span>当前管理</span>
          <ThemeSelect
            aria-label="当前管理的宿舍"
            value={selected}
            disabled={Boolean(mode) || busy || !rooms.length}
            onValueChange={(value) => {
              setSelected(value);
              setMessage('');
              setError('');
            }}
          >
            {!rooms.length && <option value="">尚未添加宿舍</option>}
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {!r.active ? ' · 已停用' : ''}
              </option>
            ))}
          </ThemeSelect>
        </label>
        <div className="electricity-room-toolbar-actions">
          <button
            className="electricity-button"
            disabled={busy || Boolean(mode) || !room}
            onClick={() => open('edit')}
          >
            <Users />
            宿舍与成员
          </button>
          <button
            className="electricity-button"
            disabled={busy || Boolean(mode)}
            onClick={() => open('add')}
          >
            <Plus />
            添加宿舍
          </button>
          <button
            className="electricity-button"
            disabled={busy || Boolean(mode)}
            onClick={() => open('import')}
          >
            <Upload />
            批量导入
          </button>
        </div>
      </div>
      {error && (
        <div className="electricity-admin-notice is-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="electricity-admin-notice" role="status">
          {message}
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
                ? '添加宿舍'
                : mode === 'edit'
                  ? '宿舍与成员'
                  : '批量导入宿舍'}
            </h2>
            <button
              className="electricity-schedule-remove"
              aria-label="取消宿舍编辑"
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
                    每次最多 10
                    个。先校验学校电表和网站用户名，再确认导入；不会覆盖已有宿舍。
                  </p>
                  <label className="electricity-import-label">
                    账号清单（JSON 数组）
                    <textarea
                      aria-label="账号清单"
                      spellCheck={false}
                      autoComplete="off"
                      rows={8}
                      value={bulk}
                      onChange={(e) => {
                        setBulk(e.target.value);
                        setPreview(null);
                      }}
                      placeholder={
                        '[\n  {"name":"朋友的宿舍", "account":"学校账号", "roomVerify":"宿舍校验凭据", "members":["网站用户名"], "notifyTo":""}\n]'
                      }
                      required
                    />
                  </label>
                  <p className="electricity-manage-help">
                    清单包含查询凭据，仅在此页提交；保存后不会回显。
                  </p>
                  {preview && (
                    <div className="electricity-import-preview">
                      <h3>确认以下宿舍</h3>
                      {preview.map((r, i) => (
                        <div key={i}>
                          <strong>{r.name}</strong>
                          <span>学校电表：{r.schoolName}</span>
                          <span>
                            成员：{r.members.join('、') || '暂未绑定'} · 通知：
                            {r.notifyTo || '未开启'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="electricity-field-grid">
                  <label>
                    <span>宿舍名称</span>
                    <input
                      required
                      maxLength={100}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                      placeholder="例如：清荷公寓 A2-628"
                    />
                  </label>
                  <label>
                    <span>
                      {room?.legacy && mode === 'edit'
                        ? '访问范围'
                        : '绑定网站用户名'}
                    </span>
                    {room?.legacy && mode === 'edit' ? (
                      <p className="electricity-manage-help">
                        仅站长登录后可见
                      </p>
                    ) : (
                      <input
                        value={draft.members}
                        onChange={(e) =>
                          setDraft({ ...draft, members: e.target.value })
                        }
                        placeholder="多个用户名用逗号分隔，需先注册"
                      />
                    )}
                  </label>
                  <label>
                    <span>
                      学校账号{mode === 'edit' ? '（留空保持原值）' : ''}
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
                      宿舍校验凭据
                      {mode === 'edit' ? '（更换时需同时填写账号）' : ''}
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
                      <span>通知收件人</span>
                      <input
                        type="email"
                        value={draft.notifyTo}
                        onChange={(e) =>
                          setDraft({ ...draft, notifyTo: e.target.value })
                        }
                        placeholder="留空则不发送邮件"
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
                      <span>启用宿舍（关闭后暂停采集并撤销私密订阅）</span>
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
                    ? '正在校验与保存…'
                    : mode === 'import'
                      ? preview
                        ? '确认导入'
                        : '校验并预览'
                      : mode === 'edit'
                        ? '保存宿舍信息'
                        : '验证并添加'}
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
                  取消
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {loading ? (
        <p role="status">正在读取宿舍…</p>
      ) : room ? (
        <div hidden={Boolean(mode)}>
          <div className="electricity-room-summary">
            <span>
              {room.legacy ? '仅站长可见' : `${room.memberCount} 位成员可见`}
              {!room.active ? ' · 已停用' : ''}
            </span>
            <a
              className="electricity-room-panel-link"
              href={`/electricity?roomId=${room.id}`}
              target="_blank"
              rel="noreferrer"
            >
              查看此宿舍面板 <ArrowUpRight size={14} />
            </a>
          </div>
          {children(room)}
        </div>
      ) : (
        !mode && (
          <section className="electricity-room-empty">
            <h2>添加第一个宿舍</h2>
            <p>填写学校查询账号和宿舍凭据，再绑定朋友的网站用户名。</p>
            <button className="electricity-button" onClick={() => open('add')}>
              <Plus />
              添加宿舍
            </button>
          </section>
        )
      )}
    </div>
  );
}
