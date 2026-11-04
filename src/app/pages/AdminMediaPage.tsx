import { useI18n } from '../i18n';
import { useContentListQuery } from '../lib/useContentListQuery';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { AdminEmpty, AdminError, AdminLoading } from '../components/admin/AdminState';
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

function formatTime(value: string, locale = 'zh-CN') {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString(locale, {timeZone:'Asia/Shanghai', hour12: false });
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
  const { locale,  t } = useI18n();
  const names: Record<string, string> = { low: t("m_aa9e366f68"), medium: t("m_a567bdaa11"), high: t("m_b1c27820fe"), original: t("m_4b1db520af") };
  return <DropdownMenu><DropdownMenuTrigger asChild><AdminButton type="button" variant="ghost" disabled={disabled} aria-label={upload ? t("m_35bf0ca5b1") : t("m_9f52b1da16")} className="ui-btn ui-btn--ghost media-quality-trigger">{upload ? t("m_279e0b7903") : t("m_dc9c099507")}：{names[value]}<ChevronDown size={14} aria-hidden="true" /></AdminButton></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 media-quality-menu"><DropdownMenuRadioGroup value={value} onValueChange={onChange}>{[['low', t("m_4bee13b9c9")], ['medium', t("m_59efa81244")], ['high', t("m_5d421b6eef")], ...(upload ? [['original', t("m_4b1db520af")]] : [])].map(([key, label]) => <DropdownMenuRadioItem key={key} value={key}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}

export default function AdminMediaPage() {
  const { locale,  t } = useI18n();
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
      if (data.page !== page) setPage(data.page, true);
    } catch (err: any) {
      if (current()) { setLoadError(err.message || t("m_2c429e2bf0")); }
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
      setMessage(t("m_34dd3d16f0", {v0: result.url}));
      await load();
    } catch (err: any) {
      setMessage(err.message || t("m_2a1aa07b1f"));
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await copyText(text);
      setMessage(t("m_01e4bff251", {v0: label}));
    } catch {
      setMessage(t("m_97f4308501"));
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
      notify.success(renamed ? t("m_f7c2095ec7") : t("m_f3fce825b8"));
    } catch (err: any) {
      const error = metadataSaved ? t("m_9d9635df6b", {v0: err.message || t("m_a2577bae3c")}) : err.message || t("m_6309a3bb5b");
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
      notify.success(t("m_36ddf85f15", {v0: updated.size_text}));
    } catch (err: any) {
      setMessage(err.message || t("m_28b0969e1a")); notify.error(err.message || t("m_28b0969e1a"));
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (force = false) => {
    if (!selected) return;
    if (!force && !(await confirmAction(t("m_5e69373c2b")))) return;

    setSaving(true);
    setMessage('');

    try {
      await requestJson(`/upload/media/${encoded(selected.filename)}${force ? '?force=1' : ''}`, {
        method: 'DELETE',
      });

      setSelected(null);
      setSelectedFilenames((current) => current.filter((filename) => filename !== selected.filename));
      notify.success(t("m_58904817e6"));
      await load();
    } catch (err: any) {
      if (err.status === 409 && !force) {
        const ok = (await confirmAction(t("m_984b2f6175", {v0: err.message})));
        if (ok) {
          await deleteFile(true);
          return;
        }
      } else {
        setMessage(err.message || t("m_c228558cf2")); notify.error(err.message || t("m_c228558cf2"));
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
      notify.success(t("m_62a5696d0d"));
      await load();
    } catch (err: any) {
      setMessage(err.message || t("m_89281a45e0")); notify.error(err.message || t("m_89281a45e0"));
    } finally {
      setSaving(false);
    }
  };

  const permanentDelete = async () => {
    if (!selected) return;
    if (!(await confirmAction(t("m_48e2311103")))) return;

    setSaving(true);
    setMessage('');

    try {
      await requestJson(`/upload/media/${encoded(selected.filename)}/permanent`, {
        method: 'DELETE',
      });

      setSelected(null);
      setSelectedFilenames((current) => current.filter((filename) => filename !== selected.filename));
      notify.success(t("m_9a7af4d584"));
      await load();
    } catch (err: any) {
      setMessage(err.message || t("m_8f648036ae")); notify.error(err.message || t("m_8f648036ae"));
    } finally {
      setSaving(false);
    }
  };

  const batchDelete = async (force = false) => {
    if (!selectedCount) return;
    if (!force && !(await confirmAction(t("m_10638c7e21", {v0: selectedCount})))) return;

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
      notify.success(data.message || t("m_cf08c18b77"));
      await load();
    } catch (err: any) {
      if (err.status === 409 && !force) {
        const ok = (await confirmAction(t("m_984b2f6175", {v0: err.message})));
        if (ok) {
          await batchDelete(true);
          return;
        }
      }
      // A batch can partially commit before returning an error; re-read without retrying writes.
      await load();
      setMessage(err.message || t("m_27b8c99cf5")); notify.error(err.message || t("m_27b8c99cf5"));
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
      notify.success(data.message || t("m_5839c44cc2"));
      await load();
    } catch (err: any) {
      await load();
      setMessage(err.message || t("m_53aa621948")); notify.error(err.message || t("m_53aa621948"));
    } finally {
      setSaving(false);
    }
  };

  const batchPermanentDelete = async () => {
    if (!selectedCount) return;
    if (!(await confirmAction(t("m_d9aae5b4b1", {v0: selectedCount})))) {
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
      notify.success(data.message || t("m_251ce66c25"));
      await load();
    } catch (err: any) {
      await load();
      setMessage(err.message || t("m_325ae4d2d7")); notify.error(err.message || t("m_325ae4d2d7"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`admin-media-page ui-v2${selecting ? ' is-selecting' : ''}${selectedCount ? ' has-selection' : ''}`}>
      <header className="media-page-header">
        <div className="media-page-heading"><h1>{t("m_d771576fc0")}</h1>{!loading && !loadError && <span>{search ? t("m_82aed126bc", {v0: total}) : t("m_40c477a816", {v0: total})}</span>}</div>
        <div className="media-page-actions">
          {(loading || loadError || search || status !== 'active' || total > 0) && <AdminButton type="button" disabled={uploading} onClick={() => uploadInput.current?.click()} className="ui-btn ui-btn--solid media-upload-primary">{uploading ? t("m_ce1c9d6156") : t("m_9fbb4750bb")}</AdminButton>}
          <QualityMenu value={imageQuality} onChange={setImageQuality} upload disabled={uploading} />
          {!finePointer && <AdminButton type="button" variant="ghost" className="media-selection-toggle ui-btn ui-btn--ghost" aria-pressed={selecting} disabled={saving || loading} onClick={() => { setManualSelection(!selecting); if (selecting) setSelectedFilenames([]); }}>{selecting ? t("m_c0b3fbff51") : t("m_c11330b852")}</AdminButton>}
          <input ref={uploadInput} type="file" hidden accept={IMAGE_ACCEPT} aria-label={t("m_115e7e5880")} disabled={uploading} onChange={event => { void handleUpload(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
      </header>

      <div className="media-page-toolbar">
        <div className="media-status-tabs" role="group" aria-label={t("m_1dc7ec1b31")}>
          <button type="button" aria-pressed={status === 'active'} disabled={saving} onClick={() => { updateQuery({ page: '', status: '' }); }} className="ui-btn ui-btn--ghost">{t("m_9cb8d4d526")}{status === 'active' && !search && !loading && !loadError && <span>{total}</span>}</button>
          <button type="button" aria-pressed={status === 'trashed'} disabled={saving} onClick={() => { updateQuery({ page: '', status: 'trashed' }); }} className="ui-btn ui-btn--ghost">{t("m_ba35dc23b2")}{status === 'trashed' && !search && !loading && !loadError && <span>{total}</span>}</button>
        </div>
        <div className="media-search-field"><input ref={searchInput} aria-label={t("m_d6269d2cb0")} value={keyword} onChange={event => setKeyword(event.target.value)} placeholder={t("m_67d68d84b6")} className="ui-input" />{keyword && <button type="button" className="media-search-clear ui-btn ui-btn--ghost ui-btn--icon" aria-label={t("m_ee32f25f70")} onClick={clearSearch}><X size={16} aria-hidden="true" /></button>}</div>
        <DropdownMenu><DropdownMenuTrigger asChild><AdminButton type="button" variant="ghost" className="media-sort-trigger ui-btn ui-btn--ghost">{t("m_b067526e73")}<ChevronDown size={14} aria-hidden="true" /></AdminButton></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 media-list-menu"><DropdownMenuRadioGroup value="updated"><DropdownMenuRadioItem value="updated">{t("m_b067526e73")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        <AdminButton type="button" variant="ghost" size="icon" className="media-refresh ui-btn ui-btn--ghost ui-btn--icon" aria-label={t("m_0114937f5d")} disabled={loading || saving} onClick={() => void load()}><RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" /></AdminButton>
      </div>

      <div className="media-list-content">
      {message && !selected && <p role="alert" className="media-notice">{t(message || '')}</p>}
      {loadError && <AdminError message={items.length ? `${t("m_5eeaf6dc35")}：${t(loadError)}` : t(loadError)} onRetry={loading ? undefined : () => void load()} />}
      {loading && !filtered.length ? <AdminLoading label={t("m_ca1a598c1f")} /> : filtered.length === 0 && !loadError ? <div className="admin-empty-result"><AdminEmpty
        title={t(search ? 'media.empty.search.title' : status === 'trashed' ? 'media.empty.trash.title' : 'media.empty.active.title')}
        hint={t(search ? 'media.empty.search.hint' : status === 'trashed' ? 'media.empty.trash.hint' : 'media.empty.active.hint')}
        action={search ? <button type="button" className="quiet-button" onClick={clearSearch}>{t('media.empty.clear')}</button> : status === 'active' ? <button type="button" className="ui-btn media-upload-primary" disabled={uploading} onClick={()=>uploadInput.current?.click()}>{t(uploading ? "m_ce1c9d6156" : "m_9fbb4750bb")}</button> : undefined}
      /></div> : <div className="media-file-grid">
        {filtered.map(item => {
          const imageUrl = safeImageSrc(item.url), markdown = `![${item.alt_text || mediaName(item)}](${item.url})`, checked = selectedSet.has(item.filename);
          return <article className="media-file" key={item.filename}>
            <div className={`media-file-image${checked ? ' is-selected' : ''}`}>
              <button type="button" className="media-detail-trigger" aria-label={mediaName(item)} disabled={saving && selecting} onClick={event => selecting ? toggleOne(item.filename) : openDetail(item, event.currentTarget)}>{imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <ImageIcon size={32} aria-hidden="true" />}</button>
              <label className="media-file-select"><input type="checkbox" aria-label={t("m_2bb6946df9", {v0: mediaName(item)})} checked={checked} disabled={saving} onChange={() => toggleOne(item.filename)} /><span aria-hidden="true"><Check size={18} strokeWidth={2.5} /></span></label>
              {finePointer && !selecting && <div className="media-card-actions"><button type="button" onClick={() => void handleCopy(item.url, t("m_5146a7b223"))} aria-label={t("m_d5791ecd0e", {v0: mediaName(item)})}>URL</button><button type="button" onClick={() => void handleCopy(markdown, 'Markdown')} aria-label={t("m_44c6d9798d", {v0: mediaName(item)})}>MD</button><button type="button" onClick={event => openDetail(item, event.currentTarget)} aria-label={t("m_70d8b960a1", {v0: mediaName(item)})}>{t("m_c771248e51")}</button></div>}
            </div>
            <p className="media-file-name" title={mediaName(item)}>{mediaName(item)}</p>
            <p className="media-file-meta">{item.size_text} · {new Date(item.uploaded_at).toLocaleDateString(locale,{timeZone:'Asia/Shanghai'})}</p>
          </article>;
        })}
      </div>}

      {(total > 50 || page > 1) ? <nav aria-label={t("m_e824f71c3d")} className="media-pagination"><AdminButton type="button" variant="ghost" disabled={loading || saving || page <= 1} onClick={() => setPage(page - 1)} className="ui-btn ui-btn--ghost">{t("m_c9b9ae7a61")}</AdminButton><span>{t("m_af50a0fe2a")} {page} / {Math.max(1, Math.ceil(total / 50))}  {t("m_d24d3c9946")}</span><AdminButton type="button" variant="ghost" disabled={loading || saving || page * 50 >= total} onClick={() => setPage(page + 1)} className="ui-btn ui-btn--ghost">{t("m_8a8542f696")}</AdminButton></nav> : !loading && !loadError && filtered.length > 0 && <p className="media-page-end">{t("m_326fee0b90")} {filtered.length}  {t("m_2d4a2ac123")}</p>}

      </div>
      {selectedCount > 0 && <div className="media-batch-bar" role="region" aria-label={t("m_99041501eb")}>
        <div className="media-batch-actions">
          <button type="button" className="media-batch-icon ui-btn ui-btn--ghost ui-btn--icon" aria-label={t("m_a3c9748924")} disabled={saving} onClick={() => setSelectedFilenames([])}><X size={20} aria-hidden="true" /></button>
          <span role="status" aria-live="polite">{t("m_9850ed41a5", {count:selectedCount})}</span>
          {status === 'active' ? <><button type="button" aria-label={t("m_4cabaad357")} disabled={saving || allVisibleSelected || !filtered.length} onClick={toggleVisible} className="ui-btn ui-btn--ghost">{t("m_3a5040b68a")}</button><button type="button" className="media-batch-icon media-batch-danger ui-btn ui-btn--ghost ui-btn--icon ui-btn--danger" aria-label={t("m_fdf084d637")} disabled={saving} onClick={() => void batchDelete(false)}><Trash2 size={20} aria-hidden="true" /></button></> : <><button type="button" disabled={saving} onClick={() => void batchRestore()} className="ui-btn ui-btn--ghost">{t("m_e0534b8a4e")}</button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" ref={batchMenuTrigger} className="media-batch-icon ui-btn ui-btn--ghost ui-btn--icon" aria-label={t("m_cbcea63ced")} disabled={saving}><MoreHorizontal size={20} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-portal ui-v2 media-list-menu"><DropdownMenuItem disabled={saving || allVisibleSelected || !filtered.length} onSelect={toggleVisible}>{t("m_4cabaad357")}</DropdownMenuItem><DropdownMenuItem className="media-menu-danger" disabled={saving} onSelect={() => void batchPermanentDelete()}><Trash2 size={18} aria-hidden="true" />{t("m_7aa6d0ef5f")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></>}
        </div>
      </div>}

      {selected && <Dialog open onOpenChange={open => { if (!open && !saving) setSelected(null); }}>
        <DialogContent className="admin-portal ui-v2 media-detail-drawer" onCloseAutoFocus={event => { if (detailTrigger.current?.isConnected) { event.preventDefault(); detailTrigger.current.focus(); } }}>
          <header className="media-detail-heading"><DialogTitle>{mediaName(selected)}</DialogTitle><DialogDescription>{selected.filename}</DialogDescription></header>
          <form className="media-detail-form" onSubmit={event => { event.preventDefault(); void saveDetails(); }}>
            <div className="media-detail-scroll">
              <div className="media-detail-preview">{safeImageSrc(selected.url) ? <img src={safeImageSrc(selected.url)} alt={mediaName(selected)} /> : <ImageIcon size={40} aria-label={t("m_e30a05b4e8")} />}</div>
              <div className="media-detail-links"><AdminButton type="button" variant="soft" onClick={() => void handleCopy(selected.url, t("m_5146a7b223"))} className="ui-btn ui-btn--soft">{t("m_8e86f9b1d5")}</AdminButton><AdminButton type="button" variant="soft" onClick={() => void handleCopy(`![${altText || mediaName(selected)}](${selected.url})`, 'Markdown')} className="ui-btn ui-btn--soft">{t("m_f9c71ee4c4")}</AdminButton>{safeImageSrc(selected.url) && <AdminButton type="button" variant="soft" asChild className="ui-btn ui-btn--soft"><a href={safeImageSrc(selected.url)} target="_blank" rel="noopener noreferrer">{t("m_f75e08cc28")}</a></AdminButton>}</div>
              {message && <p role="alert" className="media-notice">{t(message || '')}</p>}
              <fieldset disabled={saving} className="media-detail-fields">
                <label>{t("m_55b6a747e6")}<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={t("m_c581467ad5")} className="ui-input" /></label>
                <label>{t("m_47a92882b8")}<input value={altText} onChange={event => setAltText(event.target.value)} placeholder={t("m_e7a8511ded")} className="ui-input" /></label>
                <label>{t("m_a6e48adc26")}<input value={renameTo} readOnly={selected.status === 'trashed'} onChange={event => setRenameTo(event.target.value)} placeholder={selected.filename} aria-describedby="media-rename-hint" className="ui-input" /></label>
                <p id="media-rename-hint">{selected.status === 'trashed' ? t("m_da81d58c57") : t("m_163481919e")}</p>
              </fieldset>
              <div className="media-detail-compression"><div className="media-detail-metadata">{selected.size_text} · {selected.mime || selected.ext} · {selected.width && selected.height ? `${selected.width} × ${selected.height}` : '-'}<br />{formatTime(selected.uploaded_at,locale)}</div>{selected.status !== 'trashed' && <div className="media-compression-actions"><QualityMenu value={recompressQuality} onChange={setRecompressQuality} disabled={saving} /><AdminButton type="button" variant="soft" disabled={saving} onClick={() => void recompress()} className="ui-btn ui-btn--soft">{t("m_9e60334e72")}</AdminButton></div>}</div>
            </div>
            <footer className="media-detail-footer"><div>{selected.status !== 'trashed' ? <AdminButton type="button" variant="ghost" className="media-danger ui-btn ui-btn--ghost ui-btn--danger" disabled={saving} onClick={() => void deleteFile(false)}>{t("m_fdf084d637")}</AdminButton> : <><AdminButton type="button" variant="ghost" disabled={saving} onClick={() => void restoreFile()} className="ui-btn ui-btn--ghost">{t("m_e0534b8a4e")}</AdminButton><AdminButton type="button" variant="ghost" className="media-danger ui-btn ui-btn--ghost ui-btn--danger" disabled={saving} onClick={() => void permanentDelete()}>{t("m_7aa6d0ef5f")}</AdminButton></>}</div><div><AdminButton type="button" variant="ghost" disabled={saving} onClick={() => setSelected(null)} className="ui-btn ui-btn--ghost">{t("m_2cd0f3be87")}</AdminButton><AdminButton type="submit" disabled={saving} aria-label={t("m_da70a6690e")} className="ui-btn ui-btn--solid">{saving ? t("m_ff509c9ba0") : t("m_a3030bf8f1")}</AdminButton></div></footer>
          </form>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
