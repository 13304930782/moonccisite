import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Mail, CircleAlert } from 'lucide-react';
import '../../styles/workflow-feedback.css';
import { api } from '../lib/api';
import { PageHeading, SitePage } from '../components/ContentUI';
export default function SubscriptionPage() {
  const { action } = useParams();
  const location = useLocation();
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [message, setMessage] = useState('');
  const result = useRef<HTMLHeadingElement>(null);
  const confirming = action === 'confirm';
  const valid = ['confirm', 'unsubscribe'].includes(action || '') && /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    if (!location.hash) return;
    setToken(location.hash.slice(1)); setDone(false); setMessage('');
    history.replaceState(history.state, '', window.location.pathname);
  }, [location.hash]);
  useEffect(() => { if (done) result.current?.focus(); }, [done]);
  async function submit() {
    if (busy || done) return;
    setBusy(true); setMessage('');
    try {
      const r = await api(`/subscriptions/${action}`, { method: 'POST', body: JSON.stringify({ token }) });
      setMessage(r.message); setDone(true);
    } catch (e: any) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <SitePage narrow>
    <div className="workflow-feedback subscription-feedback">
      <PageHeading eyebrow="邮件订阅" title={done ? (confirming ? '订阅成功' : '已取消订阅') : (confirming ? '确认订阅 mooncci 周报' : '取消 mooncci 周报订阅')} />
      {done ? <section className="workflow-result" aria-label="处理结果">
        <CheckCircle2 size={28} aria-hidden="true" />
        <div className="workflow-result-body">
          <h2 ref={result} tabIndex={-1}>{confirming ? '您已成功订阅 mooncci 周报' : '您已取消 mooncci 周报订阅'}</h2>
          <p>{message}</p>
          {confirming && <p>没有新内容时不会发送。每封周报底部都有取消订阅入口，无需登录。</p>}
          <div className="subscription-actions"><Link className="workflow-button workflow-primary" to="/updates">查看最近更新</Link><div className="subscription-actions">{confirming && <Link className="workflow-button workflow-primary" to="/#subscribe">重新申请订阅</Link>}<a className="workflow-button" href="mailto:support@mooncci.site">联系支持</a><Link className="workflow-button" to="/">返回首页</Link></div></div>
        </div>
      </section> : !valid ? <section className="workflow-result" role="alert">
        <CircleAlert size={24} aria-hidden="true" /><div className="workflow-result-body"><h2>链接无效或不完整</h2><p>请从最近一封邮件中重新打开完整链接。需要帮助时，可联系 support@mooncci.site。</p><div className="subscription-actions">{confirming && <Link className="workflow-button workflow-primary" to="/#subscribe">重新申请订阅</Link>}<a className="workflow-button" href="mailto:support@mooncci.site">联系支持</a><Link className="workflow-button" to="/">返回首页</Link></div></div>
      </section> : <section className="workflow-result">
        <Mail size={24} aria-hidden="true" /><div className="workflow-result-body">
          <h2>{confirming ? '文章、近况与作品进展，一封收齐' : '停止接收后续周报'}</h2>
          <p>{confirming ? '每周一北京时间 09:00，有新内容时发送上周摘要。确认后即可订阅，无需注册或登录。' : '退订无需登录，也不会影响你的账号、验证码或其他业务通知。已发出的邮件可能仍会到达。'}</p>
          {message && <p role="alert" className="subscription-error"><CircleAlert size={18} aria-hidden="true" />{message}</p>}{message && confirming && <Link className="workflow-button" to="/#subscribe">重新申请订阅确认邮件</Link>}
          <div className="subscription-actions"><button className="workflow-button workflow-primary" disabled={busy} onClick={submit}>{busy ? '正在处理…' : confirming ? '确认订阅' : '确认取消订阅'}</button><Link className="workflow-button" to="/">{confirming ? '暂不订阅' : '保留订阅并返回首页'}</Link></div>
        </div>
      </section>}
    </div>
  </SitePage>;
}
