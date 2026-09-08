import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import { api } from '../lib/api';
import { safeImageSrc } from '../lib/safeUrl';
import { MarkdownContent } from '../components/MarkdownContent';
import '../../styles/site-settings.css';
import { AdminWeatherCompanionSettings } from '../components/AdminWeatherCompanionSettings';

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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
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
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    onBusy(true);
    onError('');
    try {
      const body = new FormData();
      body.append('image', file);
      const response = await fetch('/api/upload/image', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '图片上传失败');
      onChange(result.url);
    } catch (error: any) {
      onError(error.message || '图片上传失败，请重试');
    } finally {
      setUploading(false);
      onBusy(false);
    }
  }
  return (
    <div className="settings-image">
      <div className="settings-image-preview">
        {safeImageSrc(value) ? (
          <img src={safeImageSrc(value)} alt={`${label}预览`} />
        ) : (
          <span>未设置</span>
        )}
      </div>
      <div>
        <Field label={`${label}地址`} value={value} onChange={onChange} />
        <div className="settings-image-actions">
          <label className="settings-upload">
            <UploadCloud size={16} />
            {uploading ? '上传中…' : `上传${label}`}
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
              清除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export default function AdminSiteSettingsPage() {
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
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [site, current] = await Promise.all([
        api('/settings/site'),
        api('/now'),
      ]);
      setBrand(site.brand);
      setFooter(site.footer);
      setHero({
        ...site.hero,
        title:
          site.hero.title ||
          `${site.hero.title_before || ''}${site.hero.title_highlight || ''}${site.hero.title_after || ''}`,
        eyebrow: site.hero.eyebrow ?? 'mooncci / 个人技术手记',
      });
      setNow(current);
    } catch (e: any) {
      setError(e.message || '站点设置加载失败');
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
    try {
      if (section === 'now') {
        await api('/admin/now', {
          method: 'PUT',
          body: JSON.stringify({ content: now.content }),
        });
        setNow(await api('/now'));
      } else {
        const result = await api('/settings/site', {
          method: 'PUT',
          body: JSON.stringify({
            [section]: ({ brand, hero, footer } as any)[section],
          }),
        });
        if (section === 'brand') setBrand(result.brand);
        if (section === 'hero') setHero(result.hero);
        if (section === 'footer') setFooter(result.footer);
        window.dispatchEvent(new Event('site-settings-updated'));
      }
      setMessages((prev) => ({
        ...prev,
        [section]: '已保存，刷新公开页面即可看到。',
      }));
    } catch (e: any) {
      setMessages((prev) => ({
        ...prev,
        [section]: e.message || '保存失败，请重试',
      }));
    } finally {
      setSaving('');
    }
  }
  function section(
    id: string,
    title: string,
    description: string,
    content: ReactNode,
  ) {
    return (
      <form id={id} className="settings-section" onSubmit={(e) => save(e, id)}>
        <div className="settings-section-heading">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <fieldset disabled={loading || !!error || !!saving || uploading}>
          {content}
          <div className="settings-save">
            <button className="button-primary" type="submit">
              {saving === id ? '保存中…' : `保存${title}`}
            </button>
            <span role="status">{messages[id]}</span>
          </div>
        </fieldset>
      </form>
    );
  }
  if (loading || error)
    return (
      <div className="site-settings-page">
        <h1 className="admin-title">站点设置</h1>
        {loading ? (
          <p role="status">正在读取设置…</p>
        ) : (
          <div role="alert">
            <p>{error}</p>
            <button className="quiet-button" onClick={load}>
              重新加载
            </button>
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
    <div className="site-settings-page">
      <header className="settings-heading">
        <div>
          <p className="eyebrow">mooncci / 网站管理</p>
          <h1 className="admin-title">站点设置</h1>
          <p className="muted">
            管理访客实际看到的标识、首页介绍与页脚。各区域单独保存。
          </p>
        </div>
        <Link className="text-link" to="/" target="_blank">
          查看网站 ↗
        </Link>
      </header>
      <nav className="settings-nav" aria-label="设置分区">
        <a href="#weather-companion">天气小球</a>
        <a href="#brand">站点标识</a>
        <a href="#hero">首页介绍</a>
        <a href="#now">当前近况</a>
        <a href="#footer">页脚与备案</a>
      </nav>
      {loading && <p role="status">正在读取设置…</p>}
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={load}>
            重新加载
          </button>
        </p>
      )}
      {messages.upload && <p role="alert">{messages.upload}</p>}
      {section(
        'brand',
        '站点标识',
        '品牌文字固定为 mooncci。保留导航 Logo 和浏览器图标的独立设置。',
        <>
          <Field
            label="浏览器默认标题"
            value={brand.site_title}
            onChange={(v) => setBrand({ ...brand, site_title: v })}
            required
          />
          <ImageSetting
            label="网站 Logo"
            value={brand.logo_url}
            onChange={(v) => setBrand({ ...brand, logo_url: v })}
            {...imageProps}
          />
          <ImageSetting
            label="网页图标"
            value={brand.favicon_url}
            onChange={(v) => setBrand({ ...brand, favicon_url: v })}
            {...imageProps}
          />
          <p className="settings-hint">
            支持 PNG、JPG、WebP、GIF、ICO。上传后保存本区域；清除 Logo
            后导航显示文字，清除网页图标后恢复浏览器默认显示。
          </p>
        </>,
      )}
      {section(
        'hero',
        '首页介绍',
        '对应首页左侧的简短介绍。标题使用一段完整文字，不再拆分高亮词。',
        <>
          <Field
            label="顶部说明"
            value={hero.eyebrow}
            onChange={(v) => setHero({ ...hero, eyebrow: v })}
          />
          <Field
            label="首页标题"
            value={hero.title}
            onChange={(v) => setHero({ ...hero, title: v })}
            required
          />
          <Field
            label="介绍正文"
            value={hero.subtitle}
            onChange={(v) => setHero({ ...hero, subtitle: v })}
            multiline
          />
          <div className="settings-two-columns">
            <Field
              label="第一入口文字"
              value={hero.primary_text}
              onChange={(v) => setHero({ ...hero, primary_text: v })}
            />
            <Field
              label="第一入口地址"
              value={hero.primary_link}
              onChange={(v) => setHero({ ...hero, primary_link: v })}
              hint="站内地址如 /articles，或完整 HTTPS 链接。"
            />
            <Field
              label="第二入口文字"
              value={hero.secondary_text}
              onChange={(v) => setHero({ ...hero, secondary_text: v })}
            />
            <Field
              label="第二入口地址"
              value={hero.secondary_link}
              onChange={(v) => setHero({ ...hero, secondary_link: v })}
            />
          </div>
          <p className="settings-hint">入口文字留空可隐藏对应链接。</p>
          <details className="settings-preview">
            <summary>预览介绍文字</summary>
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
        '当前近况',
        '对应首页右侧“正在做什么”。短动态的独立发布仍在“近况与动态”中管理。',
        <>
          <label className="settings-field">
            <span>正在做什么</span>
            <textarea
              aria-label="正在做什么"
              rows={4}
              maxLength={2000}
              value={now.content}
              onChange={(e) => setNow({ ...now, content: e.target.value })}
            />
            <small>支持 Markdown，最多 2000 字。留空时首页显示默认提示。</small>
          </label>
          {now.updated_at && (
            <p className="settings-hint">
              上次更新：
              {new Date(now.updated_at).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })}
              （北京时间）
            </p>
          )}
          {now.content && (
            <details className="settings-preview">
              <summary>预览当前近况</summary>
              <MarkdownContent content={now.content} />
            </details>
          )}
        </>,
      )}
      {section(
        'footer',
        '页脚与备案',
        '分别设置版权、备案文字和跳转地址。公安备案图标可继续上传替换。',
        <>
          <Field
            label="版权文字"
            value={footer.copyright}
            onChange={(v) => setFooter({ ...footer, copyright: v })}
          />
          <div className="settings-two-columns">
            <Field
              label="ICP备案号"
              value={footer.icp_text}
              onChange={(v) => setFooter({ ...footer, icp_text: v })}
            />
            <Field
              label="ICP备案链接"
              value={footer.icp_url}
              onChange={(v) => setFooter({ ...footer, icp_url: v })}
            />
            <Field
              label="公安备案号"
              value={footer.police_text}
              onChange={(v) => setFooter({ ...footer, police_text: v })}
            />
            <Field
              label="公安备案链接"
              value={footer.police_url}
              onChange={(v) => setFooter({ ...footer, police_url: v })}
            />
          </div>
          <ImageSetting
            label="公安备案图标"
            value={footer.police_icon_url}
            onChange={(v) => setFooter({ ...footer, police_icon_url: v })}
            {...imageProps}
          />
          <p className="settings-hint">
            备案文字留空可隐藏该项。图标地址留空时使用现有警徽。
          </p>
        </>,
      )}
      <AdminWeatherCompanionSettings />
    </div>
  );
}
