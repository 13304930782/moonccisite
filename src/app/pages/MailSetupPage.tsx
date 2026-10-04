import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeading, SitePage } from '../components/ContentUI';
import config from '../../../server/src/config/mail-client.json';
import '../../styles/mail-setup.css';

function emailAddress(value: string) {
  const parts = value.split('@');
  if (value.length > 254 || /[\x00-\x20\x7f]/.test(value) || parts.length !== 2 || parts[1].toLowerCase() !== config.domain || parts[0].length > 64 || !new RegExp(config.localPartPattern).test(parts[0])) return '';
  return `${parts[0]}@${config.domain}`;
}
export default function MailSetupPage() {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(() => emailAddress(searchParams.get('email') || '')), [status, setStatus] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [download, setDownload] = useState('');
  const [fallback, setFallback] = useState('');
  const manualCopy = useRef<HTMLTextAreaElement>(null), controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (fallback) { manualCopy.current?.focus(); manualCopy.current?.select(); } }, [fallback]);
  useEffect(() => { if (!download) return; const timer = window.setTimeout(() => { setDownload(''); setStatus('下载链接已过期，请重新生成。'); }, 110000); return () => clearTimeout(timer); }, [download]);
  const email = emailAddress(input);
  const invalid = input !== '' && !email;
  const parameters = `${config.displayName}\n邮箱 / IMAP 与 SMTP 用户名：${email}\nIMAP：${config.imap.host}\n端口：${config.imap.port}\n加密：SSL/TLS（隐式 TLS）\nSMTP：${config.smtp.host}\n端口：${config.smtp.port}\n加密：STARTTLS（必须升级 TLS 后认证）\nSMTP 需要认证：是\n密码：在邮件客户端填写自己的邮箱密码`;
  async function copy(value: string) {
    setFallback('');
    try { await navigator.clipboard.writeText(value); setStatus('已复制。'); }
    catch { setFallback(value); setStatus('自动复制未获允许，请在下方选中的文本中长按复制，或按 Ctrl/Cmd + C。'); }
  }
  async function generate() {
    if (!email) { setError('请输入有效的 @mooncci.site 完整邮箱地址。'); return; }
    setBusy(true); setError(''); setDownload('');
    const request = new AbortController(); controller.current = request;
    const timer = window.setTimeout(() => request.abort(), 15000);
    try {
      const response = await fetch('/api/mail-setup/profile', { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: request.signal,
        headers: { 'Content-Type': 'text/plain', 'X-Requested-With': 'XMLHttpRequest' }, body: email });
      if (!response.ok) throw new Error('暂时无法生成配置。请重试，或使用下方手动设置。');
      const result = await response.json();
      if (typeof result.download !== 'string' || !/^\/api\/mail-setup\/profile\/[a-f0-9]{64}\.mobileconfig$/.test(result.download)) throw new Error('下载服务返回异常，请使用手动设置。');
      setDownload(result.download); setStatus('配置已生成，请点击下载；链接约两分钟内有效。');
    } catch (e) { setError(e instanceof Error && e.name !== 'AbortError' ? e.message : '生成超时或已取消，请重试。'); }
    finally { clearTimeout(timer); setBusy(false); }
  }
  return <SitePage narrow>
    <PageHeading eyebrow="mooncci / Mail" title="在熟悉的客户端，收发邮件。">
      <p>配置已有的 {config.displayName} 邮箱。这里不会创建账号，也不会验证邮箱是否存在。</p>
    </PageHeading>
    <div className="mail-setup">
      <section aria-labelledby="mail-address-heading">
        <h2 id="mail-address-heading">你的邮箱</h2>
        <label htmlFor="mail-address">完整邮箱地址</label>
        <input id="mail-address" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254}
          placeholder="mooncci@mooncci.site" value={input} disabled={busy} aria-invalid={invalid} aria-describedby="mail-address-help"
          onChange={e => { setInput(e.target.value); setDownload(''); setStatus(''); setError(''); setFallback(''); }} />
        <p id="mail-address-help" className="muted">仅支持 @{config.domain}。保留 @ 前的大小写和字符；不支持带引号或国际化地址。不收集密码，不保存到网站账号、浏览器存储或分析事件。只有生成 Apple 配置时才会提交邮箱，并短暂保留在服务内存中。</p>
        {invalid && <p role="alert">请输入有效的 @mooncci.site 完整邮箱地址；不支持其他域名或空格。</p>}
      </section>
      <section aria-labelledby="mail-parameters-heading">
        <h2 id="mail-parameters-heading">连接参数</h2>
        <div className="mail-server-grid">
          {[['IMAP · 收件', config.imap, 'SSL/TLS（隐式 TLS）'], ['SMTP · 发件', config.smtp, 'STARTTLS（必须升级 TLS）']].map(([title, settings, tls]) => {
            const server = settings as typeof config.imap;
            return <div className="mail-server" key={String(title)}><h3>{String(title)}</h3><dl>
              <dt>服务器</dt><dd>{server.host}</dd><dt>端口</dt><dd>{server.port}</dd><dt>加密</dt><dd>{String(tls)}</dd>
              <dt>认证</dt><dd>自己的邮箱密码（仅在 TLS 保护下）</dd></dl>
              <button className="quiet-button" onClick={() => copy(server.host)}>复制{String(title).startsWith('IMAP') ? '收件' : '发件'}服务器</button>
            </div>;
          })}
        </div>
        <p>收发件用户名：<strong className="mail-username">{email || '你自己的完整邮箱地址'}</strong>。SMTP 必须认证，密码与收件相同。</p>
        <div className="inline-actions"><button className="quiet-button" disabled={!email} onClick={() => copy(email)}>复制用户名</button><button className="quiet-button" disabled={!email} onClick={() => copy(parameters)}>复制整套参数</button></div>
        <p role="status" aria-live="polite">{status}</p>
        {fallback && <textarea aria-label="手动复制内容" ref={manualCopy} value={fallback} readOnly rows={8} />}
      </section>
      <section aria-labelledby="mail-clients-heading">
        <h2 id="mail-clients-heading">按客户端设置</h2>
        <details open><summary>Thunderbird</summary><ol><li>选择添加已有邮件账户，填写自己的姓名、完整邮箱和密码。</li><li>继续后检查发现的参数是否与上表一致。自动发现尚未可用或失败时，选择手动配置。</li><li>IMAP 选择 SSL/TLS，SMTP 选择 STARTTLS；认证方式选择“普通密码”。普通密码认证必须在 TLS 加密连接内进行。</li></ol></details>
        <details open><summary>Apple 自带“邮件”</summary>
          <p>可下载未签名的配置描述文件，仅配置 Apple 自带邮件，不会配置 Gmail App。文件不含密码、证书、MDM、VPN 或代理。</p>
          <ol><li>填写上方邮箱，生成并下载描述文件。iPhone / iPad 请用 Safari 打开本页。</li><li>系统询问时允许下载，再到“设置”中打开“已下载描述文件”（或“通用 → VPN 与设备管理”），查看内容并自行确认安装。</li><li>在系统安装或邮件设置中填写自己的邮箱密码。macOS 在系统设置中确认描述文件安装。</li><li>核对收件 {config.imap.port}、发件 {config.smtp.port} 且启用 SSL；SMTP 应先完成 STARTTLS 再认证。不要接受不安全连接或证书警告。</li></ol>
          <p className="muted">iPhone 实机安装与 STARTTLS 行为待验收。若系统不接受下载或配置，请按连接参数手动添加“其他”邮件账户。</p>
          <div className="inline-actions"><button className="quiet-button" disabled={!email || busy} onClick={generate}>{busy ? '正在生成…' : '生成 Apple 配置'}</button>
            {download && <a className="quiet-button" href={download} referrerPolicy="no-referrer">下载未签名描述文件</a>}</div>
          {error && <p role="alert">{error}</p>}
        </details>
        <details open><summary>Gmail · iOS / Android</summary><ol><li>点击头像 → 添加其他账户 → 其他（IMAP）。界面名称可能随版本变化。</li><li>填写完整邮箱及自己的邮箱密码，手动设置收件服务器 {config.imap.host}，端口 {config.imap.port}，SSL/TLS。</li><li>发件服务器填 {config.smtp.host}，端口 {config.smtp.port}，STARTTLS；启用身份验证，用户名填完整邮箱。</li></ol><p>不保证 Gmail 读取 Mozilla Autoconfig。用户已实测上述参数可添加账户，不代表所有版本都已验证。</p></details>
        <details><summary>Outlook 与其他客户端</summary><p>如果客户端支持普通 IMAP，可按上表手动配置。本功能不提供 Exchange / Autodiscover，不承诺自动发现。</p></details>
      </section>
    </div>
  </SitePage>;
}
