import { Link } from 'react-router-dom';
import { ThemeSelect } from '../components/ThemeSelect';
import { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  PageHeading,
  Pagination,
  ResourceState,
  formatDate,
  labels,
  useResource,
} from '../components/ContentUI';
import { MarkdownContent } from '../components/MarkdownContent';
import { safeImageSrc } from '../lib/safeUrl';

function ImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [images, setImages] = useState<any[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function library() {
    setBusy(true);
    try {
      setImages(await api('/upload/media'));
      setOpen(true);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const r = await api('/upload/image', { method: 'POST', body });
      onChange(r.url);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="image-field">
      <label>
        配图地址
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="HTTPS 或 /api/uploads/…"
        />
      </label>
      <div className="inline-actions">
        <button type="button" disabled={busy} onClick={library}>
          从媒体库选择
        </button>
        <label className="quiet-button">
          上传图片
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
        {value && (
          <button type="button" onClick={() => onChange('')}>
            移除配图
          </button>
        )}
      </div>
      {safeImageSrc(value) && (
        <img
          className="image-preview"
          src={safeImageSrc(value)}
          alt="配图预览"
        />
      )}
      {open && (
        <div>
          <button type="button" onClick={() => setOpen(false)}>
            关闭媒体库
          </button>
          <div className="media-picker">
            {images.map((img) => (
              <button
                type="button"
                key={img.filename}
                onClick={() => {
                  onChange(img.url);
                  setOpen(false);
                }}
              >
                <img
                  src={safeImageSrc(img.url)}
                  alt={img.alt_text || img.filename}
                />
                <small>{img.display_name || img.filename}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      <p role="alert">{error}</p>
    </div>
  );
}
export function AdminUpdatesPage() {
  const [page, setPage] = useState(1),
    resource = useResource(`/admin/updates?page=${page}`);
  const [form, setForm] = useState({
      id: 0,
      content: '',
      image_url: '',
      status: 'draft',
    }),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(form.id ? `/admin/updates/${form.id}` : '/admin/updates', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      setForm({ id: 0, content: '', image_url: '', status: 'draft' });
      setMessage('动态已保存');
      resource.reload();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-admin">
      <PageHeading eyebrow="CONTENT" title="近况与动态" />
      <p className="form-message" role="status">
        {message}
      </p>
      <p className="muted">
        首页右侧的简短近况已统一到{' '}
        <Link className="text-link" to="/admin/site-settings#now">
          站点设置 → 当前近况
        </Link>
        。这里管理独立发布的短动态。
      </p>
      <form className="editor-panel" onSubmit={save}>
        <h2>{form.id ? '编辑动态' : '写一则动态'}</h2>
        <label>
          正文 · 支持 Markdown
          <textarea
            required
            rows={7}
            maxLength={10000}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </label>
        <ImageField
          value={form.image_url}
          onChange={(image_url) => setForm({ ...form, image_url })}
        />
        <label>
          发布状态
          <ThemeSelect
            value={form.status}
            onValueChange={(nextValue) =>
              setForm({ ...form, status: nextValue })
            }
          >
            <option value="draft">草稿 / 撤回</option>
            <option value="published">公开发布</option>
          </ThemeSelect>
        </label>
        <div className="inline-actions">
          <button disabled={busy}>{busy ? '保存中…' : '保存动态'}</button>
          {form.id > 0 && (
            <button
              type="button"
              onClick={() =>
                setForm({ id: 0, content: '', image_url: '', status: 'draft' })
              }
            >
              取消编辑
            </button>
          )}
        </div>
        <details>
          <summary>正文预览</summary>
          <MarkdownContent content={form.content} />
        </details>
      </form>
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <div className="admin-records">
              {resource.data.items.map((u: any) => (
                <article key={u.id}>
                  <div>
                    <span className="muted">
                      {labels[u.status]} ·{' '}
                      {formatDate(u.published_at || u.created_at)}
                    </span>
                    <p>{u.content.slice(0, 160)}</p>
                  </div>
                  <button onClick={() => setForm({ ...u })}>编辑 / 撤回</button>
                </article>
              ))}
            </div>
            <Pagination data={resource.data} onPage={setPage} />
          </>
        )}
      </ResourceState>
    </div>
  );
}
const emptyProject = {
  id: 0,
  name: '',
  slug: '',
  summary: '',
  content: '',
  cover_image: '',
  tech_stack: '',
  stage: 'building',
  status: 'draft',
  demo_url: '',
  repo: '',
  featured_rank: '',
};
export function AdminProjectsPage() {
  const { user } = useAuth(),
    owner = user?.role === 'owner';
  const [page, setPage] = useState(1),
    resource = useResource(`/admin/projects?page=${page}`),
    [form, setForm] = useState<any>({ ...emptyProject }),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<number | null>(null);
  async function action(path: string, method: string, body?: any) {
    setBusy(true);
    setMessage('');
    try {
      const r = await api(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage(r.message || '操作已完成');
      resource.reload();
      return true;
    } catch (e: any) {
      setMessage(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action(
        form.id ? `/admin/projects/${form.id}` : '/admin/projects',
        form.id ? 'PUT' : 'POST',
        form,
      )
    )
      setForm({ ...emptyProject });
  }
  return (
    <div className="content-admin">
      <PageHeading eyebrow="WORK" title="作品管理" />
      <p className="muted">
        自动同步服务：
        {resource.data?.syncConfigured
          ? '已开启'
          : '未开启；部署时需配置 GITHUB_SYNC_ENABLED'}
        。仓库开关默认关闭，手动同步仍受冷却限制。
      </p>
      <p className="form-message" role="status">
        {message}
      </p>
      <form className="editor-panel" onSubmit={save}>
        <h2>{form.id ? '编辑作品' : '新建作品'}</h2>
        <div className="form-grid">
          {[
            ['name', '作品名称', 160],
            ['slug', '地址标识（小写英文与连字符）', 160],
            ['tech_stack', '技术栈', 1000],
            ['demo_url', '演示 HTTPS 地址', 500],
            ['repo', '公开仓库（owner/repository）', 200],
            ['featured_rank', '首页推荐顺序（留空不推荐）', 4],
          ].map(([key, label, max]) => (
            <label key={key}>
              {label}
              <input
                required={key === 'name' || key === 'slug'}
                maxLength={Number(max)}
                disabled={key === 'repo' && !owner}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label>
          简介
          <textarea
            required
            rows={3}
            maxLength={2000}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </label>
        <label>
          详细介绍 · Markdown
          <textarea
            rows={8}
            maxLength={50000}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </label>
        <ImageField
          value={form.cover_image}
          onChange={(cover_image) => setForm({ ...form, cover_image })}
        />
        <div className="form-grid">
          <label>
            开发状态
            <ThemeSelect
              value={form.stage}
              onValueChange={(nextValue) =>
                setForm({ ...form, stage: nextValue })
              }
            >
              {['building', 'active', 'maintenance', 'archived'].map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </ThemeSelect>
          </label>
          <label>
            发布状态
            <ThemeSelect
              value={form.status}
              onValueChange={(nextValue) =>
                setForm({ ...form, status: nextValue })
              }
            >
              <option value="draft">草稿 / 撤回</option>
              <option value="published">公开发布</option>
            </ThemeSelect>
          </label>
        </div>
        <div className="inline-actions">
          <button disabled={busy}>保存作品</button>
          {form.id > 0 && (
            <button type="button" onClick={() => setForm({ ...emptyProject })}>
              取消编辑
            </button>
          )}
        </div>
      </form>
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <div className="admin-records">
              {resource.data.items.map((p: any) => (
                <article key={p.id}>
                  <div>
                    <h3>{p.name}</h3>
                    <p className="muted">
                      {labels[p.status]} · {labels[p.stage]} · 同步
                      {p.sync_enabled ? '已开启' : '已关闭'}
                    </p>
                    <small>
                      最后成功：
                      {p.last_success_at
                        ? new Date(p.last_success_at).toLocaleString('zh-CN')
                        : '尚未同步'}
                    </small>
                    {p.sync_error && <p role="alert">{p.sync_error}</p>}
                  </div>
                  <div className="inline-actions">
                    <button
                      onClick={() =>
                        setForm({ ...p, featured_rank: p.featured_rank ?? '' })
                      }
                    >
                      编辑
                    </button>
                    <button onClick={() => setSelected(p.id)}>版本管理</button>
                    {owner && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            action(`/admin/projects/${p.id}/sync`, 'PUT', {
                              enabled: !p.sync_enabled,
                            })
                          }
                        >
                          {p.sync_enabled ? '关闭同步' : '开启同步'}
                        </button>
                        <button
                          disabled={busy || !p.sync_enabled}
                          onClick={() =>
                            action(`/admin/projects/${p.id}/sync`, 'POST')
                          }
                        >
                          立即同步
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination data={resource.data} onPage={setPage} />
          </>
        )}
      </ResourceState>
      {selected && (
        <ReleaseManager id={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
function ReleaseManager({ id, onClose }: { id: number; onClose: () => void }) {
  const [page, setPage] = useState(1),
    r = useResource(`/admin/projects/${id}/releases?page=${page}`),
    [error, setError] = useState('');
  async function hide(release: any) {
    try {
      await api(`/admin/releases/${release.id}`, {
        method: 'PUT',
        body: JSON.stringify({ hidden: !release.hidden }),
      });
      r.reload();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <section className="editor-panel">
      <div className="section-heading">
        <h2>版本管理</h2>
        <button onClick={onClose}>关闭</button>
      </div>
      <p role="alert">{error}</p>
      <ResourceState resource={r}>
        {r.data && (
          <>
            <div className="admin-records">
              {r.data.items.map((item: any) => (
                <article key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <small>
                      {item.repo} · {item.hidden ? '已隐藏' : '可见'} ·{' '}
                      {item.historical ? '历史导入' : '新增版本'}
                    </small>
                  </div>
                  <button onClick={() => hide(item)}>
                    {item.hidden ? '恢复展示' : '隐藏'}
                  </button>
                </article>
              ))}
            </div>
            <Pagination data={r.data} onPage={setPage} />
          </>
        )}
      </ResourceState>
    </section>
  );
}
export function AdminNewsletterPage() {
  const [page, setPage] = useState(1),
    r = useResource(`/admin/newsletter?page=${page}`),
    [subPage, setSubPage] = useState(1),
    sub = useResource(`/admin/subscribers?page=${subPage}`),
    preview = useResource('/admin/newsletter/preview'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function put(path: string, body: any) {
    setBusy(true);
    try {
      await api(path, { method: 'PUT', body: JSON.stringify(body) });
      setMessage('设置已保存');
      r.reload();
      sub.reload();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-admin">
      <PageHeading eyebrow="NEWSLETTER" title="订阅与周报" />
      <p role="status">{message}</p>
      <ResourceState resource={r}>
        {r.data && (
          <>
            <section className="editor-panel">
              <h2>每周一 09:00 · Asia/Shanghai</h2>
              <p>无更新不发送。公开订阅需要用户自行确认邮箱。</p>
              <p>
                服务端邮件投递：
                {r.data.deliveryConfigured ? '已配置开启' : '未开启'}
              </p>
              <button
                disabled={
                  busy || (!r.data.deliveryConfigured && !r.data.enabled)
                }
                onClick={() =>
                  put('/admin/newsletter', { enabled: !r.data.enabled })
                }
              >
                {r.data.enabled ? '暂停周报' : '开启周报'}
              </button>
              <div className="inline-actions">
                {r.data.counts.map((c: any) => (
                  <p key={c.status}>
                    {c.status === 'active' ? '有效订阅' : labels[c.status]}：
                    {c.total}
                  </p>
                ))}
              </div>
            </section>
            <details className="editor-panel">
              <summary>查看本期摘要（只预览，不发送）</summary>
              <ResourceState resource={preview}>
                {preview.data && (
                  <>
                    <p>
                      {preview.data.period.start} — {preview.data.period.end}{' '}
                      UTC
                    </p>
                    {preview.data.items.map((i: any) => (
                      <p key={i.activity_id}>
                        {labels[i.type]} · {i.title}
                      </p>
                    ))}
                    {!preview.data.items.length && (
                      <p>本期没有新内容，不发送。</p>
                    )}
                  </>
                )}
              </ResourceState>
            </details>
            <h2>投递记录</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>邮箱</th>
                    <th>周次</th>
                    <th>状态</th>
                    <th>尝试</th>
                    <th>处理</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.deliveries.items.map((d: any) => (
                    <tr key={d.id}>
                      <td>{d.email}</td>
                      <td>{formatDate(d.week_start)}</td>
                      <td>
                        {labels[d.status]}
                        <small className="block">{d.error}</small>
                      </td>
                      <td>{d.attempts}</td>
                      <td>
                        {d.status === 'uncertain' && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() =>
                                put(`/admin/newsletter/deliveries/${d.id}`, {
                                  status: 'sent',
                                })
                              }
                            >
                              已核对发送
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                put(`/admin/newsletter/deliveries/${d.id}`, {
                                  status: 'skipped',
                                })
                              }
                            >
                              跳过
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={r.data.deliveries} onPage={setPage} />
          </>
        )}
      </ResourceState>
      <h2>订阅者</h2>
      <ResourceState resource={sub}>
        {sub.data && (
          <>
            <div className="admin-records">
              {sub.data.items.map((s: any) => (
                <article key={s.id}>
                  <p>
                    {s.email} ·{' '}
                    {s.status === 'active' ? '已确认' : labels[s.status]}
                  </p>
                  <button
                    disabled={busy || s.status === 'unsubscribed'}
                    onClick={() =>
                      put(`/admin/subscribers/${s.id}`, {
                        status: 'unsubscribed',
                      })
                    }
                  >
                    取消订阅
                  </button>
                </article>
              ))}
            </div>
            <Pagination data={sub.data} onPage={setSubPage} />
          </>
        )}
      </ResourceState>
    </div>
  );
}
