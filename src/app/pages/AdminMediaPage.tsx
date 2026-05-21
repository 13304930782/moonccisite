import { useEffect, useMemo, useState } from 'react';
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

  const load = async () => {
    setLoading(true);
    setMessage('');

    try {
      const data = await api(`/upload/media?status=${status}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setMessage(err.message || '媒体库加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelected(null);
    setSelectedFilenames([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      return [item.filename, item.display_name, item.alt_text, item.original_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [items, keyword]);

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
      <div className="rounded-[2rem] border border-white/60 bg-white/85 p-8 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">媒体库</h1>
            <p className="mt-2 text-sm text-gray-500">
              管理上传图片，支持预览、复制链接、改显示名、改文件名、回收站、批量操作和二次压缩。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={imageQuality}
              onChange={(e) => setImageQuality(e.target.value)}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">低清晰度</option>
              <option value="medium">中清晰度</option>
              <option value="high">高清晰度</option>
              <option value="original">原图</option>
            </select>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm text-white hover:bg-blue-700">
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
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-sm text-white hover:bg-gray-800"
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
              onClick={() => setStatus('active')}
              className={`rounded-2xl px-4 py-2 text-sm ${status === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              正常文件
            </button>
            <button
              type="button"
              onClick={() => setStatus('trashed')}
              className={`rounded-2xl px-4 py-2 text-sm ${status === 'trashed' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              回收站
            </button>
          </div>

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 lg:max-w-md"
            placeholder="搜索文件名、显示名、Alt..."
          />

          <p className="text-sm text-gray-500">
            共 {items.length} 个文件，当前显示 {filtered.length} 个
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-3xl bg-gray-50 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleVisible}
              disabled={filtered.length === 0}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {allVisibleSelected ? '取消本页全选' : '本页全选'}
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilenames([])}
              disabled={selectedCount === 0}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              清空选择
            </button>

            <span className="text-sm text-gray-500">已选择 {selectedCount} 个</span>
          </div>

          {status === 'active' ? (
            <button
              type="button"
              disabled={selectedCount === 0 || saving}
              onClick={() => batchDelete(false)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-2.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
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
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" />
                批量恢复
              </button>

              <button
                type="button"
                disabled={selectedCount === 0 || saving}
                onClick={batchPermanentDelete}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-2.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                批量彻底删除
              </button>
            </div>
          )}
        </div>

        {message && (
          <div className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-white/60 bg-white/85 p-8 text-gray-500 shadow-xl">
          正在加载媒体库...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[2rem] border border-white/60 bg-white/85 p-8 text-gray-500 shadow-xl">
          暂无媒体文件。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((item) => {
            const imageUrl = safeImageSrc(item.url);
            const markdown = `![${item.alt_text || mediaName(item)}](${item.url})`;
            const checked = selectedSet.has(item.filename);

            return (
              <div key={item.filename} className={`overflow-hidden rounded-3xl border bg-white/85 shadow-lg ${checked ? 'border-blue-500 ring-2 ring-blue-200' : 'border-white/60'}`}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => openDetail(item)}
                    className="flex h-48 w-full items-center justify-center bg-gray-100"
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt={mediaName(item)} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-gray-400" />
                    )}
                  </button>

                  <label className="absolute left-3 top-3 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white/90 px-3 py-2 text-xs font-medium text-gray-700 shadow">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(item.filename)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    选择
                  </label>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <p className="truncate text-sm font-semibold text-gray-900" title={mediaName(item)}>
                      {mediaName(item)}
                    </p>
                    <p className="mt-1 truncate text-xs text-gray-500" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.size_text} · {item.ext} · {formatTime(item.uploaded_at)}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => openDetail(item)}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-700 hover:bg-gray-200"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      打开
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.url, '图片 URL')}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-700 hover:bg-gray-200"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      URL
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(markdown, 'Markdown')}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700"
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{mediaName(selected)}</h2>
                <p className="mt-1 text-sm text-gray-500">{selected.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-2xl bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="overflow-hidden rounded-3xl bg-gray-100">
                <img src={safeImageSrc(selected.url)} alt={mediaName(selected)} className="max-h-[62vh] w-full object-contain" />
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl bg-gray-50 p-4 text-sm text-gray-600">
                  <div>大小：{selected.size_text}</div>
                  <div>类型：{selected.mime || selected.ext}</div>
                  <div>尺寸：{selected.width && selected.height ? `${selected.width} × ${selected.height}` : '-'}</div>
                  <div>时间：{formatTime(selected.uploaded_at)}</div>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">链接显示名</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：首页封面图"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Alt 文本</span>
                  <input
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="给搜索引擎和无障碍阅读器看的图片说明"
                  />
                </label>

                <button
                  type="button"
                  disabled={saving}
                  onClick={saveMeta}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  保存显示信息
                </button>

                {selected.status !== 'trashed' ? (
                  <>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">文件名</span>
                      <input
                        value={renameTo}
                        onChange={(e) => setRenameTo(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={selected.filename}
                      />
                    </label>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={renameFile}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                      <Pencil className="h-4 w-4" />
                      修改文件名并同步文章引用
                    </button>

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={recompressQuality}
                        onChange={(e) => setRecompressQuality(e.target.value)}
                        className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="low">低清晰度</option>
                        <option value="medium">中清晰度</option>
                        <option value="high">高清晰度</option>
                      </select>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={recompress}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <RotateCw className="h-4 w-4" />
                        二次压缩
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => deleteFile(false)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm text-white hover:bg-red-700 disabled:opacity-60"
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
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      <Undo2 className="h-4 w-4" />
                      恢复
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={permanentDelete}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm text-white hover:bg-red-700 disabled:opacity-60"
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
                    className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    复制 URL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(`![${altText || mediaName(selected)}](${selected.url})`, 'Markdown')}
                    className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-700 hover:bg-gray-200"
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
