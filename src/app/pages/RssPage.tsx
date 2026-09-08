import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { PageHeading, SitePage } from '../components/ContentUI';
import '../../styles/rss.css';

export default function RssPage() {
  const [feedUrl, setFeedUrl] = useState(''),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false),
    [copyMessage, setCopyMessage] = useState('');
  const address = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setFeedUrl('');
    // Use the feed's SITE_URL-generated canonical address; browser requests stay relative.
    fetch('/api/feed.xml', {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('订阅源暂时无法读取');
        const xml = new DOMParser().parseFromString(
          await response.text(),
          'application/xml',
        );
        if (
          xml.querySelector('parsererror') ||
          xml.documentElement.tagName !== 'rss'
        )
          throw new Error('订阅源格式暂时异常');
        const link = Array.from(
          xml.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link'),
        ).find((node) => node.getAttribute('rel') === 'self');
        const canonical = new URL(link?.getAttribute('href') || '');
        if (
          !['http:', 'https:'].includes(canonical.protocol) ||
          canonical.username ||
          canonical.password
        )
          throw new Error('订阅地址暂时不可用');
        if (!controller.signal.aborted) setFeedUrl(canonical.href);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || '订阅源暂时无法读取');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setCopyMessage('订阅地址已复制，可以粘贴到 RSS 阅读器中。');
    } catch {
      address.current?.focus();
      address.current?.select();
      setCopyMessage(
        '浏览器未允许自动复制，地址已选中，请长按或使用 Ctrl/Cmd + C 复制。',
      );
    }
  }
  return (
    <SitePage narrow>
      <PageHeading eyebrow="mooncci / RSS" title="用你习惯的方式，关注更新。">
        <p>
          RSS 是网站的更新订阅源。把地址添加到 RSS 阅读器，就能在同一个地方阅读
          mooncci 的文章、近况和作品版本更新。
        </p>
      </PageHeading>
      <section className="rss-section" aria-labelledby="rss-address-heading">
        <h2 id="rss-address-heading">订阅地址</h2>
        <p className="muted">无需注册账号，也不需要填写邮箱。</p>
        {loading ? (
          <p className="quiet-state" role="status">
            正在读取订阅地址…
          </p>
        ) : error ? (
          <div className="quiet-state" role="alert">
            <p>{error}，请稍后重试。</p>
            <button
              className="quiet-button"
              onClick={() => setVersion((v) => v + 1)}
            >
              重试
            </button>
          </div>
        ) : (
          <>
            <div className="rss-address">
              <input
                aria-label="RSS 订阅地址"
                ref={address}
                readOnly
                value={feedUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="quiet-button" onClick={copyAddress}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? '已复制' : '复制地址'}
              </button>
            </div>
            <p className="rss-copy-status muted" role="status">
              {copyMessage}
            </p>
          </>
        )}
      </section>
      <section className="rss-section" aria-labelledby="rss-how-heading">
        <h2 id="rss-how-heading">怎么使用</h2>
        <ol className="rss-steps">
          <li>复制上面的订阅地址。</li>
          <li>打开你使用的 RSS 阅读器，选择“添加订阅”或“添加订阅源”。</li>
          <li>粘贴地址并确认，阅读器便会定期获取网站更新。</li>
        </ol>
      </section>
      <section className="rss-section" aria-labelledby="rss-source-heading">
        <h2 id="rss-source-heading">为什么原来的页面是一串代码？</h2>
        <p className="muted">
          那是供阅读器读取的 XML 数据，属于 RSS
          的正常格式。日常阅读可以使用阅读器，也可以直接浏览网站的更新列表。
        </p>
        <div className="inline-actions">
          <Link className="text-link" to="/updates">
            浏览最近更新 ↗
          </Link>
          <a className="text-link" href="/api/feed.xml">
            查看原始 RSS（XML） ↗
          </a>
        </div>
      </section>
    </SitePage>
  );
}
