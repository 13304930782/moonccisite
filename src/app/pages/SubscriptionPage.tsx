import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { PageHeading, SitePage } from '../components/ContentUI';
export default function SubscriptionPage() {
  const { action } = useParams();
  const [token] = useState(() => window.location.hash.slice(1));
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [message, setMessage] = useState('');
  const valid = ['confirm', 'unsubscribe'].includes(action || '') && /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    history.replaceState(null, '', window.location.pathname);
  }, []);
  async function submit() {
    setBusy(true);
    try {
      const r = await api(`/subscriptions/${action}`, {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setMessage(r.message);
      setDone(true);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SitePage narrow>
      <PageHeading eyebrow="NEWSLETTER" title={action === 'confirm' ? '确认订阅' : '取消订阅'} />
      {!valid ? (
        <p>链接无效或不完整，请从邮件中重新打开。</p>
      ) : (
        <>
          <p className="muted">
            {action === 'confirm'
              ? '确认后，每周一有新内容时会收到一封摘要。'
              : '确认后将停止接收后续周报。'}
          </p>
          <button className="quiet-button" disabled={busy || done} onClick={submit}>
            {done ? '已完成' : busy ? '正在处理…' : action === 'confirm' ? '确认订阅' : '确认退订'}
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </SitePage>
  );
}
