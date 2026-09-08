import { ThemeSelect } from '../components/ThemeSelect';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ImagePlus, UploadCloud } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ArticleEditor } from '../components/ArticleEditor';
import { safeImageSrc } from '../lib/safeUrl';

const emptyForm = {
  title: '',
  slug: '',
  summary: '',
  content: '',
  cover_image: '',
  category: '',
  tags: '',
  status: 'published',
};

const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon,.jpg,.jpeg,.png,.gif,.webp,.ico';

function makeSlug(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || `post-${Date.now()}`
  );
}

async function uploadImage(file: File, quality = 'medium') {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('quality', quality);

  const res = await fetch('/api/upload/image', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || '图片上传失败');
  }

  return data.url;
}

export default function AdminWritePage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<any>(emptyForm);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageQuality, setImageQuality] = useState('medium');
  const coverImage = safeImageSrc(form.cover_image);

  useEffect(() => {
    if (!id) return;

    api(`/posts/${id}`)
      .then((post) => {
        let tags = '';

        try {
          tags = Array.isArray(post.tags)
            ? post.tags.join(', ')
            : JSON.parse(post.tags || '[]').join(', ');
        } catch {
          tags = post.tags || '';
        }

        setForm({
          title: post.title || '',
          slug: post.slug || '',
          summary: post.summary || '',
          content: post.content || '',
          cover_image: post.cover_image || '',
          category: post.category || '',
          tags,
          status: post.status || 'published',
        });
      })
      .catch((err) => setMessage(err.message || '文章加载失败'));
  }, [id]);

  const payload = useMemo(
    () => ({
      ...form,
      slug: form.slug || makeSlug(form.title),
      tags: form.tags
        .split(',')
        .map((tag: string) => tag.trim())
        .filter(Boolean),
    }),
    [form],
  );

  const update = (key: string, value: string) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!form.title || !form.content) {
      setMessage('标题和正文不能为空');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      if (isEdit) {
        await api(`/posts/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/posts', { method: 'POST', body: JSON.stringify(payload) });
      }

      navigate('/admin/posts');
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (file?: File) => {
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const url = await uploadImage(file, imageQuality);
      update('cover_image', url);
      setMessage('封面上传成功');
    } catch (err: any) {
      setMessage(err.message || '封面上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleContentImageUpload = async (file?: File) => {
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const url = await uploadImage(file, imageQuality);
      setForm((previous: any) => ({
        ...previous,
        content: `${previous.content}\n\n![图片](${url})\n\n`,
      }));
      setMessage('图片已插入正文');
    } catch (err: any) {
      setMessage(err.message || '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="article-write-page">
      <div className="article-write-content">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <Link
              to="/admin"
              className="text-sm text-foreground hover:underline"
            >
              返回后台
            </Link>
            <h1 className="admin-title">{isEdit ? '编辑文章' : '写文章'}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              支持可视化编辑、Markdown 源码与阅读预览，保留封面及正文图片上传。
            </p>
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        )}

        <div className="mb-5 rounded-[10px] border border-border bg-muted px-4 py-3 text-sm text-foreground">
          <label className="mr-3 font-medium">上传图片清晰度</label>
          <ThemeSelect
            value={imageQuality}
            onValueChange={(nextValue) => setImageQuality(nextValue)}
            className="rounded-[6px] border border-border bg-card px-3 py-2 outline-none"
          >
            <option value="low">低：体积最小，适合大量正文图</option>
            <option value="medium">中：推荐，清晰和速度平衡</option>
            <option value="high">高：更清晰，适合封面图</option>
            <option value="original">原图：不压缩，仅安全校验</option>
          </ThemeSelect>
          <p className="mt-2 text-xs text-foreground">
            JPG、PNG、WebP 会按选择压缩为 WebP；GIF/ICO 会保留原格式。
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium">标题</label>
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              className="w-full rounded-[10px] border border-border  px-4 py-3 bg-card "
              placeholder="输入文章标题"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">
              链接别名 slug
            </label>
            <input
              value={form.slug}
              onChange={(e) => update('slug', e.target.value)}
              className="w-full rounded-[10px] border border-border  px-4 py-3 bg-card "
              placeholder="不填会自动生成"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">摘要</label>
            <textarea
              value={form.summary}
              onChange={(e) => update('summary', e.target.value)}
              className="w-full rounded-[10px] border border-border  px-4 py-3 bg-card "
              rows={3}
              placeholder="文章摘要"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 text-sm font-medium">分类</label>
              <input
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                className="w-full rounded-[10px] border border-border  px-4 py-3 bg-card "
                placeholder="技术 / 生活 / 随笔"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium">标签</label>
              <input
                value={form.tags}
                onChange={(e) => update('tags', e.target.value)}
                className="w-full rounded-[10px] border border-border  px-4 py-3 bg-card "
                placeholder="用英文逗号分隔，如 React, Node"
              />
            </div>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">封面图</label>
            <div className="rounded-[10px] border border-dashed border-border  p-5 bg-card ">
              {coverImage && (
                <img
                  src={coverImage}
                  alt="cover"
                  className="mb-4 max-h-64 w-full object-cover rounded-[10px]"
                />
              )}

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={form.cover_image}
                  onChange={(e) => update('cover_image', e.target.value)}
                  className="flex-1 rounded-[10px] border border-border  px-4 py-3 bg-card "
                  placeholder="图片 URL，或者点击右侧上传"
                />

                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-muted px-5 py-3 text-foreground hover:bg-muted">
                  <UploadCloud className="w-4 h-4" />
                  {uploading ? '上传中...' : '上传封面'}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleCoverUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">正文</label>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted">
                <ImagePlus className="w-4 h-4" />
                插入图片
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) =>
                    handleContentImageUpload(e.target.files?.[0])
                  }
                />
              </label>
            </div>

            <ArticleEditor
              key={id || 'new'}
              value={form.content}
              onChange={(value) => update('content', value)}
              existing={isEdit}
              uploadImage={(file) => uploadImage(file, imageQuality)}
              onError={setMessage}
              onBusy={setUploading}
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">状态</label>
            <ThemeSelect
              value={form.status}
              onValueChange={(nextValue) => update('status', nextValue)}
              className="rounded-[10px] border border-border  px-4 py-3 bg-card "
            >
              <option value="published">发布</option>
              <option value="draft">草稿</option>
            </ThemeSelect>
          </div>

          <button
            disabled={saving || uploading}
            className="rounded-[10px] bg-muted border border-border px-6 py-3 text-foreground shadow-none disabled:opacity-60"
          >
            {saving ? '保存中...' : '保存文章'}
          </button>
        </form>
      </div>
    </div>
  );
}
