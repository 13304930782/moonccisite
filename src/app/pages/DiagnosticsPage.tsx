import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SitePage } from '../components/ContentUI';
import { clearDiagnostics, diagnosticState, exportDiagnostics, startDiagnostics, stopDiagnostics, subscribeDiagnostics } from '../lib/browserDiagnostics';
import '../../styles/diagnostics.css';

export default function DiagnosticsPage() {
  const [, update] = useState(0);
  const [mode, setMode] = useState<'relay-on' | 'relay-off' | 'unknown'>('relay-on');
  const [notice, setNotice] = useState('');
  useEffect(() => subscribeDiagnostics(() => update(n => n + 1)), []);
  const session = diagnosticState();
  function download() {
    const url = URL.createObjectURL(new Blob([exportDiagnostics()], { type:'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `mooncci-diagnostics-${session?.mode || 'unknown'}-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000); setNotice('诊断文件已导出。分享前可以打开检查内容。');
  }
  return <SitePage narrow><section className="diagnostics-page">
    <header><p className="eyebrow">mooncci / 访问诊断</p><h1>记录一次慢访问</h1><p className="muted">主动开启后，记录当前标签页的加载耗时。20 分钟后自动停止，不会自动上传诊断报告。</p></header>
    <div className="diagnostics-panel">
      <label htmlFor="diagnostic-mode">这次访问的网络设置</label>
      <select id="diagnostic-mode" value={mode} disabled={session?.active} onChange={event => setMode(event.target.value as typeof mode)}>
        <option value="relay-on">已开启 iCloud 私密转送</option><option value="relay-off">已关闭 iCloud 私密转送（对照）</option><option value="unknown">其他网络 / 不确定</option>
      </select>
      <p className="muted">网站无法读取 Safari 的私密转送开关，请按实际设置选择。不会记录邮件正文、密码、验证码或完整访问网址。</p>
      <div className="diagnostics-actions">
        <button className="quiet-button" disabled={session?.active} onClick={() => { startDiagnostics(mode); setNotice('记录已开始，请在当前标签页打开下面的页面。'); }}>开始新记录</button>
        <button className="quiet-button" disabled={!session?.active} onClick={stopDiagnostics}>停止记录</button>
        <button className="quiet-button" disabled={!session?.rows.length} onClick={download}>导出脱敏报告</button>
        <button className="quiet-button" disabled={!session} onClick={() => { clearDiagnostics(); setNotice('当前标签页的诊断记录已清除。'); }}>清除记录</button>
      </div>
      <p role="status">{session?.active ? '正在记录' : '记录已停止'} · {session?.rows.length || 0} 条{session?.active && ` · ${new Date(session.expires).toLocaleTimeString()} 自动停止`}</p>
      {notice && <p role="status">{notice}</p>}
    </div>
    <div className="diagnostics-panel"><h2>在当前标签页测试</h2>
      <p>依次打开首页、文章和邮箱，像平时一样等待内容出现。测试结束后，使用浏览器后退或重新打开此地址导出报告。切换网络设置前请先导出，再开始新记录。</p>
      <nav className="diagnostics-actions" aria-label="诊断测试页面"><Link to="/">首页</Link><Link to="/articles">文章列表</Link><Link to="/projects">作品</Link><Link to="/account/mailbox">我的邮箱</Link></nav>
      <p className="muted">不要为了测速重复发送真实邮件。浏览器未提供的计时不会被解释为服务器耗时为零。</p>
    </div>
    {!!session?.rows.length && <div className="diagnostics-panel"><h2>最近记录</h2><ol className="diagnostics-records">{session.rows.slice(-20).reverse().map((row, i) => <li key={i}><span>{row.type} · {row.path}</span><strong>{typeof row.duration_ms === 'number' ? `${row.duration_ms} ms` : '界面状态'}</strong></li>)}</ol></div>}
  </section></SitePage>;
}
