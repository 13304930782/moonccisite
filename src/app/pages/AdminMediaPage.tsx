import { ThemeSelect } from '../components/ThemeSelect';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Eye,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  RotateCw,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { safeImageSrc } from '../lib/safeUrl';

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

async function requestJson(path: string, options: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err: any = new Error(data.message || '请求失败');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

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

export default function AdminMediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imageQuality, setImageQuality] = useState('medium');
  const [status, setStatus] = useState<MediaStatus>('active');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [selectedFilenames, setSelectedFilenames] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [altText, setAltText] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [recompressQuality, setRecompressQuality] = useState('medium');
  const [saving, setSaving] = useState(false);

  const queryKey = `${status}:${search}:${page}`;
  const currentQuery = useRef(queryKey);
  currentQuery.current = queryKey;
  const load = async () => {
    const version = ++requestVersion.current;
    const current = () => version === requestVersion.current && currentQuery.current === queryKey;
    setLoading(true);
    setMessage('');
    try {
      const data = await api(`/upload/media?${new URLSearchParams({ status, q: search, page: String(page), pageSize: '50' })}`);
      if (!current()) return;
      setItems(data.items);
      setTotal(data.total);
      if (data.page !== page) setPage(data.page);
    } catch (err: any) {
      if (current()) { setItems([]); setMessage(err.message || '媒体库加载失败'); }
    } finally { if (current()) setLoading(false); }
  };
  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setSearch(keyword.trim()); }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);
  useEffect(() => {
    setSelected(null);
    setSelectedFilenames([]);
    setItems([]);
    void load();
    return () => { requestVersion.current++; };
  }, [status, search, page]);
  const filtered = items;

  const selectedSet = useMemo(() => new Set(selectedFilenames), [selectedFilenames]);
  const selectedCount = selectedFilenames.length;
  const allVisibleSelected = filtered.length > 0 && filtered.every((item) => selectedSet.has(item.filename));

  const openDetail = (item: MediaItem) => {
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

  const saveMeta = async () => {
    if (!selected) return;

    setSaving(true);
    setMessage('');

    try {
      const updated = await requestJson(`/upload/media/${encoded(selected.filename)}`, {
        method: 'PUT',
        body: JSON.stringify({
          display_name: displayName,
          alt_text: altText,
        }),
      });

      setItems((current) => current.map((item) => (item.filename === selected.filename ? updated : item)));
      refreshSelected(updated);
      setMessage('媒体信息已保存');
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const renameFile = async () => {
    if (!selected) return;

    setSaving(true);
    setMessage('');

    try {
      const updated = await requestJson(`/upload/media/${encoded(selected.filename)}/rename`, {
        method: 'PUT',
        body: JSON.stringify({ filename: renameTo }),
      });

      setItems((current) => current.map((item) => (item.filename === selected.filename ? updated : item)));
      setSelectedFilenames((current) => current.map((filename) => (filename === selected.filename ? updated.filename : filename)));
      refreshSelected(updated);
      setMessage('文件名已修改，文章和站点设置中的旧链接已同步替换');
    } catch (err: any) {
      setMessage(err.message || '改名失败');
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
      refreshSelected(updated);
      setMessage(`二次压缩完成：${updated.size_text}`);
    } catch (err: any) {
      setMessage(err.message || '二次压缩失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (force = false) => {
    if (!selected) return;

    setSaving(true);
    setMessage('');

    try {
      await requestJson(`/upload/media/${encoded(selected.filename)}${force ? '?force=1' : ''}`, {
        method: 'DELETE',
      });

      setSelected(null);
      setSelectedFilenames((current) => current.filter((filename) => filename !== selected.filename));
      setMessage('媒体文件已移入回收站');
      await load();
    } catch (err: any) {
      if (err.status === 409 && !force) {
        const ok = window.confirm(`${err.message}\n\n强制删除会让文章里的图片链接失效，确定继续？`);
        if (ok) {
          await deleteFile(true);
          return;
        }
      } else {
        setMessage(err.message || '删除失败');
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
      setMessage('媒体文件已恢复');
      await load();
    } catch (err: any) {
      setMessage(err.message || '恢复失败');
    } finally {
      setSaving(false);
    }
  };

  const permanentDelete = async () => {
    if (!selected) return;
    if (!window.confirm('确定彻底删除？这一步不可恢复。')) return;

    setSaving(true);
    setMessage('');

    try {
      await requestJson(`/upload/media/${encoded(selected.filename)}/permanent`, {
        method: 'DELETE',
      });

      setSelected(null);
      setSelectedFilenames((current) => current.filter((filename) => filename !== selected.filename));
      setMessage('媒体文件已彻底删除');
      await load();
    } catch (err: any) {
      setMessage(err.message || '彻底删除失败');
    } finally {
      setSaving(false);
    }
  };

  const batchDelete = async (force = false) => {
    if (!selectedCount) return;

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
      setMessage(data.message || '批量删除完成');
      await load();
    } catch (err: any) {
      if (err.status === 409 && !force) {
        const ok = window.confirm(`${err.message}\n\n强制删除会让文章里的图片链接失效，确定继续？`);
        if (ok) {
          await batchDelete(true);
          return;
        }
      } else {
        setMessage(err.message || '批量删除失败');
      }
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
      setMessage(data.message || '批量恢复完成');
      await load();
    } catch (err: any) {
      setMessage(err.message || '批量恢复失败');
    } finally {
      setSaving(false);
    }
  };

  const batchPermanentDelete = async () => {
    if (!selectedCount) return;
    if (!window.confirm(`确定彻底删除选中的 ${selectedCount} 个文件？这一步不可恢复。`)) return;

    setSaving(true);
    setMessage('');

    try {
      const data = await requestJson('/upload/media/batch/permanent', {
        method: 'POST',
        body: JSON.stringify({ filenames: selectedFilenames }),
      });

      setSelected(null);
      setSelectedFilenames([]);
      setMessage(data.message || '批量彻底删除完成');
      await load();
    } catch (err: any) {
      setMessage(err.message || '批量彻底删除失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[10px] border border-border bg-card p-8 shadow-none ">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="admin-title">媒体库</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              管理上传图片，支持预览、复制链接、改显示名、改文件名、回收站、批量操作和二次压缩。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ThemeSelect
              value={imageQuality}
              onValueChange={(nextValue) => setImageQuality(nextValue)}
              className="rounded-[10px] border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="low">低清晰度</option>
              <option value="medium">中清晰度</option>
              <option value="high">高清晰度</option>
              <option value="original">原图</option>
            </ThemeSelect>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-muted px-5 py-3 text-sm text-foreground hover:bg-muted">
              <Upload className="h-4 w-4" />
              {uploading ? '上传中...' : '上传图片'}
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
            </label>

            <button
              type="button"
              onClick={load}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-muted px-5 py-3 text-sm text-foreground hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setPage(1); setStatus('active'); }}
              className={`rounded-[10px] px-4 py-2 text-sm ${status === 'active' ? 'bg-muted text-foreground' : 'bg-muted text-foreground'}`}
            >
              正常文件
            </button>
            <button
              type="button"
              onClick={() => { setPage(1); setStatus('trashed'); }}
              className={`rounded-[10px] px-4 py-2 text-sm ${status === 'trashed' ? 'bg-muted text-foreground' : 'bg-muted text-foreground'}`}
            >
              回收站
            </button>
          </div>

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring lg:max-w-md"
            placeholder="搜索文件名、显示名、Alt..."
          />

          <p className="text-sm text-muted-foreground">
            共 {total} 个文件，本页 {filtered.length} 个
          </p>
        </div>

        <nav aria-label="媒体库分页" className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-4 py-2 disabled:opacity-50">上一页</button>
          <span>第 {page} / {Math.max(1, Math.ceil(total / 50))} 页</span>
          <button type="button" disabled={loading || page * 50 >= total} onClick={() => setPage(page + 1)} className="rounded border px-4 py-2 disabled:opacity-50">下一页</button>
        </nav>
        <div className="mt-5 flex flex-col gap-3 rounded-[10px] bg-muted p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleVisible}
              disabled={filtered.length === 0}
              className="rounded-[10px] border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              {allVisibleSelected ? '取消本页全选' : '本页全选'}
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilenames([])}
              disabled={selectedCount === 0}
              className="rounded-[10px] border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              清空选择
            </button>

            <span className="text-sm text-muted-foreground">已选择 {selectedCount} 个</span>
          </div>

          {status === 'active' ? (
            <button
              type="button"
              disabled={selectedCount === 0 || saving}
              onClick={() => batchDelete(false)}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-red-600 px-5 py-2.5 text-sm text-foreground hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              批量删除到回收站
            </button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={selectedCount === 0 || saving}
                onClick={batchRestore}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-muted px-5 py-2.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" />
                批量恢复
              </button>

              <button
                type="button"
                disabled={selectedCount === 0 || saving}
                onClick={batchPermanentDelete}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-red-600 px-5 py-2.5 text-sm text-foreground hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                批量彻底删除
              </button>
            </div>
          )}
        </div>

        {message && (
          <div className="mt-5 rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-muted-foreground">
          正在加载媒体库...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-6 text-muted-foreground">
          暂无媒体文件。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((item) => {
            const imageUrl = safeImageSrc(item.url);
            const markdown = `![${item.alt_text || mediaName(item)}](${item.url})`;
            const checked = selectedSet.has(item.filename);

            return (
              <div key={item.filename} className={`overflow-hidden rounded-[10px] border bg-card shadow-none ${checked ? 'border-border ring-2 ring-ring' : 'border-border'}`}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => openDetail(item)}
                    className="flex h-48 w-full items-center justify-center bg-muted"
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt={mediaName(item)} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-muted-foreground" />
                    )}
                  </button>

                  <label className="absolute left-3 top-3 inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-card px-3 py-2 text-xs font-medium text-foreground shadow-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(item.filename)}
                      className="h-4 w-4 rounded border-border text-foreground"
                    />
                    选择
                  </label>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <p className="truncate text-sm font-medium text-foreground" title={mediaName(item)}>
                      {mediaName(item)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.size_text} · {item.ext} · {formatTime(item.uploaded_at)}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => openDetail(item)}
                      className="inline-flex items-center justify-center gap-1 rounded-[6px] bg-muted px-3 py-2 text-xs text-foreground hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      打开
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.url, '图片 URL')}
                      className="inline-flex items-center justify-center gap-1 rounded-[6px] bg-muted px-3 py-2 text-xs text-foreground hover:bg-muted"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      URL
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(markdown, 'Markdown')}
                      className="inline-flex items-center justify-center gap-1 rounded-[6px] bg-muted px-3 py-2 text-xs text-foreground hover:bg-muted"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      MD
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-muted p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[10px] bg-card p-6 shadow-none">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-medium text-foreground">{mediaName(selected)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selected.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-[10px] bg-muted p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="overflow-hidden rounded-[10px] bg-muted">
                <img src={safeImageSrc(selected.url)} alt={mediaName(selected)} className="max-h-[62vh] w-full object-contain" />
              </div>

              <div className="space-y-4">
                <div className="rounded-[10px] bg-muted p-4 text-sm text-muted-foreground">
                  <div>大小：{selected.size_text}</div>
                  <div>类型：{selected.mime || selected.ext}</div>
                  <div>尺寸：{selected.width && selected.height ? `${selected.width} × ${selected.height}` : '-'}</div>
                  <div>时间：{formatTime(selected.uploaded_at)}</div>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-foreground">链接显示名</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-2 w-full rounded-[10px] border border-border px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                    placeholder="例如：首页封面图"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-foreground">Alt 文本</span>
                  <input
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    className="mt-2 w-full rounded-[10px] border border-border px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                    placeholder="给搜索引擎和无障碍阅读器看的图片说明"
                  />
                </label>

                <button
                  type="button"
                  disabled={saving}
                  onClick={saveMeta}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-muted px-5 py-3 text-sm text-foreground hover:bg-muted disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  保存显示信息
                </button>

                {selected.status !== 'trashed' ? (
                  <>
                    <label className="block">
                      <span className="text-sm font-medium text-foreground">文件名</span>
                      <input
                        value={renameTo}
                        onChange={(e) => setRenameTo(e.target.value)}
                        className="mt-2 w-full rounded-[10px] border border-border px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                        placeholder={selected.filename}
                      />
                    </label>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={renameFile}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-muted px-5 py-3 text-sm text-foreground hover:bg-muted disabled:opacity-60"
                    >
                      <Pencil className="h-4 w-4" />
                      修改文件名并同步文章引用
                    </button>

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <ThemeSelect
                        value={recompressQuality}
                        onValueChange={(nextValue) => setRecompressQuality(nextValue)}
                        className="rounded-[10px] border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="low">低清晰度</option>
                        <option value="medium">中清晰度</option>
                        <option value="high">高清晰度</option>
                      </ThemeSelect>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={recompress}
                        className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-emerald-600 px-5 py-3 text-sm text-foreground hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <RotateCw className="h-4 w-4" />
                        二次压缩
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => deleteFile(false)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-red-600 px-5 py-3 text-sm text-foreground hover:bg-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除到回收站
                    </button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={restoreFile}
                      className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-muted px-5 py-3 text-sm text-foreground hover:bg-muted disabled:opacity-60"
                    >
                      <Undo2 className="h-4 w-4" />
                      恢复
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={permanentDelete}
                      className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-red-600 px-5 py-3 text-sm text-foreground hover:bg-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      彻底删除
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopy(selected.url, '图片 URL')}
                    className="rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground hover:bg-muted"
                  >
                    复制 URL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(`![${altText || mediaName(selected)}](${selected.url})`, 'Markdown')}
                    className="rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground hover:bg-muted"
                  >
                    复制 Markdown
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
