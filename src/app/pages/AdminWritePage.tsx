import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, ImagePlus, Loader2, MoreHorizontal, Settings2, Trash2, Upload, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePublishing } from '../lib/usePublishing';
import { useArticleDraft } from '../lib/useArticleDraft';
import { api } from '../lib/api';
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
import { ArticleMediaPicker } from '../components/ArticleMediaPicker';
import { CoverFramingDialog } from '../components/CoverFramingDialog';
import { CoverImage } from '../components/CoverImage';
import { CoverDisplayPreviews } from '../components/CoverDisplayPreviews';
import { MarkdownContent } from '../components/MarkdownContent';
import { AdminButton } from '../components/admin/AdminButton';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const publishing = usePublishing();
  const contributor = publishing && !['owner', 'admin'].includes(user?.role || '');
  const account = location.pathname.startsWith('/account');
  const backTo = account ? '/account/submissions' : '/admin/posts';
  const d = useArticleDraft(userId, postId);
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
    const scroll = workspace.current?.closest('.admin-main') || window;
    const update = () => setScrolled(scroll instanceof HTMLElement ? scroll.scrollTop > 4 : window.scrollY > 4);
    update(); scroll.addEventListener('scroll', update, { passive: true });
    return () => scroll.removeEventListener('scroll', update);
  }, [published]);
  useEffect(() => { if (published) completion.current?.focus(); }, [published]);
  useEffect(() => {
    const viewport = window.visualViewport, host = workspace.current;
    if (!phone || !viewport || !host || preview || locked || showComparison || published) { setKeyboardToolbar(null); return; }
    let baseline = Math.max(window.innerHeight, document.documentElement.clientHeight, Number.isFinite(viewport.height) ? viewport.height : 0), layoutWidth = window.innerWidth, frame = 0, editing = false;
    const update = () => {
      if (layoutWidth !== window.innerWidth) { layoutWidth = window.innerWidth; baseline = Math.max(window.innerHeight, document.documentElement.clientHeight, Number.isFinite(viewport.height) ? viewport.height : 0); }
      const active = document.activeElement;
      editing = active instanceof HTMLElement && host.contains(active) && (active.matches('.article-editor [contenteditable=true],textarea[aria-label="Markdown 正文"]') || editing && !!active.closest('.editor-toolbar-frame,.article-source-toolbar'));
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
      const target = document.getElementById('article-' + field) || (field === 'cover' ? document.querySelector<HTMLElement>('.writing-cover-drop,.writing-media-select') : null) || workspace.current?.querySelector<HTMLElement>('[aria-label="Markdown 正文"], .article-editor [contenteditable="true"], .article-editor button');
      target?.focus();
    }));
  };
  useEffect(() => { if (d.summaryError) fixField('summary'); }, [d.summaryError]);
  const openPreview = async () => { commitTags(); if (await d.generateSummary()) { setSettingsOpen(false); setPreview(true); } };
  const submit = async () => { if (await d.action('submit')) { setPreview(false); notify.success('稿件已提交审核'); } };
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
    if (!file.type.startsWith('image/')) { setUploadError('请选择图片文件。'); return; }
    try { change('cover_image', await upload(file)); } catch (error: any) { setUploadError(error.message); }
  };
  const summary = stripLegacyAgeNotice(d.form.summary), summaryLength = Array.from(summary).length;
  const automatic = d.form.summary_mode === 'ai' || !summary.trim() && d.form.summary_mode !== 'manual';
  const cover = safeImageSrc(d.form.cover_image);
  const lockedTitle = reviewState === 'scheduled' ? '已安排定时发布' : reviewState === 'approved' ? '审核已通过，等待发布' : '待管理员审核';

  if (published) return <div className="admin-page article-workspace writing-workspace ui-v2">
    <Link className="article-back-link" to={backTo}><ArrowLeft size={16} aria-hidden="true" />返回稿件列表</Link>
    <section className="article-published"><CheckCircle2 size={32} aria-hidden="true" /><p className="article-workspace-eyebrow">发布完成</p><h1 ref={completion} tabIndex={-1}>文章已发布</h1><p className="article-published-title">{d.form.title}</p><p className="article-workspace-caption">读者现在可以查看这篇文章。后续修改需再次发布才会更新到网站。</p><div className="article-completion-actions">{d.draft?.post_id && <Link className="article-button article-button-primary" to={`/article/${d.draft.post_id}`}>查看文章 ↗</Link>}<AdminButton type="button" variant="soft" onClick={() => setPublished(false)} className="ui-btn ui-btn--soft">继续编辑</AdminButton><Link className="article-back-link" to={backTo}>返回稿件列表 →</Link></div></section>
  </div>;

  const openHistory = () => { historyOrigin.current = phone ? moreTrigger.current : historyTrigger.current; setHistoryOpen(true); };
  const modeSwitch = !locked && !showComparison && <div className="writing-mode-switch writing-segment" role="group" aria-label="正文编辑模式"><button type="button" aria-pressed={!preview && editorMode === 'visual'} disabled={!d.ready || uploads > 0} onClick={() => { setPreview(false); setMode('visual'); }}>富文本编辑</button><button type="button" aria-pressed={preview || editorMode === 'preview'} disabled={!d.ready || uploads > 0} onClick={() => { setPreview(false); setMode('preview'); }}>阅读预览</button></div>;
  const shortStatus = d.error ? '保存失败 重试' : d.busy ? '保存中…' : d.dirty ? '未保存' : d.ready ? '已保存' : '加载中…';

  const draftActions = [
    ...(publishing && !contributor ? [{ label: '提交到审核 / 发布计划', disabled: !d.ready || locked || d.busy || d.blocked || uploads > 0, run: () => void submit() }] : []),
    ...(!contributor && d.draft?.post_status === 'published' ? [{ label: '撤回为草稿', disabled: locked || d.busy || d.isRestoring || d.blocked, run: () => { void (async () => { if (await confirmAction('撤回后读者将无法访问这篇文章，确定撤回？')) void d.action('withdraw'); })(); } }] : []),
    ...(d.draft?.post_status === 'published' ? [{ label: '查看文章', disabled: false, run: () => navigate(`/article/${d.draft.post_id}`) }] : []),
    ...(d.draft ? [{ label: d.draft.post_id ? '放弃未发布修改' : '删除草稿及历史', danger: true, disabled: locked || d.busy || d.isRestoring || uploads > 0, run: () => { void (async () => { if (await confirmAction(d.draft.post_id ? '放弃这份修订稿和当前未保存内容？公开文章和历史保持不变。' : '永久删除这份未发布草稿及其全部历史？')) void d.discard(); })(); } }] : []),
  ];

  const settings = <fieldset disabled={fieldsDisabled} className="writing-settings-fields">
    <section className="writing-setting-section"><h2>封面</h2>
      {cover ? <><div className="writing-cover-preview"><CoverImage src={cover} frame={effectiveCoverFrame(coverFrame(d.form.cover_crop, 'detail'), 'detail')} alt="封面显示范围预览" /></div><div className="writing-cover-actions"><AdminButton type="button" variant="soft" disabled={uploads > 0 || d.busy || d.isRestoring} onClick={() => setFraming(d.form.cover_image)} className="ui-btn ui-btn--soft">调整取景</AdminButton><AdminButton type="button" variant="ghost" onClick={() => fileInput.current?.click()} className="ui-btn ui-btn--ghost">更换</AdminButton><AdminButton type="button" variant="ghost" onClick={() => change('cover_image', '')} className="ui-btn ui-btn--ghost">移除</AdminButton></div></> : <button type="button" className="writing-cover-drop" disabled={uploads > 0} onClick={() => fileInput.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadCover(file); }} onPaste={event => { const address = event.clipboardData.getData('text').trim(); if (safeImageSrc(address)) { event.preventDefault(); change('cover_image', address); } }}><ImagePlus size={24} aria-hidden="true" /><span>拖放图片，或点击上传</span><small>也可以粘贴图片地址</small></button>}
      <AdminButton type="button" variant="ghost" className="writing-address-toggle ui-btn ui-btn--ghost" aria-expanded={coverAddress} onClick={() => setCoverAddress(value => !value)}>使用图片地址</AdminButton>
      {(coverAddress || !!d.form.cover_image && !cover) && <label htmlFor="article-cover">封面地址<input id="article-cover" value={d.form.cover_image} onChange={event => change('cover_image', event.target.value)} placeholder="输入图片地址，或从媒体库选择" className="ui-input" /></label>}
      <AdminButton type="button" variant="soft" className="writing-media-select ui-btn ui-btn--soft" onClick={() => setPicker('cover')}>从媒体库选择</AdminButton>
      <div className="writing-quality"><span>图片质量</span><div className="writing-segment" role="group" aria-label="图片质量">{[['low', '较小'], ['medium', '标准'], ['high', '高清']].map(([value, label]) => <button type="button" key={value} aria-pressed={quality === value} onClick={() => setQuality(value)}>{label}</button>)}</div></div>
    </section>
    <section className="writing-setting-section"><label htmlFor="article-category">分类<input id="article-category" value={d.form.category} placeholder="选择或输入分类" onChange={event => change('category', event.target.value)} className="ui-input" /></label></section>
    <section className="writing-setting-section"><label htmlFor="article-tags">标签</label><div className="writing-tags">{(d.form.tags || []).map((tag: string, index: number) => <span className="writing-tag" key={`${tag}:${index}`}>{tag}<button type="button" aria-label={`移除标签 ${tag}`} onClick={() => change('tags', d.form.tags.filter((_: string, position: number) => position !== index))}><X size={12} aria-hidden="true" /></button></span>)}<input id="article-tags" value={tagInput} placeholder="输入后按回车添加，用逗号分隔" onChange={event => { const value = event.target.value; if (/[,，]/.test(value) && !(event.nativeEvent as InputEvent).isComposing) commitTags(value); else setTagInput(value); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); commitTags(); } }} onBlur={() => commitTags()} className="ui-input" /></div></section>
    <section className="writing-setting-section"><label htmlFor="article-slug">链接别名<span className="writing-slug"><span>/article/</span><input id="article-slug" value={d.form.slug} placeholder="留空时自动生成" onChange={event => change('slug', event.target.value)} className="ui-input" /></span></label></section>
    <section className="writing-setting-section writing-summary"><div className="writing-summary-label"><label htmlFor="article-summary">简介</label><span title="建议 80–140 字，搜索引擎可能另选摘要。" className={summaryLength > 140 ? 'writing-summary-warning' : undefined}>{summaryLength} / 140 字</span></div><textarea id="article-summary" rows={4} value={summary} placeholder="介绍文章主题与主要内容" aria-describedby="article-summary-mode-hint" onChange={event => change('summary', event.target.value)} className="ui-input" />
      <div className="writing-summary-actions"><label className="writing-ai-switch"><Switch checked={automatic} aria-label="DeepSeek 自动总结" onCheckedChange={checked => d.update((previous: any) => ({ ...previous, summary_mode: checked ? 'ai' : 'manual', summary_receipt: '' }))} /><span>DeepSeek 自动总结</span></label><AdminButton type="button" variant="soft" className="writing-generate-summary ui-btn ui-btn--soft" disabled={!ai?.enabled || d.busy || d.blocked} onClick={() => { commitTags(); void d.generateSummary(true); }}>{d.summaryBusy && <Loader2 className="writing-spinner" size={14} aria-hidden="true" />}{d.summaryBusy ? '生成中…' : '生成简介'}</AdminButton></div>
      <div className="writing-ai-help" id="article-summary-mode-hint"><span>{ai?.unavailable ? 'AI 设置暂时无法读取，可先填写手写简介。' : '预览或发布前，根据正文生成简介。'}</span>{user?.role === 'owner' && <Link to="/admin/ai-settings">配置 AI</Link>}</div>
      {d.form.summary_mode === 'ai' && <p className="writing-ai-receipt" role="status">{d.form.summary_receipt ? 'AI 简介已生成。' : '预览时将根据当前正文生成简介。'}</p>}
      {d.summaryError && <p role="alert">{d.summaryError} 可重试，或编辑简介改为手写。</p>}
    </section>
    {phone && !locked && draftActions.length > 0 && <section className="writing-setting-section writing-draft-actions"><h2>草稿操作</h2>{draftActions.map(action => <AdminButton type="button" key={action.label} variant="ghost" className={"ui-btn ui-btn--ghost " + (('danger' in action ? 'writing-menu-danger ui-btn--danger' : undefined) || '')} disabled={action.disabled} onClick={action.run}>{'danger' in action && <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />}{action.label}</AdminButton>)}</section>}
    {d.form.source_url && <section className="writing-setting-section"><h2>旧站来源</h2><p>{d.form.source_url}</p><p>原发布时间：{d.form.published_at}（首次发布时保留）</p></section>}
  </fieldset>;

  const settingsDescription = <SheetDescription className="sr-only">封面、分类、标签、链接别名和简介</SheetDescription>;

  const mediaDialogs = <>
{picker && <ArticleMediaPicker uploadImage={upload} restoreFocus={picker !== 'body'} onClose={() => setPicker(null)} onSelect={(url, alt) => { if (picker === 'cover') change('cover_image', url); else insert.current(url, alt); }} />}
    {framing && <CoverFramingDialog src={framing} value={d.form.cover_crop || null} onClose={() => setFraming(null)} onConfirm={value => { d.update((previous: any) => previous.cover_image === framing ? { ...previous, cover_crop: value } : previous); setFraming(null); }} />}
  </>;

  return <div ref={workspace} data-keyboard-open={keyboardToolbar ? 'true' : undefined} style={keyboardToolbar ? { '--writing-keyboard-top': `${keyboardToolbar.top}px`, '--writing-keyboard-left': `${keyboardToolbar.left}px`, '--writing-keyboard-width': `${keyboardToolbar.width}px` } as CSSProperties : undefined} className={`admin-page article-workspace writing-workspace ui-v2${wide && !collapsed && !locked && !showComparison && !preview ? ' writing-with-settings' : ''}`}>
    <div className="writing-main">
      <header className={`writing-topbar${scrolled ? ' is-scrolled' : ''}`}>
        <div className="writing-topbar-meta"><button type="button" className="writing-back" aria-label={account ? '返回稿件列表' : '返回文章管理'} onClick={() => navigate(backTo)}><ArrowLeft size={15} aria-hidden="true" /><span>{account ? '返回稿件列表' : '文章管理'}</span></button><div className="writing-save-state" role="status" data-state={d.error ? 'error' : !d.ready ? 'loading' : d.busy ? 'saving' : d.dirty ? 'dirty' : 'saved'}><span className="writing-save-dot" aria-hidden="true" /><span className="writing-status-full">{d.status}</span><span className="writing-status-short">{!d.error ? shortStatus : <button type="button" className="writing-retry-short" disabled={d.busy || d.blocked} onClick={() => void save()}>{shortStatus}</button>}</span></div>{d.error && !d.blocked && <AdminButton type="button" variant="ghost" className="writing-retry-desktop ui-btn ui-btn--ghost" disabled={d.busy} onClick={() => void save()}>重试</AdminButton>}</div>
        <div className="writing-mode-desktop">{modeSwitch}</div>
        <div className="writing-topbar-actions">
          {!locked && <><AdminButton type="button" ref={historyTrigger} variant="ghost" className="writing-history-trigger ui-btn ui-btn--ghost" disabled={!d.ready} onClick={openHistory}>修订历史</AdminButton><AdminButton type="button" variant="soft" className="writing-save-trigger ui-btn ui-btn--soft" disabled={locked || !d.ready || d.busy || d.blocked || d.isRestoring} onClick={() => void save()}>{d.busy ? '保存中…' : '保存草稿'}</AdminButton></>}
          {!locked && !preview && !showComparison && (!wide || collapsed) && <AdminButton type="button" ref={settingsTrigger} variant="ghost" className="writing-settings-trigger ui-btn ui-btn--ghost" aria-label="文章设置" aria-expanded={wide ? !collapsed : settingsOpen} onClick={() => wide ? collapseSettings(false) : setSettingsOpen(true)}><Settings2 size={16} aria-hidden="true" /><span>设置</span></AdminButton>}
          {!locked && (phone || draftActions.length > 0) && <DropdownMenu><DropdownMenuTrigger asChild><AdminButton type="button" ref={moreTrigger} variant="ghost" size="icon" aria-label="更多文章操作" className="ui-btn ui-btn--ghost ui-btn--icon"><MoreHorizontal size={18} aria-hidden="true" /></AdminButton></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 writing-more-menu">{phone ? <><DropdownMenuItem disabled={!d.ready || preview || showComparison} onSelect={() => setSettingsOpen(true)}>文章设置</DropdownMenuItem><DropdownMenuItem disabled={!d.ready} onSelect={openHistory}>修订历史</DropdownMenuItem><DropdownMenuItem disabled={locked || !d.ready || d.busy || d.blocked || d.isRestoring} onSelect={() => void save()}>保存草稿</DropdownMenuItem></> : draftActions.map(action => <DropdownMenuItem key={action.label} className={'danger' in action ? 'writing-menu-danger' : undefined} disabled={action.disabled} onSelect={action.run}>{action.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
          {!locked && <AdminButton type="button" variant="solid" disabled={!d.ready || locked || d.busy || d.isRestoring || d.blocked || uploads > 0 || showComparison} onClick={() => void openPreview()} className="ui-btn ui-btn--solid">{contributor ? '预览并提交审核' : '发布'}</AdminButton>}

        </div>
      </header>
      <div className="writing-body">
        <div className="writing-mode-mobile">{modeSwitch}</div>
        <h1 className="sr-only">{locked ? lockedTitle : showComparison ? '处理版本冲突' : preview ? '发布前检查' : postId || d.draft?.post_id ? '编辑文章' : '写文章'}</h1>
        {locked && <div className="article-submission-bar"><p role="status">{lockedTitle}</p><small>审核结果和后续操作可在稿件列表查看。</small>{reviewState === 'scheduled' && <small>北京时间 {new Date(Number(d.draft.workflow.scheduled_at)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small>}</div>}
        {!locked && !d.localAvailable && <p role="alert">本地恢复副本不可用，请确认服务器保存成功后再离开。</p>}
        {!locked && d.error && !showComparison && !(conflictMode === 'review' && d.serverCopy) && <div className="article-workspace-notice" role="alert"><h2>{d.errorStatus === 409 ? '版本冲突，尚未发布' : '操作尚未完成'}</h2><p>{d.error}</p><div className="inline-actions">{d.errorStatus === 409 ? <AdminButton type="button" disabled={d.busy} onClick={() => void inspect()} className="ui-btn ui-btn--solid">对比并选择版本</AdminButton> : <>{d.errorStatus === 401 && <a className="article-button" href="/login" target="_blank" rel="noopener noreferrer">重新登录（新窗口）</a>}<AdminButton type="button" variant="soft" disabled={d.busy || d.blocked} onClick={() => void save()} className="ui-btn ui-btn--soft">重试保存</AdminButton></>}<AdminButton type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(d.form.content).then(() => notify.success('正文已复制')).catch(() => setUploadError('无法访问剪贴板，请在 Markdown 源码中手动复制。'))} className="ui-btn ui-btn--ghost">复制当前正文</AdminButton></div></div>}
        {showComparison && !locked && <ArticleConflict comparison={d.serverCopy} current={d.form} busy={d.busy} onResolve={resolveConflict} onRefresh={() => void inspect()} onPublish={() => { setConflictMode('review'); setPreview(true); }} onContinue={() => { setConflictMode('edit'); setPreview(false); }} />}
        {conflictMode === 'review' && d.serverCopy && <div className="article-workspace-notice"><h2>将使用当前内容覆盖发布</h2><p>已选择的网站版本会保存到修订历史。请检查下方内容，再确认覆盖。</p><AdminButton type="button" variant="soft" disabled={d.busy} onClick={() => setConflictMode('compare')} className="ui-btn ui-btn--soft">返回版本对比</AdminButton>{d.errorStatus !== 409 && d.error && <p role="alert">{d.error}</p>}</div>}
        {!locked && d.recovery && <div className="article-workspace-notice" role="alert">发现未同步的本地内容。<AdminButton type="button" variant="soft" onClick={() => d.resolve(true)} className="ui-btn ui-btn--soft">恢复本地内容</AdminButton><AdminButton type="button" variant="ghost" onClick={() => d.resolve(false)} className="ui-btn ui-btn--ghost">使用服务器内容</AdminButton></div>}
        {preview && !locked && !showComparison && <section className="article-full-preview"><AdminButton type="button" variant="ghost" className="article-return-edit ui-btn ui-btn--ghost" disabled={d.busy} onClick={() => setPreview(false)}><ArrowLeft size={16} aria-hidden="true" />返回编辑</AdminButton><ArticleReview onFix={fixField} post={{ ...d.form, author_name: '当前作者' }} busy={d.busy || d.isRestoring || uploads > 0} disabled={d.blocked && !(conflictMode === 'review' && d.serverCopy)} publishLabel={conflictMode === 'review' ? '确认覆盖发布' : contributor ? '确认提交审核' : d.draft?.post_status === 'published' ? '确认更新' : '确认发布'} onPublish={() => void (contributor ? submit() : publish())} /></section>}
        {locked && <article className="submission-document"><header><span className="account-eyebrow">稿件详情</span><h1>{d.form.title || '未命名稿件'}</h1><p className="submission-document-meta">提交的审核版本 · 仅作者与审核人员可见</p></header><div className="submission-document-body">{cover && (d.form.cover_crop ? <CoverDisplayPreviews src={cover} crop={d.form.cover_crop} /> : <img className="content-image" src={cover} alt="" />)}<MarkdownContent content={d.form.content || ''} headingPrefix="submission-heading" /></div></article>}
        {d.summaryBusy && <p role="status">正在根据正文生成 DeepSeek 简介…</p>}
        <fieldset hidden={preview || locked || showComparison} disabled={fieldsDisabled} className="writing-editor-fields">
          <label className="writing-title"><span className="sr-only">标题</span><textarea ref={titleInput} id="article-title" rows={1} value={d.form.title} maxLength={255} onChange={event => change('title', event.target.value.replace(/[\r\n]+/g, ' '))} placeholder="未命名草稿" /></label>
          {!isRichText(d.form.content) && !!d.form.content && <div className="writing-source-toggle"><button type="button" aria-pressed={editorMode === 'source'} disabled={fieldsDisabled || uploads > 0} onClick={() => setMode(editorMode === 'source' ? 'visual' : 'source')}>Markdown 源码</button></div>}
          {d.ready && <ArticleEditor writingToolbar mode={editorMode} onModeChange={setMode} hideModeControls onMediaLibrary={() => setPicker('body')} disabled={fieldsDisabled || uploads > 0} registerImageInsert={fn => { insert.current = fn; }} value={d.form.content} onChange={value => change('content', value)} existing={!!postId || !!d.draft?.payload?.content} uploadImage={upload} onError={setUploadError} onBusy={setEditorPending} />}
        </fieldset>
        {uploadError && <p role="alert">{uploadError}</p>}{uploads > 0 && <p role="status">正在上传图片…</p>}
      </div>
    </div>
    {wide && !collapsed && !locked && !showComparison && !preview && <aside className="writing-settings" aria-label="文章设置"><div className="writing-settings-heading"><h2>文章设置</h2><AdminButton type="button" variant="ghost" size="icon" aria-label="收起文章设置" onClick={() => { collapseSettings(true); requestAnimationFrame(() => settingsTrigger.current?.focus()); }} className="ui-btn ui-btn--ghost ui-btn--icon"><ChevronRight size={18} aria-hidden="true" /></AdminButton></div>{settings}</aside>}
    <Sheet open={!wide && settingsOpen} onOpenChange={setSettingsOpen}><SheetContent side={phone ? 'bottom' : 'right'} className={`admin-portal ui-v2 writing-settings-sheet${phone ? ' writing-settings-bottom' : ''}`} data-focus-method={phone ? 'pointer' : undefined}
      onOpenAutoFocus={event => { if (phone) { event.preventDefault(); settingsClose.current?.focus({ preventScroll: true }); } }}
      onPointerDownCapture={event => { if (phone) event.currentTarget.dataset.focusMethod = 'pointer'; }}
      onKeyDownCapture={event => { if (phone && event.key === 'Tab') event.currentTarget.dataset.focusMethod = 'keyboard'; }}
      onTouchStart={event => { settingsSwipe.current = null; if (!phone || event.touches.length !== 1 || !(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return; const header = event.target instanceof Element && !!event.target.closest('.writing-sheet-header'); if (!header && (settingsScroll.current?.scrollTop || 0) > 0) return; const touch = event.touches[0]; settingsSwipe.current = { x: touch.clientX, y: touch.clientY, header }; }}
      onTouchMove={event => { const start = settingsSwipe.current, touch = event.touches[0]; if (start && (event.touches.length !== 1 || !touch || touch.clientY < start.y || Math.abs(touch.clientX - start.x) > Math.max(20, touch.clientY - start.y) || !start.header && (settingsScroll.current?.scrollTop || 0) > 0)) settingsSwipe.current = null; }}
      onTouchEnd={event => { const start = settingsSwipe.current, touch = event.changedTouches[0]; settingsSwipe.current = null; if (start && touch && touch.clientY - start.y > 80 && Math.abs(touch.clientX - start.x) < touch.clientY - start.y) setSettingsOpen(false); }}
      onTouchCancel={() => { settingsSwipe.current = null; }}
      onCloseAutoFocus={event => { event.preventDefault(); (phone ? moreTrigger.current : settingsTrigger.current)?.focus(); }}>
      {phone ? <><header className="writing-sheet-header"><div className="writing-sheet-handle" aria-hidden="true" /><div className="writing-sheet-title-row"><SheetTitle>文章设置</SheetTitle><SheetClose asChild><button ref={settingsClose} type="button" className="writing-sheet-close" aria-label="关闭"><X size={18} aria-hidden="true" /></button></SheetClose></div></header>{settingsDescription}<div ref={settingsScroll} className="writing-sheet-scroll">{settings}</div></> : <><div className="writing-sheet-handle" aria-hidden="true" /><SheetTitle>文章设置</SheetTitle>{settingsDescription}{settings}</>}
      {mediaDialogs}
    </SheetContent></Sheet>
    <input ref={fileInput} type="file" hidden accept="image/*" aria-label="上传封面" disabled={fieldsDisabled || uploads > 0} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadCover(file); event.target.value = ''; }} />
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent className="admin-portal ui-v2 writing-history-dialog" onOpenAutoFocus={event => { event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); historyOrigin.current?.focus(); }}><DialogTitle asChild><h2 ref={historyTitle} tabIndex={-1}>修订历史</h2></DialogTitle><DialogDescription className="sr-only">比较历史版本与当前内容，恢复不会直接发布。</DialogDescription><div ref={element => { if (element && historyHost && !element.contains(historyHost)) element.appendChild(historyHost); }} /></DialogContent></Dialog>
    {d.ready && historyHost && createPortal(<ArticleRevisionHistory draftId={d.draft.id} version={d.draft.version} current={d.form} disabled={historyDisabled} onRestore={d.restore} />, historyHost)}
    {(wide || !settingsOpen) && mediaDialogs}
  </div>;
}
