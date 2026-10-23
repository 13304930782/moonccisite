import { useContentListQuery } from '../lib/useContentListQuery';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { AdminButton } from '../components/admin/AdminButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { safeImageSrc } from '../lib/safeUrl';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-media.css';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon,.jpg,.jpeg,.png,.gif,.webp,.ico';

type MediaStatus = 'active' | 'trashed';

type MediaItem = {
  id?: number;
  filename: string;
  original_name?: string;
  display_name?: string;
  alt_text?: string;
  url: string;
  size: number;
  size_text: string;
  uploaded_at: string;
  updated_at?: string;
  ext: string;
  mime?: string;
  width?: number | null;
  height?: number | null;
  quality?: string;
  status?: MediaStatus;
};

function formatTime(value: string) {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

function mediaName(item: MediaItem) {
  return item.display_name?.trim() || item.filename;
}

function encoded(filename: string) {
  return encodeURIComponent(filename);
}

const requestJson = api;

async function uploadImage(file: File, quality = 'medium') {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('quality', quality);

  return requestJson('/upload/image', {
    method: 'POST',
    body: formData,
  });
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function QualityMenu({ value, onChange, upload = false, disabled = false }: { value: string; onChange: (value: string) => void; upload?: boolean; disabled?: boolean }) {
  const names: Record<string, string> = { low: '低', medium: '中', high: '高', original: '原图' };
  return <DropdownMenu><DropdownMenuTrigger asChild><AdminButton type="button" variant="ghost" disabled={disabled} aria-label={upload ? '上传图片质量' : '压缩图片质量'} className="ui-btn ui-btn--ghost">{upload ? '上传质量' : '压缩质量'}：{names[value]}<ChevronDown size={14} aria-hidden="true" /></AdminButton></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 media-quality-menu"><DropdownMenuRadioGroup value={value} onValueChange={onChange}>{[['low', '低清晰度'], ['medium', '中清晰度'], ['high', '高清晰度'], ...(upload ? [['original', '原图']] : [])].map(([key, label]) => <DropdownMenuRadioItem key={key} value={key}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}

export default function AdminMediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const { params, page, setPage, update: updateQuery } = useContentListQuery();
  const [total, setTotal] = useState(0);
  const search = params.get('q') || '';
  const status: MediaStatus = params.get('status') === 'trashed' ? 'trashed' : 'active';
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [keyword, setKeyword] = useState(search);
  useEffect(() => { setKeyword(search); }, [search]);
  const [uploading, setUploading] = useState(false);
  const [imageQuality, setImageQuality] = useState('medium');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const batchMenuTrigger = useRef<HTMLButtonElement | null>(null);
  const [selectedFilenames, setSelectedFilenames] = useState<string[]>([]);
  const [manualSelection, setManualSelection] = useState(false);
  const [finePointer, setFinePointer] = useState(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  const [displayName, setDisplayName] = useState('');
  const [altText, setAltText] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [recompressQuality, setRecompressQuality] = useState('medium');
  const [saving, setSaving] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setKeyword(''); updateQuery({ q: '', page: '' }); searchInput.current?.focus(); };

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFinePointer(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const queryKey = `${status}:${search}:${page}`;
  const currentQuery = useRef(queryKey);
  currentQuery.current = queryKey;
  const load = async () => {
    if (currentQuery.current !== queryKey) return;
    const version = ++requestVersion.current;
    const current = () => version === requestVersion.current && currentQuery.current === queryKey;
    setLoading(true);
    setLoadError('');
    setMessage('');
    try {
      const data = await api(`/upload/media?${new URLSearchParams({ status, q: search, page: String(page), pageSize: '50' })}`);
      if (!current()) return;
      setItems(data.items);
      setTotal(data.total);
      setSelectedFilenames(current => current.filter(filename => data.items.some((item: MediaItem) => item.filename === filename)));
      if (data.page !== page) setPage(data.page);
    } catch (err: any) {
      if (current()) { setLoadError(err.message || '媒体库加载失败'); }
    } finally { if (current()) setLoading(false); }
  };
  useEffect(() => {
    const nextSearch = keyword.trim();
    if (nextSearch === search) return;
    const timer = setTimeout(() => { updateQuery({ page: '', q: nextSearch }, true); }, 300);
    return () => clearTimeout(timer);
  }, [keyword, search]);
  useEffect(() => {
    setSelected(null);
    setSelectedFilenames([]);
    setManualSelection(false);
    setItems([]);
    void load();
    return () => { requestVersion.current++; };
  }, [status, search, page]);
  const filtered = items;

  const selectedSet = useMemo(() => new Set(selectedFilenames), [selectedFilenames]);
  const selectedCount = selectedFilenames.length;
  const selecting = manualSelection || selectedCount > 0;
  const allVisibleSelected = filtered.length > 0 && filtered.every((item) => selectedSet.has(item.filename));

  const openDetail = (item: MediaItem, trigger: HTMLButtonElement) => {
    detailTrigger.current = trigger;
    setSelected(item);
    setDisplayName(item.display_name || '');
    setAltText(item.alt_text || '');
    setRenameTo(item.filename);
    setRecompressQuality('medium');
    setMessage('');
  };

  const refreshSelected = (item: MediaItem) => {
    setSelected(item);
    setDisplayName(item.display_name || '');
    setAltText(item.alt_text || '');
    setRenameTo(item.filename);
  };

  const toggleOne = (filename: string) => {
    if (saving) return;
    setSelectedFilenames((current) => {
      if (current.includes(filename)) {
        return current.filter((item) => item !== filename);
      }

      return [...current, filename];
    });
  };

  const toggleVisible = () => {
    if (allVisibleSelected) {
      const visible = new Set(filtered.map((item) => item.filename));
      setSelectedFilenames((current) => current.filter((filename) => !visible.has(filename)));
      return;
    }

    setSelectedFilenames((current) => {
      const next = new Set(current);
      filtered.forEach((item) => next.add(item.filename));
      return Array.from(next);
    });
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const result = await uploadImage(file, imageQuality);
      setMessage(`上传成功：${result.url}`);
      await load();
    } catch (err: any) {
      setMessage(err.message || '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await copyText(text);
      setMessage(`${label} 已复制`);
    } catch {
      setMessage('复制失败，请手动复制');
    }
  };

  const saveDetails = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setMessage('');
    let metadataSaved = false;
    try {
      let updated = await requestJson(`/upload/media/${encoded(selected.filename)}`, {
        method: 'PUT',
        body: JSON.stringify({ display_name: displayName, alt_text: altText }),
      });
      metadataSaved = true;
      setItems(current => current.map(item => item.filename === selected.filename ? updated : item));
      // Keep typed fields if the second request fails; the two existing endpoints are not atomic.
      setSelected(updated);
      const renamed = selected.status !== 'trashed' && renameTo !== selected.filename;
      if (renamed) updated = await requestJson(`/upload/media/${encoded(updated.filename)}/rename`, {
        method: 'PUT', body: JSON.stringify({ filename: renameTo }),
      });
      setItems((current) => current.map((item) => (item.filename === selected.filename ? updated : item)));
      setSelectedFilenames((current) => current.map((filename) => (filename === selected.filename ? updated.filename : filename)));
      refreshSelected(updated);
      notify.success(renamed ? '文件名已修改，文章和站点设置中的旧链接已同步替换' : '媒体信息已保存');
    } catch (err: any) {
      const error = metadataSaved ? `显示信息已保存，文件名修改失败：${err.message || '请重试'}` : err.message || '保存失败';
      setMessage(error); notify.error(error);
    } finally {
      setSaving(false);
    }
  };

  const recompress = async () => {
    if (!selected) return;

    setSaving(true);
    setMessage('');

    try {
      const updated = await requestJson(`/upload/media/${encoded(selected.filename)}/recompress`, {
        method: 'POST',
        body: JSON.stringify({ quality: recompressQuality }),
      });

      setItems((current) => current.map((item) => (item.filename === selected.filename ? updated : item)));
      setSelectedFilenames((current) => current.map((filename) => (filename === selected.filename ? updated.filename : filename)));
      setSelected(updated);
      setDisplayName(value => value === (selected.display_name || '') ? updated.display_name || '' : value);
      setAltText(value => value === (selected.alt_text || '') ? updated.alt_text || '' : value);
      setRenameTo(value => value === selected.filename ? updated.filename : value);
      notify.success(`二次压缩完成：${updated.size_text}`);
    } catch (err: any) {
      setMessage(err.message || '二次压缩失败'); notify.error(err.message || '二次压缩失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (force = false) => {
    if (!selected) return;
    if (!force && !(await confirmAction('确定将这个文件移入回收站？'))) return;

    setSaving(true);
    setMessage('');

    try {
      await requestJson(`/upload/media/${encoded(selected.filename)}${force ? '?force=1' : ''}`, {
        method: 'DELETE',
      });

      setSelected(null);
      setSelectedFilenames((current) => current.filter((filename) => filename !== selected.filename));
      notify.success('媒体文件已移入回收站');
      await load();
    } catch (err: any) {
      if (err.status === 409 && !force) {
        const ok = (await confirmAction(`${err.message}\n\n强制删除会让文章里的图片链接失效，确定继续？`));
        if (ok) {
          await deleteFile(true);
          return;
        }
      } else {
        setMessage(err.message || '删除失败'); notify.error(err.message || '删除失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const restoreFile = async () => {
    if (!selected) return;

    setSaving(true);
    setMessage('');

    try {
      await requestJson(`/upload/media/${encoded(selected.filename)}/restore`, {
        method: 'POST',
      });

      setSelected(null);
      setSelectedFilenames((current) => current.filter((filename) => filename !== selected.filename));
      notify.success('媒体文件已恢复');
      await load();
    } catch (err: any) {
      setMessage(err.message || '恢复失败'); notify.error(err.message || '恢复失败');
    } finally {
      setSaving(false);
    }
  };

  const permanentDelete = async () => {
    if (!selected) return;
    if (!(await confirmAction('确定彻底删除？这一步不可恢复。'))) return;

    setSaving(true);
    setMessage('');

    try {
      await requestJson(`/upload/media/${encoded(selected.filename)}/permanent`, {
        method: 'DELETE',
      });

      setSelected(null);
      setSelectedFilenames((current) => current.filter((filename) => filename !== selected.filename));
      notify.success('媒体文件已彻底删除');
      await load();
    } catch (err: any) {
      setMessage(err.message || '彻底删除失败'); notify.error(err.message || '彻底删除失败');
    } finally {
      setSaving(false);
    }
  };

  const batchDelete = async (force = false) => {
    if (!selectedCount) return;
    if (!force && !(await confirmAction(`确定将选中的 ${selectedCount} 个文件移入回收站？`))) return;

    setSaving(true);
    setMessage('');

    try {
      const data = await requestJson('/upload/media/batch/delete', {
        method: 'POST',
        body: JSON.stringify({
          filenames: selectedFilenames,
          force,
        }),
      });

      setSelected(null);
      setSelectedFilenames([]);
      notify.success(data.message || '批量删除完成');
      await load();
    } catch (err: any) {
      if (err.status === 409 && !force) {
        const ok = (await confirmAction(`${err.message}\n\n强制删除会让文章里的图片链接失效，确定继续？`));
        if (ok) {
          await batchDelete(true);
          return;
        }
      }
      // A batch can partially commit before returning an error; re-read without retrying writes.
      await load();
      setMessage(err.message || '批量删除失败'); notify.error(err.message || '批量删除失败');
    } finally {
      setSaving(false);
    }
  };

  const batchRestore = async () => {
    if (!selectedCount) return;

    setSaving(true);
    setMessage('');

    try {
      const data = await requestJson('/upload/media/batch/restore', {
        method: 'POST',
        body: JSON.stringify({ filenames: selectedFilenames }),
      });

      setSelected(null);
      setSelectedFilenames([]);
      notify.success(data.message || '批量恢复完成');
      await load();
    } catch (err: any) {
      await load();
      setMessage(err.message || '批量恢复失败'); notify.error(err.message || '批量恢复失败');
    } finally {
      setSaving(false);
    }
  };

  const batchPermanentDelete = async () => {
    if (!selectedCount) return;
    if (!(await confirmAction(`确定彻底删除选中的 ${selectedCount} 个文件？这一步不可恢复。`))) {
      // The menu item has unmounted; restore its trigger after the dialog closes.
      setTimeout(() => batchMenuTrigger.current?.focus(), 0);
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const data = await requestJson('/upload/media/batch/permanent', {
        method: 'POST',
        body: JSON.stringify({ filenames: selectedFilenames }),
      });

      setSelected(null);
      setSelectedFilenames([]);
      notify.success(data.message || '批量彻底删除完成');
      await load();
    } catch (err: any) {
      await load();
      setMessage(err.message || '批量彻底删除失败'); notify.error(err.message || '批量彻底删除失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`admin-media-page ui-v2${selecting ? ' is-selecting' : ''}${selectedCount ? ' has-selection' : ''}`}>
      <header className="media-page-header">
        <div className="media-page-heading"><h1>媒体库</h1>{!loading && !loadError && <span>{search ? `找到 ${total} 个文件` : `共 ${total} 个文件`}</span>}</div>
        <div className="media-page-actions">
          <AdminButton type="button" disabled={uploading} onClick={() => uploadInput.current?.click()} className="ui-btn ui-btn--solid">{uploading ? '上传中…' : '上传图片'}</AdminButton>
          <QualityMenu value={imageQuality} onChange={setImageQuality} upload disabled={uploading} />
          {!finePointer && <AdminButton type="button" variant="ghost" className="media-selection-toggle ui-btn ui-btn--ghost" aria-pressed={selecting} disabled={saving || loading} onClick={() => { setManualSelection(!selecting); if (selecting) setSelectedFilenames([]); }}>{selecting ? '完成' : '选择'}</AdminButton>}
          <input ref={uploadInput} type="file" hidden accept={IMAGE_ACCEPT} aria-label="上传图片文件" disabled={uploading} onChange={event => { void handleUpload(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
      </header>

      <div className="media-page-toolbar">
        <div className="media-status-tabs" role="group" aria-label="媒体状态">
          <button type="button" aria-pressed={status === 'active'} disabled={saving} onClick={() => { updateQuery({ page: '', status: '' }); }} className="ui-btn ui-btn--ghost">正常文件{status === 'active' && !search && !loading && !loadError && <span>{total}</span>}</button>
          <button type="button" aria-pressed={status === 'trashed'} disabled={saving} onClick={() => { updateQuery({ page: '', status: 'trashed' }); }} className="ui-btn ui-btn--ghost">回收站{status === 'trashed' && !search && !loading && !loadError && <span>{total}</span>}</button>
        </div>
        <div className="media-search-field"><input ref={searchInput} aria-label="搜索媒体文件" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="搜索文件名、显示名、Alt" className="ui-input" />{keyword && <button type="button" className="media-search-clear ui-btn ui-btn--ghost ui-btn--icon" aria-label="清除搜索" onClick={clearSearch}><X size={16} aria-hidden="true" /></button>}</div>
        <DropdownMenu><DropdownMenuTrigger asChild><AdminButton type="button" variant="ghost" className="media-sort-trigger ui-btn ui-btn--ghost">最近更新<ChevronDown size={14} aria-hidden="true" /></AdminButton></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 media-list-menu"><DropdownMenuRadioGroup value="updated"><DropdownMenuRadioItem value="updated">最近更新</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        <AdminButton type="button" variant="ghost" size="icon" className="media-refresh ui-btn ui-btn--ghost ui-btn--icon" aria-label="刷新媒体库" disabled={loading || saving} onClick={() => void load()}><RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" /></AdminButton>
      </div>

      <div className="media-list-content">
      {message && !selected && <p role="alert" className="media-notice">{message}</p>}
      {loadError && <div className="resource-notice" role="alert"><div><strong>{items.length ? '刷新失败，已保留当前图片' : '媒体库加载失败'}</strong><p>{loadError}</p></div><AdminButton type="button" variant="soft" disabled={loading} onClick={() => void load()} className="ui-btn ui-btn--soft">重新加载媒体库</AdminButton></div>}
      {loading && !filtered.length ? <p className="media-empty" role="status">正在加载媒体库…</p> : filtered.length === 0 && !loadError ? <div className="media-empty"><p>{search ? '没有找到匹配的媒体文件。' : status === 'trashed' ? '回收站为空。' : '暂无媒体文件，请先上传图片。'}</p></div> : <div className="media-file-grid">
        {filtered.map(item => {
          const imageUrl = safeImageSrc(item.url), markdown = `![${item.alt_text || mediaName(item)}](${item.url})`, checked = selectedSet.has(item.filename);
          return <article className="media-file" key={item.filename}>
            <div className={`media-file-image${checked ? ' is-selected' : ''}`}>
              <button type="button" className="media-detail-trigger" aria-label={mediaName(item)} disabled={saving && selecting} onClick={event => selecting ? toggleOne(item.filename) : openDetail(item, event.currentTarget)}>{imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <ImageIcon size={32} aria-hidden="true" />}</button>
              <label className="media-file-select"><input type="checkbox" aria-label={`选择 ${mediaName(item)}`} checked={checked} disabled={saving} onChange={() => toggleOne(item.filename)} /><span aria-hidden="true"><Check size={18} strokeWidth={2.5} /></span></label>
              {finePointer && !selecting && <div className="media-card-actions"><button type="button" onClick={() => void handleCopy(item.url, '图片 URL')} aria-label={`复制 ${mediaName(item)} 的 URL`}>URL</button><button type="button" onClick={() => void handleCopy(markdown, 'Markdown')} aria-label={`复制 ${mediaName(item)} 的 Markdown`}>MD</button><button type="button" onClick={event => openDetail(item, event.currentTarget)} aria-label={`打开 ${mediaName(item)} 的详情`}>打开</button></div>}
            </div>
            <p className="media-file-name" title={mediaName(item)}>{mediaName(item)}</p>
            <p className="media-file-meta">{item.size_text} · {new Date(item.uploaded_at).toLocaleDateString('zh-CN')}</p>
          </article>;
        })}
      </div>}

      {(total > 50 || page > 1) ? <nav aria-label="媒体库分页" className="media-pagination"><AdminButton type="button" variant="ghost" disabled={loading || saving || page <= 1} onClick={() => setPage(page - 1)} className="ui-btn ui-btn--ghost">上一页</AdminButton><span>第 {page} / {Math.max(1, Math.ceil(total / 50))} 页</span><AdminButton type="button" variant="ghost" disabled={loading || saving || page * 50 >= total} onClick={() => setPage(page + 1)} className="ui-btn ui-btn--ghost">下一页</AdminButton></nav> : !loading && !loadError && filtered.length > 0 && <p className="media-page-end">已显示 {filtered.length} 个文件</p>}

      </div>
      {selectedCount > 0 && <div className="media-batch-bar" role="region" aria-label="批量媒体操作">
        <div className="media-batch-actions">
          <button type="button" className="media-batch-icon ui-btn ui-btn--ghost ui-btn--icon" aria-label="清空选择" disabled={saving} onClick={() => setSelectedFilenames([])}><X size={20} aria-hidden="true" /></button>
          <span role="status" aria-live="polite">已选 {selectedCount} 项</span>
          {status === 'active' ? <><button type="button" aria-label="全选本页" disabled={saving || allVisibleSelected || !filtered.length} onClick={toggleVisible} className="ui-btn ui-btn--ghost">全选</button><button type="button" className="media-batch-icon media-batch-danger ui-btn ui-btn--ghost ui-btn--icon ui-btn--danger" aria-label="删除到回收站" disabled={saving} onClick={() => void batchDelete(false)}><Trash2 size={20} aria-hidden="true" /></button></> : <><button type="button" disabled={saving} onClick={() => void batchRestore()} className="ui-btn ui-btn--ghost">恢复</button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" ref={batchMenuTrigger} className="media-batch-icon ui-btn ui-btn--ghost ui-btn--icon" aria-label="更多批量操作" disabled={saving}><MoreHorizontal size={20} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 media-list-menu"><DropdownMenuItem disabled={saving || allVisibleSelected || !filtered.length} onSelect={toggleVisible}>全选本页</DropdownMenuItem><DropdownMenuItem className="media-menu-danger" disabled={saving} onSelect={() => void batchPermanentDelete()}><Trash2 size={18} aria-hidden="true" />彻底删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu></>}
        </div>
      </div>}

      {selected && <Dialog open onOpenChange={open => { if (!open && !saving) setSelected(null); }}>
        <DialogContent className="admin-portal ui-v2 media-detail-drawer" onCloseAutoFocus={event => { if (detailTrigger.current?.isConnected) { event.preventDefault(); detailTrigger.current.focus(); } }}>
          <header className="media-detail-heading"><DialogTitle>{mediaName(selected)}</DialogTitle><DialogDescription>{selected.filename}</DialogDescription></header>
          <form className="media-detail-form" onSubmit={event => { event.preventDefault(); void saveDetails(); }}>
            <div className="media-detail-scroll">
              <div className="media-detail-preview">{safeImageSrc(selected.url) ? <img src={safeImageSrc(selected.url)} alt={mediaName(selected)} /> : <ImageIcon size={40} aria-label="图片暂不可预览" />}</div>
              <div className="media-detail-links"><AdminButton type="button" variant="soft" onClick={() => void handleCopy(selected.url, '图片 URL')} className="ui-btn ui-btn--soft">复制链接</AdminButton><AdminButton type="button" variant="soft" onClick={() => void handleCopy(`![${altText || mediaName(selected)}](${selected.url})`, 'Markdown')} className="ui-btn ui-btn--soft">复制 Markdown</AdminButton>{safeImageSrc(selected.url) && <AdminButton type="button" variant="soft" asChild className="ui-btn ui-btn--soft"><a href={safeImageSrc(selected.url)} target="_blank" rel="noopener noreferrer">打开原图</a></AdminButton>}</div>
              {message && <p role="alert" className="media-notice">{message}</p>}
              <fieldset disabled={saving} className="media-detail-fields">
                <label>链接显示名<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="例如：首页封面图" className="ui-input" /></label>
                <label>Alt 文本<input value={altText} onChange={event => setAltText(event.target.value)} placeholder="给搜索引擎和无障碍阅读器看的图片说明" className="ui-input" /></label>
                <label>文件名<input value={renameTo} readOnly={selected.status === 'trashed'} onChange={event => setRenameTo(event.target.value)} placeholder={selected.filename} aria-describedby="media-rename-hint" className="ui-input" /></label>
                <p id="media-rename-hint">{selected.status === 'trashed' ? '恢复文件后可以修改文件名' : '修改文件名会同步更新文章里的引用'}</p>
              </fieldset>
              <div className="media-detail-compression"><div className="media-detail-metadata">{selected.size_text} · {selected.mime || selected.ext} · {selected.width && selected.height ? `${selected.width} × ${selected.height}` : '-'}<br />{formatTime(selected.uploaded_at)}</div>{selected.status !== 'trashed' && <div className="media-compression-actions"><QualityMenu value={recompressQuality} onChange={setRecompressQuality} disabled={saving} /><AdminButton type="button" variant="soft" disabled={saving} onClick={() => void recompress()} className="ui-btn ui-btn--soft">二次压缩</AdminButton></div>}</div>
            </div>
            <footer className="media-detail-footer"><div>{selected.status !== 'trashed' ? <AdminButton type="button" variant="ghost" className="media-danger ui-btn ui-btn--ghost ui-btn--danger" disabled={saving} onClick={() => void deleteFile(false)}>删除到回收站</AdminButton> : <><AdminButton type="button" variant="ghost" disabled={saving} onClick={() => void restoreFile()} className="ui-btn ui-btn--ghost">恢复</AdminButton><AdminButton type="button" variant="ghost" className="media-danger ui-btn ui-btn--ghost ui-btn--danger" disabled={saving} onClick={() => void permanentDelete()}>彻底删除</AdminButton></>}</div><div><AdminButton type="button" variant="ghost" disabled={saving} onClick={() => setSelected(null)} className="ui-btn ui-btn--ghost">取消</AdminButton><AdminButton type="submit" disabled={saving} aria-label="保存显示信息" className="ui-btn ui-btn--solid">{saving ? '保存中…' : '保存'}</AdminButton></div></footer>
          </form>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
