import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { maskedSubscription } from '../lib/electricityPresentation';

export function ElectricityRssSubscription({roomId}: {roomId: string}) {
  const {user} = useAuth();
  return user ? <RoomElectricityRssSubscription key={`${user.id}:${roomId}`} roomId={roomId}/> : null;
}
function RoomElectricityRssSubscription({roomId}: {roomId: string}) {
  const [data, setData] = useState<{url: string | null; resetRequired: boolean} | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [shown, setShown] = useState(false);
  const inFlight = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    api(`/electricity/rss/subscription?roomId=${encodeURIComponent(roomId)}`, {cache: 'no-store', signal: controller.signal})
      .then(response => {if (!controller.signal.aborted) setData(response.data);})
      .catch(() => {if (!controller.signal.aborted) setError('暂时无法读取订阅链接，请重试。');})
      .finally(() => {if (!controller.signal.aborted) setBusy(false);});
    return () => {alive.current = false; controller.abort();};
  }, [roomId]);
  async function request(action: 'create' | 'reset' | 'read') {
    if (inFlight.current) return;
    if (action === 'reset' && !await confirmAction('重置后旧链接将失效，已订阅的阅读器需要更换新链接。确定重置吗？', '重置订阅链接')) return;
    if (inFlight.current || !alive.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await api(`/electricity/rss/subscription${action === 'reset' ? '/reset' : ''}?roomId=${encodeURIComponent(roomId)}`, {method: action === 'read' ? 'GET' : 'POST', cache: 'no-store'});
      if (!alive.current) return;
      setData(response.data); setShown(false);
      if (action !== 'read') notify.success(action === 'reset' ? '已重置' : '订阅链接已创建');
    } catch {
      if (alive.current) {setError('订阅链接操作未完成，请重新读取状态后再试。'); notify.error('订阅链接操作未完成，请重新读取状态后再试。');}
    } finally {inFlight.current = false; if (alive.current) setBusy(false);}
  }
  async function copy() {
    if (!data?.url) return;
    try {await navigator.clipboard.writeText(data.url); notify.success('已复制');}
    catch {notify.error('复制失败，请点击“显示”后手动复制链接。');}
  }
  const glass = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = glass.current, token = data?.url?.match(/[?&]token=([^&#]*)/)?.[1];
    if (!element || token === undefined) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = getComputedStyle(element).font;
      element.style.width = `${context.measureText(token).width}px`;
    };
    measure();
    document.fonts.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {active = false; window.removeEventListener('resize', measure);};
  }, [data?.url, shown]);
  const masked = maskedSubscription(data?.url);
  return <section className="elec-rss" aria-labelledby="elec-rss-title" aria-busy={busy}>
    <div className="elec-rss-head"><h2 id="elec-rss-title">私密 RSS 订阅</h2><span>仅你可见</span></div>
    <p className="elec-rss-description">每天早晚更新，实际到达时间取决于阅读器刷新频率。链接包含私人电量信息，请勿公开分享。</p>
    <div className="elec-rss-controls">
      {shown && data?.url ? <input className="elec-rss-input" aria-label="订阅地址" readOnly autoComplete="off" spellCheck={false} value={data.url} onFocus={event => event.target.select()}/> : <div className="elec-rss-input elec-rss-masked" role="textbox" aria-readonly="true" aria-label={data?.url ? '订阅地址，令牌已遮挡' : '尚无可用订阅链接'} tabIndex={0}><span>{masked.before}</span><span ref={glass} className="elec-token-glass" aria-hidden="true"><span>{masked.mask}</span></span><span>{masked.after}</span></div>}
      <button className="elec-button" type="button" disabled={!data?.url || busy} aria-pressed={shown} onClick={() => setShown(value => !value)}>{shown ? '隐藏' : '显示'}</button>
      {data?.url ? <button className="elec-button elec-button-solid" type="button" disabled={busy} onClick={copy}>复制订阅链接</button> : <button className="elec-button elec-button-solid" type="button" disabled={busy || !data || data.resetRequired} onClick={() => request('create')}>创建订阅链接</button>}
    </div>
    {busy && <p className="elec-rss-message" role="status">正在读取订阅状态…</p>}
    {error && <div className="elec-rss-message" role="alert"><span>{error}</span><button className="elec-button" disabled={busy} onClick={() => request('read')}>重新读取</button></div>}
    {data?.resetRequired && <p className="elec-rss-message">订阅密钥已变更，请重置链接后重新订阅。</p>}
    {(data?.url || data?.resetRequired) && <button className="elec-rss-reset" type="button" disabled={busy} onClick={() => request('reset')}>重置订阅链接</button>}
  </section>;
}
