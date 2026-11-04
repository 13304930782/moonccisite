import {useLocale} from '../context/LocaleContext';
import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { useEffect, useRef, useState } from 'react';

import {Link} from '../components/LocaleLink';
import { Copy, Check } from 'lucide-react';
import { PageHeading, SitePage } from '../components/ContentUI';
import '../../styles/rss.css';

export default function RssPage() {
  const { t } = useI18n();
  const {contentLocale}=useLocale();
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
    const timer = setTimeout(() => { controller.abort(); setError(t("m_da7077108c")); setLoading(false); }, 20000);
    setLoading(true);
    setError('');
    setFeedUrl('');
    // Use the feed's SITE_URL-generated canonical address; browser requests stay relative.
    fetch('/api/feed.xml'+(contentLocale==='en'?'?locale=en':''), {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("m_b3d3641a18"));
        const xml = new DOMParser().parseFromString(
          await response.text(),
          'application/xml',
        );
        if (
          xml.querySelector('parsererror') ||
          xml.documentElement.tagName !== 'rss'
        )
          throw new Error(t("m_c66951e869"));
        const link = Array.from(
          xml.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link'),
        ).find((node) => node.getAttribute('rel') === 'self');
        const canonical = new URL(link?.getAttribute('href') || '');
        if (
          !['http:', 'https:'].includes(canonical.protocol) ||
          canonical.username ||
          canonical.password
        )
          throw new Error(t("m_b1be889b06"));
        if (!controller.signal.aborted) setFeedUrl(canonical.href);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || t("m_b3d3641a18"));
      })
      .finally(() => {
        clearTimeout(timer);
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => { clearTimeout(timer); controller.abort(); };
  }, [version,contentLocale]);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      notify.success(t("m_0e8f75f9a7"));
    } catch {
      address.current?.focus();
      address.current?.select();
      setCopyMessage(
        t("m_44a9924f3f"),
      ); notify.error(t("m_44a9924f3f"));
    }
  }
  return (
    <SitePage narrow>
      <PageHeading eyebrow="mooncci / RSS" title={t("m_a4d1f8d11c")}>
        <p>
           {t("m_6db56c5d71")} </p>
      </PageHeading>
      <section className="rss-section" aria-labelledby="rss-address-heading">
        <h2 id="rss-address-heading">{t("m_efde7b1871")}</h2>
        <p className="muted">{t("m_d605f67b48")}</p>
        {loading ? (
          <p className="quiet-state" role="status">
             {t("m_686109dc16")} </p>
        ) : error ? (
          <div className="quiet-state" role="alert">
            <p>{t(error || '')}{t("m_3ae5530c0a")}</p>
            <button
              className="quiet-button"
              onClick={() => setVersion((v) => v + 1)}
            >
               {t("m_b8784c8dd5")} </button>
          </div>
        ) : (
          <>
            <div className="rss-address">
              <input
                aria-label={t("m_cba0fce643")}
                ref={address}
                readOnly
                value={feedUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="quiet-button" onClick={copyAddress}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? t("m_8f6f8d979c") : t("m_4c6de01bbe")}
              </button>
            </div>
            <p className="rss-copy-status muted" role="status">
              {copyMessage}
            </p>
          </>
        )}
      </section>
      <section className="rss-section" aria-labelledby="rss-how-heading">
        <h2 id="rss-how-heading">{t("m_d5ca9e5562")}</h2>
        <ol className="rss-steps">
          <li>{t("m_4423a9041e")}</li>
          <li>{t("m_f8155b2a1a")}</li>
          <li>{t("m_9ca9109e73")}</li>
        </ol>
      </section>
      <section className="rss-section" aria-labelledby="rss-source-heading">
        <h2 id="rss-source-heading">{t("m_e1032454ad")}</h2>
        <p className="muted">
           {t("m_20c0e28dfb")} </p>
        <div className="inline-actions">
          <Link className="text-link" to="/updates">
             {t("m_df3a977ec0")} </Link>
          <a className="text-link" href="/api/feed.xml">
             {t("m_712fc80fea")} </a>
        </div>
      </section>
    </SitePage>
  );
}
