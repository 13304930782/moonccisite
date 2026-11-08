import {SiteBack} from '../components/SiteBack';
import { useI18n } from '../i18n';
import {LanguageSwitch} from '../components/LanguageSwitch';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, ImagePlus, Loader2, MoreHorizontal, Pencil, Eye, Settings2, Trash2, Upload, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { usePublishing } from '../lib/usePublishing';
import { useArticleDraft } from '../lib/useArticleDraft';
import type {Locale} from '../lib/locale';
import { api } from '../lib/api';
import { articlePath } from '../lib/articleUrl';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { safeImageSrc } from '../lib/safeUrl';
import { isRichText } from '../lib/richText';
import { stripLegacyAgeNotice } from '../lib/articleAge';
import { coverFrame, effectiveCoverFrame } from '../lib/coverCrop';
import { ArticleEditor } from '../components/ArticleEditor';
import { ArticleRevisionHistory } from '../components/ArticleRevisionHistory';
import { ArticleConflict } from '../components/ArticleConflict';
import { ArticleReview } from '../components/ArticleReview';
import {TagInput} from '../components/TagInput';
import { ArticleMediaPicker } from '../components/ArticleMediaPicker';
import { CoverFramingDialog } from '../components/CoverFramingDialog';
import { CoverImage } from '../components/CoverImage';
import { CoverDisplayPreviews } from '../components/CoverDisplayPreviews';
import { MarkdownContent } from '../components/MarkdownContent';
import { StatusNotice } from '../components/ContentUI';
import { AdminButton } from '../components/admin/AdminButton';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import '../../styles/article-workspace.css';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-writing.css';

type EditorMode = 'visual' | 'source' | 'preview';
const SETTINGS_KEY = 'mooncci-article-settings-collapsed';
function settingsCollapsed() { try { return localStorage.getItem(SETTINGS_KEY) === 'true'; } catch { return false; } }

export default function AdminWritePage() {
  const { id } = useParams();
  const { user } = useAuth();
  return user ? <Workspace key={`${user.id}:${id || 'new'}`} userId={user.id} postId={id} /> : null;
}

