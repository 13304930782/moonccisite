import {TranslationFields} from '../components/ContentTranslationEditor';
import { useI18n } from '../i18n';
import { FormEvent, ReactNode, useEffect, useState } from 'react';

import {Link} from '../components/LocaleLink';
import { UploadCloud } from 'lucide-react';
import { api } from '../lib/api';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { safeImageSrc } from '../lib/safeUrl';
import { MarkdownContent } from '../components/MarkdownContent';
import { ArticleMediaPicker } from '../components/ArticleMediaPicker';
import '../../styles/article-workspace.css';
import '../../styles/site-settings.css';
import '../../styles/admin-site-settings.css';
import { AdminWeatherCompanionSettings } from '../components/AdminWeatherCompanionSettings';
import { AdminDailyQuestions } from '../components/AdminDailyQuestions';

const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico';
function Field({
  label,
  value,
  onChange,
  multiline = false,
  hint,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          aria-label={label}
          rows={3}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      ) : (
        <input
          aria-label={label}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function ImageSetting({
  label,
  value,
  onChange,
  onBusy,
  onError,
  onChoose,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
  onChoose?: () => void;
}) {
  const { locale,  t } = useI18n();
  const [uploading, setUploading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    onBusy(true);
    onError('');
    try {
      const body = new FormData();
      body.append('image', file);
      const result = await api('/upload/image', { method: 'POST', body });
      onChange(result.url);
    } catch (error: any) {
      onError(error.message || t("m_8a09ac140a"));
    } finally {
      setUploading(false);
      onBusy(false);
    }
  }
  return (
    <div className="settings-image">
      <div className="settings-image-preview">
        {safeImageSrc(value) ? (
          <img src={safeImageSrc(value)} alt={t("m_38eaa526a2", {v0: label})} />
        ) : (
          <span>{t("m_2f5f1d6fbf")}</span>
        )}
      </div>
      <div>
        <Field label={t("m_93f2a601fb", {v0: label})} value={value} onChange={onChange} />
        <div className="settings-image-actions">
          {onChoose && <button type="button" className="quiet-button" onClick={onChoose}>{t("m_b1a53ac1d4")}</button>}
          <label className="settings-upload">
            <UploadCloud size={16} />
            {uploading ? t("m_ce1c9d6156") : t("m_65d605c180", {v0: label})}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={uploading}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              className="text-link"
              onClick={() => onChange('')}
            >
               {t("m_bce2377283")} </button>
          )}
        </div>
      </div>
    </div>
  );
}
export default function AdminSiteSettingsPage() {
  const { locale,  t } = useI18n();
  const sectionIds = ['brand', 'hero', 'now', 'footer', 'weather-companion'];
  const hashSection = () => {
    const id = typeof window === 'undefined' ? '' : window.location?.hash?.slice(1);
    return id && sectionIds.includes(id) ? id : 'brand';
  };
  const [activeSection, setActiveSection] = useState(hashSection);
  useEffect(() => {
    const updateSection = () => setActiveSection(hashSection());
    window.addEventListener('hashchange', updateSection);
    return () => window.removeEventListener('hashchange', updateSection);
  }, []);
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);
  const [brand, setBrand] = useState<any>({});
  const [hero, setHero] = useState<any>({});
  const [footer, setFooter] = useState<any>({});
  const [now, setNow] = useState({
    content: '',
    updated_at: null as string | null,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [saving, setSaving] = useState(''),
    [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  // Last loaded/saved snapshot per section, so unsaved edits can be flagged and protected.
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const snapshot = (id: string, value: any) => JSON.stringify(id === 'now' ? value?.content ?? '' : value);
  const current: Record<string, any> = { brand, hero, footer, now };
  const dirtySections: Record<string, boolean> = {};
  for (const id of Object.keys(baseline)) dirtySections[id] = baseline[id] !== snapshot(id, current[id]);
  useUnsavedLeave(Object.values(dirtySections).some(Boolean));
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [site, current] = await Promise.all([
        api('/settings/site'),
        api('/now'),
      ]);
      const loadedHero = {
        ...site.hero,
        title:
          site.hero.title ||
          `${site.hero.title_before || ''}${site.hero.title_highlight || ''}${site.hero.title_after || ''}`,
        eyebrow: site.hero.eyebrow ?? t("m_5cd0f9f9f6"),
      };
      setBrand(site.brand);
      setFooter(site.footer);
      setHero(loadedHero);
      setNow(current);
      setBaseline({
        brand: snapshot('brand', site.brand),
        hero: snapshot('hero', loadedHero),
        footer: snapshot('footer', site.footer),
        now: snapshot('now', current),
      });
    } catch (e: any) {
      setError(e.message || t("m_72bfb0e808"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(e: FormEvent, section: string) {
    e.preventDefault();
    setSaving(section);
    setMessages((prev) => ({ ...prev, [section]: '' }));
    setFailed((prev) => ({ ...prev, [section]: false }));
    try {
      let saved: any;
      if (section === 'now') {
        await api('/admin/now', {
          method: 'PUT',
          body: JSON.stringify({ content: now.content }),
        });
        saved = await api('/now');
        setNow(saved);
      } else {
        const result = await api('/settings/site', {
          method: 'PUT',
          body: JSON.stringify({
            [section]: ({ brand, hero, footer } as any)[section],
          }),
        });
        saved = result[section];
        if (section === 'brand') setBrand(result.brand);
        if (section === 'hero') setHero(result.hero);
        if (section === 'footer') setFooter(result.footer);
        window.dispatchEvent(new Event('site-settings-updated'));
      }
      setBaseline((prev) => ({ ...prev, [section]: snapshot(section, saved) }));
      setMessages((prev) => ({
        ...prev,
        [section]: t("m_ef91a88d4a"),
      }));
    } catch (e: any) {
      setFailed((prev) => ({ ...prev, [section]: true }));
      setMessages((prev) => ({
        ...prev,
        [section]: e.message || t("m_f42a1238b4"),
      }));
    } finally {
      setSaving('');
    }
  }
  function discard(section: string) {
    const value = JSON.parse(baseline[section]);
    if (section === 'brand') setBrand(value);
    if (section === 'hero') setHero(value);
    if (section === 'footer') setFooter(value);
    if (section === 'now') setNow(prev => ({ ...prev, content: value }));
    setMessages(prev => ({ ...prev, [section]: '' }));
    setFailed(prev => ({ ...prev, [section]: false }));
  }
  function section(
    id: string,
    title: string,
    description: string,
    content: ReactNode,
  ) {
    return (
      <form id={id} hidden={activeSection !== id} className="settings-section" onSubmit={(e) => save(e, id)}>
        <div className="settings-section-heading">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <fieldset disabled={loading || !!error || !!saving || uploading}>
          {content}
          <div className="settings-save">
            <button className="button-primary" type="submit" disabled={saving === id || !dirtySections[id]}>
              {saving === id ? t("m_ff509c9ba0") : t("m_75b2c33198", {v0: title})}
            </button>
            <button className="quiet-button" type="button" disabled={!dirtySections[id]} onClick={() => discard(id)}>{t("m_ef804eda90")}</button>
            {dirtySections[id] && !saving && <span className="settings-dirty">{t("m_c2277872cd")}</span>}
            <span role={failed[id] ? 'alert' : 'status'} className={failed[id] ? 'settings-error' : undefined}>{messages[id]}</span>
          </div>
        </fieldset>
      </form>
    );
  }
  if (loading || error)
    return (
      <div className="site-settings-page site-settings-editor">
        <h1 className="admin-title">{t("m_f0cac3fe1a")}</h1>
        {loading ? (
          <p role="status">{t("m_9ee6956371")}</p>
        ) : (
          <div role="alert">
            <p>{t(error || '')}</p>
            <button className="quiet-button" onClick={load}>
               {t("m_7bdd5ce1e2")} </button>
          </div>
        )}
      </div>
    );
  const imageProps = {
    onBusy: setUploading,
    onError: (message: string) =>
      setMessages((prev) => ({ ...prev, upload: message })),
  };
  return (
    <div className="site-settings-page site-settings-editor">
      <header className="settings-heading">
        <div>
          <p className="eyebrow">{t("m_0e7e7ca5e5")}</p>
          <h1 className="admin-title">{t("m_f0cac3fe1a")}</h1>
          <p className="muted">
             {t("m_da8c1392f2")} </p>
        </div>
        <Link className="text-link" to="/" target="_blank">
           {t("m_f951dedda9")} </Link>
      </header>
      <nav className="settings-nav" aria-label={t("m_dc0173c408")}>
        {[
          ['brand', t("m_a6939b5922")], ['hero', t("m_3615b0afff")],
          ['now', t("m_9a6c6ad76b")], ['footer', t("m_17cb1bbb81")],
          ['weather-companion', t("m_acf6ef3f39")],
        ].map(([id, label]) => <button key={id} type="button" aria-pressed={activeSection === id} aria-controls={id} onClick={() => setActiveSection(id)}>{label}{dirtySections[id] && <span className="settings-nav-dirty" aria-label={t("m_c2277872cd")} />}</button>)}
      </nav>
      {loading && <p role="status">{t("m_9ee6956371")}</p>}
      {error && (
        <p role="alert">
          {t(error || '')}{' '}
          <button type="button" onClick={load}>
             {t("m_7bdd5ce1e2")} </button>
        </p>
      )}
      {messages.upload && <p role="alert">{messages.upload}</p>}
      {section(
        'brand',
        t("m_a6939b5922"),
        t("m_a7d9936af4"),
        <>
          <Field
            label={t("m_fcd9fbdf52")}
            value={brand.site_title}
            onChange={(v) => setBrand({ ...brand, site_title: v })}
            required
          />
          <ImageSetting
            label={t("m_1b39c2f4f2")}
            value={brand.logo_url}
            onChange={(v) => setBrand({ ...brand, logo_url: v })}
            {...imageProps}
          />
          <ImageSetting
            label={t("m_5c72bd7844")}
            value={brand.favicon_url}
            onChoose={() => setFaviconPickerOpen(true)}
            onChange={(v) => setBrand({ ...brand, favicon_url: v })}
            {...imageProps}
          />
          <p className="settings-hint">
             {t("m_10d932c4bf")} </p>
        </>,
      )}
      {section(
        'hero',
        t("m_3615b0afff"),
        t("m_984b925638"),
        <>
          <Field
            label={t("m_476472359a")}
            value={hero.eyebrow}
            onChange={(v) => setHero({ ...hero, eyebrow: v })}
          />
          <Field
            label={t("m_487422ef0c")}
            value={hero.title}
            onChange={(v) => setHero({ ...hero, title: v })}
            required
          />
          <Field
            label={t("m_14f51b264f")}
            value={hero.subtitle}
            onChange={(v) => setHero({ ...hero, subtitle: v })}
            multiline
          />
          <div className="settings-two-columns">
            <Field
              label={t("m_7893e5d8bf")}
              value={hero.primary_text}
              onChange={(v) => setHero({ ...hero, primary_text: v })}
            />
            <Field
              label={t("m_3a6f2af152")}
              value={hero.primary_link}
              onChange={(v) => setHero({ ...hero, primary_link: v })}
              hint={t("m_6218242668")}
            />
            <Field
              label={t("m_704c0e6020")}
              value={hero.secondary_text}
              onChange={(v) => setHero({ ...hero, secondary_text: v })}
            />
            <Field
              label={t("m_7c85045cce")}
              value={hero.secondary_link}
              onChange={(v) => setHero({ ...hero, secondary_link: v })}
            />
          </div>
          <p className="settings-hint">{t("m_948b688540")}</p>
          <details className="settings-preview">
            <summary>{t("m_6b22eb1a19")}</summary>
            <p className="eyebrow">{hero.eyebrow}</p>
            <h2>{hero.title}</h2>
            <p>{hero.subtitle}</p>
            <div className="inline-actions">
              <span>{hero.primary_text}</span>
              <span>{hero.secondary_text}</span>
            </div>
          </details>
        </>,
      )}
      {section(
        'now',
        t("m_9a6c6ad76b"),
        t("m_c26c2dce70"),
        <>
          <label className="settings-field">
            <span>{t("m_61dcbf65c2")}</span>
            <textarea
              aria-label={t("m_61dcbf65c2")}
              rows={4}
              maxLength={2000}
              value={now.content}
              onChange={(e) => setNow({ ...now, content: e.target.value })}
            />
            <small>{t("m_8d1266ba2a")}</small>
          </label>
          {now.updated_at && (
            <p className="settings-hint">
               {t("m_9280b2937e")} {new Date(now.updated_at).toLocaleString(locale, {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })}
               {t("m_5eb76ad884")} </p>
          )}
          {now.content && (
            <details className="settings-preview">
              <summary>{t("m_6bb4a6fc9f")}</summary>
              <MarkdownContent content={now.content} />
            </details>
          )}
        </>,
      )}
      {section(
        'footer',
        t("m_17cb1bbb81"),
        t("m_877d6420b9"),
        <>
          <Field
            label={t("m_431c6a0a28")}
            value={footer.copyright}
            onChange={(v) => setFooter({ ...footer, copyright: v })}
          />
          <div className="settings-two-columns">
            <Field
              label={t("m_6680f80de2")}
              value={footer.icp_text}
              onChange={(v) => setFooter({ ...footer, icp_text: v })}
            />
            <Field
              label={t("m_7780de5b86")}
              value={footer.icp_url}
              onChange={(v) => setFooter({ ...footer, icp_url: v })}
            />
            <Field
              label={t("m_438315a79b")}
              value={footer.police_text}
              onChange={(v) => setFooter({ ...footer, police_text: v })}
            />
            <Field
              label={t("m_c07fe2fbd8")}
              value={footer.police_url}
              onChange={(v) => setFooter({ ...footer, police_url: v })}
            />
          </div>
          <ImageSetting
            label={t("m_a182fef7bd")}
            value={footer.police_icon_url}
            onChange={(v) => setFooter({ ...footer, police_icon_url: v })}
            {...imageProps}
          />
          <p className="settings-hint">
             {t("m_175acda91b")} </p>
        </>,
      )}
      {faviconPickerOpen && <ArticleMediaPicker
        onClose={() => setFaviconPickerOpen(false)}
        onSelect={(url) => setBrand((current: any) => ({ ...current, favicon_url: url }))}
      />}
      <section id="site-english" hidden={!['brand','hero','footer'].includes(activeSection)} className="site-english-section content-translation">
        <h2 className="settings-translation-title">{t('站点内容 · 英文版')}</h2>
        <TranslationFields type="site" id="1" source={{brand,hero,footer}} visibleGroups={activeSection === 'brand' ? ['brand','profile'] : [activeSection]}/>
      </section>
      <section hidden={activeSection !== 'now'} className="content-translation">
        <h2 className="settings-translation-title">{t('当前近况 · 英文版')}</h2>
        <TranslationFields type="now" id="1" source={now}/>
      </section>
      <div hidden={activeSection !== 'weather-companion'}><AdminWeatherCompanionSettings /><AdminDailyQuestions /></div>
    </div>
  );
}