function Workspace({ userId, postId }: { userId: number; postId?: string }) {
  const { locale, t} = useI18n();
  const { preference, setLocale, languageError } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const publishing = usePublishing();
  const contributor = publishing && !['owner', 'admin'].includes(user?.role || '');
  const account = location.pathname.startsWith('/account');
  const backTo = account ? '/account/submissions' : '/admin/posts';
  const [editorLocale,setEditorLocale] = useState<Locale>('zh-CN');
  const [englishOpened,setEnglishOpened] = useState(false);
  const chinese = useArticleDraft(userId,postId);
  const sharedPostId = postId || (chinese.draft?.post_id ? String(chinese.draft.post_id) : undefined);
  const english = useArticleDraft(userId,sharedPostId,'en',englishOpened && !!sharedPostId);
  const d = editorLocale === 'en' ? english : chinese;
  const englishVersion = editorLocale === 'en';
  const versionPublished=(englishVersion?d.draft?.translation_status:d.draft?.post_status)==='published';
  const slugReserved = ['archives', 'meta'].includes(String(d.form.slug || '').trim());
  const [published, setPublished] = useState(false);
  const [conflictMode, setConflictMode] = useState<'compare' | 'review' | 'edit'>('compare');
  const [preview, setPreview] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const initializedMode = useRef(false);
  const lastEditMode = useRef<EditorMode>('visual');
  const [picker, setPicker] = useState<'cover' | 'body' | null>(null);
  const [framing, setFraming] = useState<string | null>(null);
  const insert = useRef<(url: string, alt: string) => void>(() => {});
  const [uploadCount, setUploads] = useState(0);
  const [editorPending, setEditorPending] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [quality, setQuality] = useState('medium');
  const uploads = uploadCount + (editorPending ? 1 : 0);
  const [ai, setAi] = useState<any>(null);
  const [tagInput, setTagInput] = useState('');
  const [coverAddress, setCoverAddress] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width:1280px)').matches);
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width:767px)').matches);
  const [collapsed, setCollapsed] = useState(settingsCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [keyboardToolbar, setKeyboardToolbar] = useState<{ top: number; left: number; width: number } | null>(null);
  const completion = useRef<HTMLHeadingElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsClose = useRef<HTMLButtonElement>(null);
  const settingsScroll = useRef<HTMLDivElement>(null);
  const settingsSwipe = useRef<{ x: number; y: number; header: boolean } | null>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const historyOrigin = useRef<HTMLButtonElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [historyHost] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  const historyTitle = useRef<HTMLHeadingElement>(null);
  const reviewState = d.draft?.workflow?.state;
  const locked = publishing && ['submitted', 'approved', 'scheduled'].includes(reviewState);
  const showComparison = !!d.serverCopy && conflictMode === 'compare';
  const fieldsDisabled = !d.ready || locked || !!d.recovery || d.isRestoring || d.summaryBusy;
  const historyDisabled = locked || d.busy || d.blocked || d.isRestoring || uploads > 0;

  useEffect(() => {
    const title = titleInput.current;
    if (!title || preview || locked || showComparison) return;
    const resize = () => { title.style.height = '0px'; title.style.height = `${title.scrollHeight}px`; };
    resize();
    let width = title.clientWidth;
    const observer = new ResizeObserver(() => {
      if (title.clientWidth !== width) { width = title.clientWidth; resize(); }
    });
    observer.observe(title);
    return () => observer.disconnect();
  }, [d.form.title, preview, locked, showComparison]);

  useEffect(() => { api('/article-seo/status').then(setAi).catch(() => setAi({ unavailable: true })); }, []);
  useEffect(() => {
    if (!d.ready || initializedMode.current) return;
    initializedMode.current = true;
    const initial = (postId || d.draft?.payload?.content) && !isRichText(d.form.content) ? 'source' : 'visual';
    setEditorMode(initial); lastEditMode.current = initial;
  }, [d.ready, postId, d.draft, d.form.content]);
  useEffect(() => {
    const large = window.matchMedia('(min-width:1280px)'), small = window.matchMedia('(max-width:767px)');
    const resize = () => { setWide(large.matches); setPhone(small.matches); if (large.matches) setSettingsOpen(false); };
    large.addEventListener('change', resize); small.addEventListener('change', resize);
    return () => { large.removeEventListener('change', resize); small.removeEventListener('change', resize); };
  }, []);
  useEffect(() => {
    const scroll = (!phone && workspace.current?.querySelector('.writing-main')) || workspace.current?.closest('.admin-main') || window;
    const update = () => setScrolled(scroll instanceof HTMLElement ? scroll.scrollTop > 4 : window.scrollY > 4);
    update(); scroll.addEventListener('scroll', update, { passive: true });
    return () => scroll.removeEventListener('scroll', update);
  }, [published, phone]);
  useEffect(() => { if (published) completion.current?.focus(); }, [published]);
  useEffect(() => {
    const viewport = window.visualViewport, host = workspace.current;
    if (!phone || !viewport || !host || preview || locked || showComparison || published) { setKeyboardToolbar(null); return; }
    let baseline = Math.max(window.innerHeight, document.documentElement.clientHeight, Number.isFinite(viewport.height) ? viewport.height : 0), layoutWidth = window.innerWidth, frame = 0, editing = false;
    const update = () => {
      if (layoutWidth !== window.innerWidth) { layoutWidth = window.innerWidth; baseline = Math.max(window.innerHeight, document.documentElement.clientHeight, Number.isFinite(viewport.height) ? viewport.height : 0); }
      const active = document.activeElement;
      editing = active instanceof HTMLElement && host.contains(active) && (active.matches('.article-editor [contenteditable=true],textarea[data-markdown-editor]') || editing && !!active.closest('.editor-toolbar-frame,.article-source-toolbar'));
      if (!editing && Number.isFinite(viewport.height)) baseline = Math.max(baseline, viewport.height);
      const keyboardHeight = baseline - viewport.height - viewport.offsetTop, top = viewport.offsetTop + viewport.height - 44;
      const editor = host.querySelector('.article-editor')?.getBoundingClientRect(), header = host.querySelector('.writing-topbar')?.getBoundingClientRect();
      // Address-bar movement and pinch zoom are not a keyboard; retain normal sticky positioning.
      if (!editing || ![viewport.height, viewport.width, viewport.offsetTop, viewport.offsetLeft, viewport.scale, baseline, keyboardHeight, top].every(Number.isFinite) || viewport.scale !== 1 || viewport.height <= 0 || viewport.width <= 0 || keyboardHeight < 150 || top < (header?.bottom || 56) || !editor) { setKeyboardToolbar(null); return; }
      const left = Math.max(editor.left, viewport.offsetLeft), right = Math.min(editor.right, viewport.offsetLeft + viewport.width);
      if (right <= left) { setKeyboardToolbar(null); return; }
      const next = { top, left, width: right - left };
      setKeyboardToolbar(previous => previous && previous.top === next.top && previous.left === next.left && previous.width === next.width ? previous : next);
      const selection = window.getSelection();
      if (active instanceof HTMLElement && active.isContentEditable && selection?.rangeCount && scroll) {
        const caret = selection.getRangeAt(0).getBoundingClientRect();
        if (caret.height && caret.bottom > top - 8) scroll.scrollBy({ top: caret.bottom - top + 8, behavior: 'instant' });
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const scroll = host.closest('.admin-main') || document.scrollingElement;
    const scrollEvents = host.closest('.admin-main') || window;
    viewport.addEventListener('resize', schedule); viewport.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule); document.addEventListener('focusin', schedule); document.addEventListener('focusout', schedule); document.addEventListener('selectionchange', schedule); scrollEvents.addEventListener('scroll', schedule, { passive: true });
    update();
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener('resize', schedule); viewport.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule); document.removeEventListener('selectionchange', schedule); scrollEvents.removeEventListener('scroll', schedule); };
  }, [phone, preview, locked, showComparison, published]);
  useEffect(() => {
    if (!historyOpen) { historyHost?.querySelector<HTMLButtonElement>('.revision-history > button[aria-expanded="true"]')?.click(); return; }
    // Keep the existing history loader, comparison and guarded restoration flow.
    const frame = requestAnimationFrame(() => {
      historyHost?.querySelector<HTMLButtonElement>('.revision-history > button[aria-expanded="false"]')?.click();
      historyTitle.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [historyOpen, historyHost]);

  const collapseSettings = (value: boolean) => { setCollapsed(value); try { localStorage.setItem(SETTINGS_KEY, String(value)); } catch {} };
  const change = (key: string, value: any) => d.update((previous: any) => ({ ...previous, [key]: value,
    ...(key === 'cover_image' && value !== previous.cover_image ? { cover_crop: null } : {}),
    ...(key === 'summary' ? { summary_mode: 'manual', summary_receipt: '' } : ['title', 'content', 'category', 'tags'].includes(key) ? { summary_receipt: '' } : {}),
  }));
  const commitTags = (value = tagInput) => {
    const added = value.split(/[,，]/).map(item => item.trim()).filter(Boolean);
    if (added.length) change('tags', [...new Set([...(d.form.tags || []), ...added])]);
    setTagInput('');
  };
  const save = () => { commitTags(); return d.save('manual'); };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!event.repeat && d.ready && !locked && !d.busy && !d.blocked && !d.isRestoring) void save();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [d.save, d.ready, d.busy, d.blocked, d.isRestoring, locked, tagInput, d.form.tags]);
  const setMode = (mode: EditorMode) => { if (mode !== 'preview') lastEditMode.current = mode; setEditorMode(mode); };
  const fixField = (field: string) => {
    setPreview(false); setMode(lastEditMode.current);
    if (['summary', 'category', 'tags', 'slug', 'cover'].includes(field)) { if (wide) collapseSettings(false); else setSettingsOpen(true); }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById('article-' + field) || (field === 'cover' ? document.querySelector<HTMLElement>('.writing-cover-drop,.writing-media-select') : null) || workspace.current?.querySelector<HTMLElement>('[data-markdown-editor], .article-editor [contenteditable="true"], .article-editor button');
      target?.focus();
    }));
  };
  useEffect(() => { if (d.summaryError) fixField('summary'); }, [d.summaryError]);
  const openPreview = async () => { commitTags(); if (await d.generateSummary()) { setSettingsOpen(false); setPreview(true); } };
  const submit = async () => { if (await d.action('submit')) { setPreview(false); notify.success(t("m_047e544107")); } };
  const publish = async () => {
    if (await (conflictMode === 'review' && d.serverCopy ? d.resolveConflict('publish-current') : d.action('publish'))) { setPreview(false); setConflictMode('edit'); setPublished(true); }
  };
  const inspect = async () => { setConflictMode('compare'); await d.inspect(); };
  const resolveConflict = async (choice: 'publish-current' | 'keep-current' | 'adopt-post' | 'adopt-draft') => {
    if (await d.resolveConflict(choice)) { setPreview(false); setConflictMode('edit'); }
  };
  const upload = async (file: File) => {
    setUploads(count => count + 1); setUploadError('');
    try { const body = new FormData(); body.append('image', file); body.append('quality', quality); return (await api('/upload/image', { method: 'POST', body })).url as string; }
    finally { setUploads(count => Math.max(0, count - 1)); }
  };
  const uploadCover = async (file: File) => {
    if (fieldsDisabled || uploads > 0) return;
    if (!file.type.startsWith('image/')) { setUploadError(t("m_e51a2ecf22")); return; }
    try { change('cover_image', await upload(file)); } catch (error: any) { setUploadError(error.message); }
  };
  const summary = stripLegacyAgeNotice(d.form.summary), summaryLength = Array.from(summary).length;
  const automatic = !englishVersion && (d.form.summary_mode === 'ai' || !summary.trim() && d.form.summary_mode !== 'manual');
  const cover = safeImageSrc(d.form.cover_image);
  const lockedTitle = reviewState === 'scheduled' ? t("m_58d276b79b") : reviewState === 'approved' ? t("m_f6304d5dea") : t("m_73adfa6919");

  if (published) return <div className="admin-page article-workspace writing-workspace ui-v2">
    <SiteBack className="article-back-link" to={backTo}><ArrowLeft size={16} aria-hidden="true" />{t("m_2b615e36a3")}</SiteBack>
    <section className="article-published"><CheckCircle2 size={32} aria-hidden="true" /><p className="article-workspace-eyebrow">{t("m_d66f5aae02")}</p><h1 ref={completion} tabIndex={-1}>{t("m_7aff53ceac")}</h1><p className="article-published-title">{d.form.title}</p><p className="article-workspace-caption">{t("m_69a8153718")}</p><div className="article-completion-actions">{d.draft?.post_id && <Link className="article-button article-button-primary" to={articlePath({id:d.draft.post_id,slug:d.draft.payload.slug},editorLocale)}>{t("m_5d3dc3103e")}</Link>}<AdminButton type="button" variant="soft" onClick={() => setPublished(false)} >{t("m_fd4b9e3b6c")}</AdminButton><SiteBack className="article-back-link" to={backTo}>{t("m_45a65d3ca1")}</SiteBack></div></section>
  </div>;

  const openHistory = () => { historyOrigin.current = phone ? moreTrigger.current : historyTrigger.current; setHistoryOpen(true); };
  const modeSwitch = !locked && !showComparison && <div className="writing-mode-switch writing-segment" role="group" aria-label={t("m_1e594397ca")}><button type="button" aria-pressed={!preview && editorMode === 'visual'} disabled={!d.ready || uploads > 0} onClick={() => { setPreview(false); setMode('visual'); }}><Pencil size={15} aria-hidden="true" />{t("m_c029ea24cb")}</button><button type="button" aria-pressed={preview || editorMode === 'preview'} disabled={!d.ready || uploads > 0} onClick={() => { setPreview(false); setMode('preview'); }}><Eye size={15} aria-hidden="true" />{t("m_64d4febdc0")}</button></div>;
  const shortStatus = d.error ? t("m_831e8ae014") : d.busy ? t("m_ff509c9ba0") : d.dirty ? t("m_6a1be012c9") : d.ready ? t("m_1bd91a7d0c") : t("m_4927a53bcc");

  const draftActions = [
    ...(publishing && !contributor ? [{ label: t("m_7ddb7d0fcc"), disabled: !d.ready || locked || d.busy || d.blocked || uploads > 0, run: () => void submit() }] : []),
    ...(!contributor && versionPublished ? [{ label: t("m_c91bcb8e27"), disabled: locked || d.busy || d.isRestoring || d.blocked, run: () => { void (async () => { if (await confirmAction(t("m_cf9bb94aa2"))) void d.action('withdraw'); })(); } }] : []),
    ...(versionPublished ? [{ label: t("m_f6beed2923"), disabled: false, run: () => navigate(articlePath({id:d.draft.post_id,slug:d.draft.payload.slug},editorLocale)) }] : []),
    ...(d.draft ? [{ label: d.draft.post_id ? t("m_9ae8295a9b") : t("m_adb7015d2d"), danger: true, disabled: locked || d.busy || d.isRestoring || uploads > 0, run: () => { void (async () => { if (await confirmAction(d.draft.post_id ? t("m_6acaf74473") : t("m_fceb101c01"))) void d.discard(); })(); } }] : []),
  ];

  const settings = <fieldset disabled={fieldsDisabled} className="writing-settings-fields">
    {englishVersion && <p>{t("m_49a78a6f19")}</p>}
    <fieldset disabled={englishVersion} className="writing-settings-fields">
    <section className="writing-setting-section"><h2>{t("m_ccbb5ee62b")}</h2>
      {cover ? <><div className="writing-cover-preview"><CoverImage src={cover} frame={effectiveCoverFrame(coverFrame(d.form.cover_crop, 'detail'), 'detail')} alt={t("m_870c003dd3")} /></div><div className="writing-cover-actions"><AdminButton type="button" variant="soft" disabled={uploads > 0 || d.busy || d.isRestoring} onClick={() => setFraming(d.form.cover_image)} >{t("m_63d34caa68")}</AdminButton><AdminButton type="button" variant="ghost" onClick={() => fileInput.current?.click()} >{t("m_916afcd853")}</AdminButton><AdminButton type="button" variant="ghost" onClick={() => change('cover_image', '')} >{t("m_6135d4159e")}</AdminButton></div></> : <button type="button" className="writing-cover-drop" disabled={uploads > 0} onClick={() => fileInput.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadCover(file); }} onPaste={event => { const address = event.clipboardData.getData('text').trim(); if (safeImageSrc(address)) { event.preventDefault(); change('cover_image', address); } }}><ImagePlus size={24} aria-hidden="true" /><span>{t("m_9d2c3a680e")}</span><small>{t("m_84bd6feeed")}</small></button>}
      <AdminButton type="button" variant="ghost" className="writing-address-toggle" aria-expanded={coverAddress} onClick={() => setCoverAddress(value => !value)}>{t("m_f50757280f")}</AdminButton>
      {(coverAddress || !!d.form.cover_image && !cover) && <label htmlFor="article-cover">{t("m_ca6844ca55")}<input id="article-cover" value={d.form.cover_image} onChange={event => change('cover_image', event.target.value)} placeholder={t("m_0189412954")} className="ui-input" /></label>}
      <AdminButton type="button" variant="soft" className="writing-media-select" onClick={() => setPicker('cover')}>{t("m_b1a53ac1d4")}</AdminButton>
      <div className="writing-quality"><span>{t("m_0ab5629be5")}</span><div className="writing-segment" role="group" aria-label={t("m_0ab5629be5")}>{[['low', t("m_b58fafc108")], ['medium', t("m_6bea77acef")], ['high', t("m_40ab001308")]].map(([value, label]) => <button type="button" key={value} aria-pressed={quality === value} onClick={() => setQuality(value)}>{label}</button>)}</div></div>
    </section>
    <section className="writing-setting-section"><label htmlFor="article-category">{t("m_515559957f")}<input id="article-category" value={d.form.category} placeholder={t("m_26127f0906")} onChange={event => change('category', event.target.value)} className="ui-input" /></label></section>
    <section className="writing-setting-section"><label htmlFor="article-tags">{t("m_1d0fd5f933")}</label><TagInput id="article-tags" tags={d.form.tags||[]} value={tagInput} onInput={setTagInput} onCommit={commitTags} onRemove={index=>change('tags',d.form.tags.filter((_:string,position:number)=>position!==index))}/></section>
    <section className="writing-setting-section"><label htmlFor="article-slug">{t("m_5503649ce1")}<span className="writing-slug"><span>/article/</span><input id="article-slug" value={d.form.slug} maxLength={100} autoCapitalize="none" spellCheck={false} aria-describedby={slugReserved ? "article-slug-hint article-slug-error" : "article-slug-hint"} aria-invalid={slugReserved || undefined} placeholder={t("m_bd9be8f2ad")} onChange={event => change('slug', event.target.value)} className="ui-input" /></span></label>
      <p id="article-slug-hint" className="writing-ai-help">{t("m_d29fde4a50")}</p>
      <AdminButton type="button" variant="soft" className="writing-generate-summary" disabled={!ai?.enabled || !d.form.title.trim() || d.busy || d.blocked} onClick={() => { commitTags(); void d.generateSlug(); }}>{d.slugBusy && <Loader2 className="writing-spinner" size={14} aria-hidden="true" />}{d.slugBusy ? t("m_43d2661b36") : t("m_57306b3469")}</AdminButton>
      {!ai?.enabled && <StatusNotice state={ai?.unavailable ? "error" : "info"}>{ai?.unavailable ? t("m_c822344a9a") : t("m_2369fa260a")}</StatusNotice>}
      {slugReserved && <p id="article-slug-error" role="alert">{t("m_32056c8bb5")}</p>}
      {d.slugError && <p role="alert">{d.slugError}  {t("m_7245bccb33")}</p>}
    </section>
    </fieldset>
    <section className="writing-setting-section writing-summary"><div className="writing-summary-label"><label htmlFor="article-summary">{t("m_8131eafd02")}</label><span title={t("m_0d25a40e88")} className={summaryLength > 140 ? 'writing-summary-warning' : undefined}>{summaryLength}  {t("m_64315e56d6")}</span></div><textarea id="article-summary" rows={4} value={summary} placeholder={t("m_417a1c538e")} aria-describedby="article-summary-mode-hint" onChange={event => change('summary', event.target.value)} className="ui-input" />
      {!englishVersion && <><div className="writing-summary-actions"><label className="writing-ai-switch"><Switch checked={automatic} aria-label={t("m_3a8e5f3da5")} onCheckedChange={checked => d.update((previous: any) => ({ ...previous, summary_mode: checked ? 'ai' : 'manual', summary_receipt: '' }))} /><span>{t("m_3a8e5f3da5")}</span></label><AdminButton type="button" variant="soft" className="writing-generate-summary" disabled={!ai?.enabled || d.busy || d.blocked} onClick={() => { commitTags(); void d.generateSummary(true); }}>{d.summaryBusy && <Loader2 className="writing-spinner" size={14} aria-hidden="true" />}{d.summaryBusy ? t("m_43d2661b36") : t("m_34cd059814")}</AdminButton></div>
      <div className="writing-ai-help" id="article-summary-mode-hint"><span>{ai?.unavailable ? t("m_e92543b224") : t("m_fa5522981b")}</span>{user?.role === 'owner' && <Link to="/admin/ai-settings">{t("m_d02656b388")}</Link>}</div>
      </>}
      {englishVersion && <p>{t("m_581d752eaf")}</p>}
      {!englishVersion && d.form.summary_mode === 'ai' && <p className="writing-ai-receipt" role="status">{d.form.summary_receipt ? t("m_299d4c0238") : t("m_63795bee11")}</p>}
      {d.summaryError && <p role="alert">{d.summaryError}  {t("m_3c447d3799")}</p>}
    </section>
    {phone && !locked && draftActions.length > 0 && <section className="writing-setting-section writing-draft-actions"><h2>{t("m_7437cbd046")}</h2>{draftActions.map(action => <AdminButton type="button" key={action.label} variant="ghost" className={""+ (('danger' in action ? 'writing-menu-danger ui-btn--danger' : undefined) || '')} disabled={action.disabled} onClick={action.run}>{'danger' in action && <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />}{action.label}</AdminButton>)}</section>}
    {d.form.source_url && <section className="writing-setting-section"><h2>{t("m_876df41c1d")}</h2><p>{d.form.source_url}</p><p>{t("m_624bd95d15")}{d.form.published_at}{t("m_434debb93e")}</p></section>}
  </fieldset>;

  const settingsDescription = <SheetDescription className="sr-only">{t("m_1d27731c09")}</SheetDescription>;

  const mediaDialogs = <>
{picker && <ArticleMediaPicker uploadImage={upload} restoreFocus={picker !== 'body'} onClose={() => setPicker(null)} onSelect={(url, alt) => { if (picker === 'cover') change('cover_image', url); else insert.current(url, alt); }} />}
    {framing && <CoverFramingDialog src={framing} value={d.form.cover_crop || null} onClose={() => setFraming(null)} onConfirm={value => { d.update((previous: any) => previous.cover_image === framing ? { ...previous, cover_crop: value } : previous); setFraming(null); }} />}
  </>;

  return <div ref={workspace} data-keyboard-open={keyboardToolbar ? 'true' : undefined} style={keyboardToolbar ? { '--writing-keyboard-top': `${keyboardToolbar.top}px`, '--writing-keyboard-left': `${keyboardToolbar.left}px`, '--writing-keyboard-width': `${keyboardToolbar.width}px` } as CSSProperties : undefined} className={`admin-page article-workspace writing-workspace ui-v2${wide && !collapsed && !locked && !showComparison && !preview ? ' writing-with-settings' : ''}`}>
    <div className="writing-main">
      <header className={`writing-topbar${scrolled ? ' is-scrolled' : ''}`}>
        <div className="writing-topbar-meta"><SiteBack to={backTo} className="writing-back" label={account ? t("m_2b615e36a3") : t("m_7bd74080eb")}><ArrowLeft size={15} aria-hidden="true" /><span>{account ? t("m_2b615e36a3") : t("m_4e7cb68111")}</span></SiteBack><div className="writing-save-state" role="status" data-state={d.error ? 'error' : !d.ready ? 'loading' : d.busy ? 'saving' : d.dirty ? 'dirty' : 'saved'}><span className="writing-save-dot" aria-hidden="true" /><span className="writing-status-full">{d.status}</span><span className="writing-status-short">{!d.error ? shortStatus : <button type="button" className="writing-retry-short" disabled={d.busy || d.blocked} onClick={() => void save()}>{shortStatus}</button>}</span></div>{d.error && !d.blocked && <AdminButton type="button" variant="ghost" className="writing-retry-desktop" disabled={d.busy} onClick={() => void save()}>{t("m_b8784c8dd5")}</AdminButton>}</div>
        <div className="writing-mode-desktop">{modeSwitch}</div>
        <div className="writing-topbar-actions">
          <div className="writing-interface-language"><span>{t("m_3d13868593")}</span><LanguageSwitch /></div>
          {!locked && <><AdminButton type="button" ref={historyTrigger} variant="soft" className="writing-history-trigger writing-secondary-action" disabled={!d.ready} onClick={openHistory}>{t("m_b11590c91f")}</AdminButton><AdminButton type="button" variant="soft" className="writing-save-trigger" disabled={locked || !d.ready || d.busy || d.blocked || d.isRestoring} onClick={() => void save()}>{d.busy ? t("m_ff509c9ba0") : t("m_5329e3f0ee")}</AdminButton></>}
          {!locked && !preview && !showComparison && (!wide || collapsed) && <AdminButton type="button" ref={settingsTrigger} variant="ghost" className="writing-settings-trigger" aria-label={t("m_89ae9a9ca1")} aria-expanded={wide ? !collapsed : settingsOpen} onClick={() => wide ? collapseSettings(false) : setSettingsOpen(true)}><Settings2 size={16} aria-hidden="true" /><span>{t("m_df3d58c7d8")}</span></AdminButton>}
          {(!wide || (!locked && draftActions.length > 0)) && <DropdownMenu><DropdownMenuTrigger asChild><AdminButton type="button" ref={moreTrigger} variant="soft" size="icon" aria-label={t("m_1b0702d7cc")} className="writing-secondary-action"><MoreHorizontal size={18} aria-hidden="true" /></AdminButton></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 writing-more-menu"><DropdownMenuSub><DropdownMenuSubTrigger className="writing-language-menu-entry">{t("m_3d13868593")}</DropdownMenuSubTrigger><DropdownMenuSubContent className="admin-portal ui-v2 writing-language-submenu"><DropdownMenuRadioGroup value={preference} onValueChange={value => setLocale(value as 'zh-CN' | 'en' | 'system')}><DropdownMenuRadioItem value="zh-CN">{t("m_72726d8818")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem><DropdownMenuRadioItem value="system">{t("m_217cfe7db1")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub><DropdownMenuSeparator className="writing-language-menu-entry" />{!locked && (phone ? <><DropdownMenuItem disabled={!d.ready || preview || showComparison} onSelect={() => setSettingsOpen(true)}>{t("m_89ae9a9ca1")}</DropdownMenuItem><DropdownMenuItem disabled={!d.ready} onSelect={openHistory}>{t("m_b11590c91f")}</DropdownMenuItem><DropdownMenuItem disabled={locked || !d.ready || d.busy || d.blocked || d.isRestoring} onSelect={() => void save()}>{t("m_5329e3f0ee")}</DropdownMenuItem></> : draftActions.map(action => <DropdownMenuItem key={action.label} className={'danger' in action ? 'writing-menu-danger' : undefined} disabled={action.disabled} onSelect={action.run}>{action.label}</DropdownMenuItem>))}</DropdownMenuContent></DropdownMenu>}
          {!locked && <AdminButton type="button" variant="solid" disabled={!d.ready || locked || d.busy || d.isRestoring || d.blocked || uploads > 0 || showComparison} onClick={() => void openPreview()} >{contributor ? t("m_14466a5bf0") : t("m_b61f333b91")}</AdminButton>}

        </div>
      </header>
      <div className="writing-body">
      <section className="writing-content-language" aria-label={t("m_d562f79cd4")}><span className="writing-content-language-label">{t("m_d562f79cd4")}</span><div className="writing-segment" role="group" aria-label={t("m_d562f79cd4")}>
        <button type="button" className="quiet-button" aria-pressed={!englishVersion} disabled={d.busy||uploads>0} onClick={()=>setEditorLocale('zh-CN')}>{t("m_72726d8818")}</button>
        <button type="button" className="quiet-button" aria-pressed={englishVersion} disabled={!chinese.ready||chinese.busy||d.busy||uploads>0} onClick={()=>{void(async()=>{if(!sharedPostId&&!await chinese.identity())return;setEnglishOpened(true);setEditorLocale('en');})();}}>English</button>
        </div><span className="writing-version-state" role="status"><span className="writing-version-label">{t("m_5f76b2bf82")}{locale === 'en' ? ' ' : ''}{t("m_6320b4a872")}{locale === 'en' ? ': ' : '：'}</span><span>{t(d.draft?.source_changed?t("m_133c7031a7"):d.draft?.translation_status==='published'?t("m_d334724d6b"):d.draft?t("m_2a2fd29bd2"):t("m_bb1ea50f6a"))}</span></span>
        {englishVersion&&d.draft?.source_changed&&<button type="button" className="quiet-button" disabled={locked||d.busy||d.blocked||uploads>0||!d.draft.current_source_hash} onClick={()=>void d.reviewSource()}>{t("m_1f9e07738c")}</button>}
      </section>

        {languageError && <p role="alert" className="article-workspace-notice">{languageError}</p>}
        <div className="writing-mode-mobile">{modeSwitch}</div>
        <h1 className="sr-only">{locked ? lockedTitle : showComparison ? t("m_6af8a5c00e") : preview ? t("m_5fbee954c9") : postId || d.draft?.post_id ? t("m_12dfe39e2e") : t("m_13b195d6cc")}</h1>
        {locked && <div className="article-submission-bar"><p role="status">{lockedTitle}</p><small>{t("m_d0b966b9d9")}</small>{reviewState === 'scheduled' && <small>{t("m_64e1e8d8ce")} {new Date(Number(d.draft.workflow.scheduled_at)).toLocaleString(locale, { timeZone: 'Asia/Shanghai' })}</small>}</div>}
        {!locked && !d.localAvailable && <p role="alert">{t("m_572c660037")}</p>}
        {!locked && d.error && !showComparison && !(conflictMode === 'review' && d.serverCopy) && <div className="article-workspace-notice" role="alert"><h2>{d.errorStatus === 409 ? t("m_16e0548d1d") : t("m_9688019106")}</h2><p>{d.error}</p><div className="inline-actions">{d.errorStatus === 409 ? <AdminButton type="button" disabled={d.busy} onClick={() => void inspect()} >{t("m_39d395dcfe")}</AdminButton> : <>{d.errorStatus === 401 && <a className="article-button" href="/login" target="_blank" rel="noopener noreferrer">{t("m_da2d2566af")}</a>}<AdminButton type="button" variant="soft" disabled={d.busy || d.blocked} onClick={() => void save()} >{t("m_917e750405")}</AdminButton></>}<AdminButton type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(d.form.content).then(() => notify.success(t("m_3400ddb2de"))).catch(() => setUploadError(t("m_833441d271")))} >{t("m_2e6aec92fb")}</AdminButton></div></div>}
        {showComparison && !locked && <ArticleConflict comparison={d.serverCopy} current={d.form} busy={d.busy} onResolve={resolveConflict} onRefresh={() => void inspect()} onPublish={() => { setConflictMode('review'); setPreview(true); }} onContinue={() => { setConflictMode('edit'); setPreview(false); }} />}
        {conflictMode === 'review' && d.serverCopy && <div className="article-workspace-notice"><h2>{t("m_217570bfd6")}</h2><p>{t("m_acd0a9e30b")}</p><AdminButton type="button" variant="soft" disabled={d.busy} onClick={() => setConflictMode('compare')} >{t("m_5eeb9b923c")}</AdminButton>{d.errorStatus !== 409 && d.error && <p role="alert">{d.error}</p>}</div>}
        {!locked && d.recovery && <div className="article-workspace-notice" role="alert">{t("m_a9eb59dc46")}<AdminButton type="button" variant="soft" onClick={() => d.resolve(true)} >{t("m_d045c9afd0")}</AdminButton><AdminButton type="button" variant="ghost" onClick={() => d.resolve(false)} >{t("m_f4870bb2ff")}</AdminButton></div>}
        {preview && !locked && !showComparison && <section className="article-full-preview"><AdminButton type="button" variant="ghost" className="article-return-edit" disabled={d.busy} onClick={() => setPreview(false)}><ArrowLeft size={16} aria-hidden="true" />{t("m_16b38790d5")}</AdminButton><ArticleReview onFix={fixField} post={{ ...d.form, content_locale:editorLocale, author_name: t("m_bc23331f73") }} busy={d.busy || d.isRestoring || uploads > 0} disabled={d.blocked && !(conflictMode === 'review' && d.serverCopy)} publishLabel={conflictMode === 'review' ? t("m_7dd20b7a2c") : contributor ? t("m_34ef20b205") : versionPublished ? t("m_397ee4a9e4") : t("m_c8f73143f3")} onPublish={() => void (contributor ? submit() : publish())} /></section>}
        {locked && <article className="submission-document"><header><span className="account-eyebrow">{t("m_8cd59b0a18")}</span><h1>{d.form.title || t("m_0d29eaf3ac")}</h1><p className="submission-document-meta">{t("m_78b756d8eb")}</p></header><div className="submission-document-body">{cover && (d.form.cover_crop ? <CoverDisplayPreviews src={cover} crop={d.form.cover_crop} /> : <img className="content-image" src={cover} alt="" />)}<MarkdownContent content={d.form.content || ''} headingPrefix="submission-heading" /></div></article>}
        {d.summaryBusy && <p role="status">{t("m_227f4fa588")}</p>}
        <fieldset hidden={preview || locked || showComparison} disabled={fieldsDisabled} className="writing-editor-fields">
          <label className="writing-title"><span className="sr-only">{t("m_c3405f8c7d")}</span><textarea ref={titleInput} id="article-title" rows={1} value={d.form.title} maxLength={255} onChange={event => change('title', event.target.value.replace(/[\r\n]+/g, ' '))} placeholder={t("m_865f0a03ab")} /></label>
          {!isRichText(d.form.content) && !!d.form.content && <div className="writing-source-toggle"><button type="button" aria-pressed={editorMode === 'source'} disabled={fieldsDisabled || uploads > 0} onClick={() => setMode(editorMode === 'source' ? 'visual' : 'source')}>{t("m_9380ef6f8d")}</button></div>}
          {d.ready && <ArticleEditor key={editorLocale} writingToolbar mode={editorMode} onModeChange={setMode} hideModeControls onMediaLibrary={() => setPicker('body')} disabled={fieldsDisabled || uploads > 0} registerImageInsert={fn => { insert.current = fn; }} value={d.form.content} onChange={value => change('content', value)} existing={!!postId || !!d.draft?.payload?.content} uploadImage={upload} onError={setUploadError} onBusy={setEditorPending} />}
        </fieldset>
        {uploadError && <p role="alert">{uploadError}</p>}{uploads > 0 && <p role="status">{t("m_831d255caa")}</p>}
      </div>
    </div>
    {wide && !collapsed && !locked && !showComparison && !preview && <aside className="writing-settings" aria-label={t("m_89ae9a9ca1")}><div className="writing-settings-heading"><h2>{t("m_89ae9a9ca1")}</h2><AdminButton type="button" variant="ghost" size="icon" aria-label={t("m_78e31fd2ee")} onClick={() => { collapseSettings(true); requestAnimationFrame(() => settingsTrigger.current?.focus()); }} ><ChevronRight size={18} aria-hidden="true" /></AdminButton></div>{settings}</aside>}
    <Sheet open={!wide && settingsOpen} onOpenChange={setSettingsOpen}><SheetContent side={phone ? 'bottom' : 'right'} className={`admin-portal ui-v2 writing-settings-sheet${phone ? ' writing-settings-bottom' : ''}`} data-focus-method={phone ? 'pointer' : undefined}
      onOpenAutoFocus={event => { if (phone) { event.preventDefault(); settingsClose.current?.focus({ preventScroll: true }); } }}
      onPointerDownCapture={event => { if (phone) event.currentTarget.dataset.focusMethod = 'pointer'; }}
      onKeyDownCapture={event => { if (phone && event.key === 'Tab') event.currentTarget.dataset.focusMethod = 'keyboard'; }}
      onTouchStart={event => { settingsSwipe.current = null; if (!phone || event.touches.length !== 1 || !(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return; const header = event.target instanceof Element && !!event.target.closest('.writing-sheet-header'); if (!header && (settingsScroll.current?.scrollTop || 0) > 0) return; const touch = event.touches[0]; settingsSwipe.current = { x: touch.clientX, y: touch.clientY, header }; }}
      onTouchMove={event => { const start = settingsSwipe.current, touch = event.touches[0]; if (start && (event.touches.length !== 1 || !touch || touch.clientY < start.y || Math.abs(touch.clientX - start.x) > Math.max(20, touch.clientY - start.y) || !start.header && (settingsScroll.current?.scrollTop || 0) > 0)) settingsSwipe.current = null; }}
      onTouchEnd={event => { const start = settingsSwipe.current, touch = event.changedTouches[0]; settingsSwipe.current = null; if (start && touch && touch.clientY - start.y > 80 && Math.abs(touch.clientX - start.x) < touch.clientY - start.y) setSettingsOpen(false); }}
      onTouchCancel={() => { settingsSwipe.current = null; }}
      onCloseAutoFocus={event => { event.preventDefault(); (phone ? moreTrigger.current : settingsTrigger.current)?.focus(); }}>
      {phone ? <><header className="writing-sheet-header"><div className="writing-sheet-handle" aria-hidden="true" /><div className="writing-sheet-title-row"><SheetTitle>{t("m_89ae9a9ca1")}</SheetTitle><SheetClose asChild><button ref={settingsClose} type="button" className="writing-sheet-close" aria-label={t("m_3fd47edce4")}><X size={18} aria-hidden="true" /></button></SheetClose></div></header>{settingsDescription}<div ref={settingsScroll} className="writing-sheet-scroll">{settings}</div></> : <><div className="writing-sheet-handle" aria-hidden="true" /><SheetTitle>{t("m_89ae9a9ca1")}</SheetTitle>{settingsDescription}{settings}</>}
      {mediaDialogs}
    </SheetContent></Sheet>
    <input ref={fileInput} type="file" hidden accept="image/*" aria-label={t("m_3d1a8b4ad8")} disabled={fieldsDisabled || uploads > 0} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadCover(file); event.target.value = ''; }} />
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent className="admin-portal ui-v2 writing-history-dialog" onOpenAutoFocus={event => { event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); historyOrigin.current?.focus(); }}><DialogTitle asChild><h2 ref={historyTitle} tabIndex={-1}>{t("m_b11590c91f")}</h2></DialogTitle><DialogDescription className="sr-only">{t("m_cc3435cb9e")}</DialogDescription><div ref={element => { if (element && historyHost && !element.contains(historyHost)) element.appendChild(historyHost); }} /></DialogContent></Dialog>
    {d.ready && historyHost && createPortal(<ArticleRevisionHistory draftId={d.draft.id} version={d.draft.version} current={d.form} disabled={historyDisabled} onRestore={d.restore} />, historyHost)}
    {(wide || !settingsOpen) && mediaDialogs}
  </div>;
}
