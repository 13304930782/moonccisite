import { useEffect, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { api } from '../lib/api';
import { safeImageSrc } from '../lib/safeUrl';

const defaultBrand = {
  site_title: '',
  nav_title: '',
  logo_url: '',
  favicon_url: '',
};

const defaultProfile = {
  name: '',
  title: '',
  bio: '',
  avatar_url: '',
  github_url: '',
  twitter_url: '',
  email: '',
};

const defaultHero = {
  badge: '',
  title_before: '',
  title_highlight: '',
  title_after: '',
  subtitle: '',
  primary_text: '',
  primary_link: '',
  secondary_text: '',
  secondary_link: '',
};

const defaultFooter = {
  copyright: '',
  icp_text: '',
  icp_url: '',
  police_text: '',
  police_url: '',
  police_icon_url: '',
};

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon,.jpg,.jpeg,.png,.gif,.webp,.ico';

async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append('image', file);

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

export default function AdminSiteSettingsPage() {
  const [brand, setBrand] = useState(defaultBrand);
  const [profile, setProfile] = useState(defaultProfile);
  const [hero, setHero] = useState(defaultHero);
  const [footer, setFooter] = useState(defaultFooter);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarUrl = safeImageSrc(profile.avatar_url);

  useEffect(() => {
    api('/settings/site')
      .then((data) => {
        setBrand({ ...defaultBrand, ...(data.brand || {}) });
        setProfile({ ...defaultProfile, ...(data.profile || {}) });
        setHero({ ...defaultHero, ...(data.hero || {}) });
        setFooter({ ...defaultFooter, ...(data.footer || {}) });
      })
      .catch(() => setMessage('站点资料加载失败'));
  }, []);

  const updateBrand = (key: string, value: string) => {
    setBrand((prev) => ({ ...prev, [key]: value }));
  };

  const updateProfile = (key: string, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const updateHero = (key: string, value: string) => {
    setHero((prev) => ({ ...prev, [key]: value }));
  };

  const updateFooter = (key: string, value: string) => {
    setFooter((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');

    try {
      await api('/settings/site', {
        method: 'PUT',
        body: JSON.stringify({ brand, profile, hero, footer }),
      });

      setMessage('保存成功');
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file?: File) => {
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const url = await uploadImage(file);
      updateProfile('avatar_url', url);
      setMessage('头像上传成功，记得点击保存');
    } catch (err: any) {
      setMessage(err.message || '头像上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleBrandImageUpload = async (key: 'logo_url' | 'favicon_url', file?: File) => {
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const url = await uploadImage(file);
      updateBrand(key, url);
      setMessage(key === 'logo_url' ? 'Logo 上传成功，记得点击保存' : 'favicon 上传成功，记得点击保存');
    } catch (err: any) {
      setMessage(err.message || '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="rounded-[2rem] bg-white/85 backdrop-blur border border-white/50 p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">站点资料设置</h1>
          <p className="mt-2 text-sm text-gray-500">
            修改首页 Hero、侧边栏资料、头像、社交链接和底部备案信息。
          </p>
        </div>


        <section className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm leading-6 text-gray-700">
          <div>
            <h2 className="font-semibold text-gray-900">运维与安全检查</h2>
            <p className="mt-1 text-gray-500">
              这些命令只在维护时使用，默认折叠，避免占用站点设置页面空间。
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <details className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              <summary className="cursor-pointer font-medium">首页首屏显示和重新打包</summary>
              <p className="mt-3">
                修改站点标题、首页 Hero、备案、页脚、Logo 或 favicon 后，如果希望刷新首页第一眼就是新内容，执行：
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-amber-950 px-4 py-3 text-xs leading-5 text-amber-50">{`cd /www/wwwroot/mooncci-source
./scripts/rebuild-site-settings.sh`}</pre>
              <p className="mt-3">
                脚本会拉取最新站点设置、生成 <code className="rounded bg-amber-100 px-1">initialSiteSettings.ts</code>、
                执行 <code className="rounded bg-amber-100 px-1">npm run build</code> 并部署前端静态文件，不需要重启 PM2。
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-amber-950 px-4 py-3 text-xs leading-5 text-amber-50">{`1. GET https://mooncci.site/api/settings/site
2. 写入 src/app/config/initialSiteSettings.ts
3. 执行 npm run build
4. 备份并替换 /www/wwwroot/mooncci.site/index.html
5. 同步 dist/assets 到 /www/wwwroot/mooncci.site/assets`}</pre>
            </details>

            <details className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
              <summary className="cursor-pointer font-medium">安全冒烟测试</summary>
              <p className="mt-3">
                修改接口、登录认证、权限、评论、上传、媒体库或部署配置后，执行下面脚本快速检查核心链路。
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-blue-950 px-4 py-3 text-xs leading-5 text-blue-50">{`cd /www/wwwroot/mooncci-source

SMOKE_BASE_URL="https://mooncci.site" \\
SMOKE_EMAIL="你的登录邮箱" \\
SMOKE_PASSWORD="你的登录密码" \\
SMOKE_POST_ID="7" \\
node scripts/smoke-test.mjs`}</pre>
              <p className="mt-3">
                脚本会检查健康接口、写接口来源保护、登录 Cookie、当前用户身份、站点设置、文章列表、媒体库、
                管理接口权限、评论列表和退出登录；不会修改业务数据。
              </p>
            </details>

            <details className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
              <summary className="cursor-pointer font-medium">数据库迁移</summary>
              <p className="mt-3">
                新增字段、索引或表结构时，把 SQL 放到
                <code className="rounded bg-emerald-100 px-1">server/database/migrations</code>，再统一执行：
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-emerald-950 px-4 py-3 text-xs leading-5 text-emerald-50">{`cd /www/wwwroot/mooncci-source/server

node scripts/migrate.js --dry-run
node scripts/migrate.js`}</pre>
              <p className="mt-3">
                执行前先备份数据库；已执行过的 migration 不要再改，下一次结构调整新建按时间命名的 SQL 文件。
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-emerald-950 px-4 py-3 text-xs leading-5 text-emerald-50">{`server/database/migrations/202605210001_add_xxx.sql
server/database/migrations/202605210002_create_xxx_table.sql`}</pre>
            </details>

            <details className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-purple-900">
              <summary className="cursor-pointer font-medium">高风险模块定期复查</summary>
              <p className="mt-3">
                邮件、上传、Markdown、评论和权限接口改动后，或每月例行维护时，执行只读复查脚本：
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-purple-950 px-4 py-3 text-xs leading-5 text-purple-50">{`cd /www/wwwroot/mooncci-source

./scripts/high-risk-review.sh`}</pre>
              <p className="mt-3">
                脚本只读取代码、检查响应头、扫描异常上传扩展名和常见敏感字符串，不会修改数据库、文章、评论、用户或媒体文件。
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-purple-950 px-4 py-3 text-xs leading-5 text-purple-50">{`1. /api/health 安全响应头和缓存
2. 写接口 X-Requested-With 来源保护
3. 上传类型、magic number、压缩逻辑和异常扩展名
4. Markdown 安全链接和 HTML 渲染点
5. 评论审核、回复、删除、点赞、IP 脱敏
6. 邮件发送、SMTP 设置和发送接口权限
7. 源码敏感字符串扫描，排除真实 .env
8. PM2 进程状态`}</pre>
            </details>

            <details className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
              <summary className="cursor-pointer font-medium">公开文章发布前脱敏检查</summary>
              <p className="mt-3">
                发布复盘、教程、审计总结或公开文档前，先用这个脚本扫描真实路径、邮箱、IP、Token、密钥痕迹和内部部署细节。
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-rose-950 px-4 py-3 text-xs leading-5 text-rose-50">{`cd /www/wwwroot/mooncci-source

./scripts/public-doc-scan.sh docs/your-article.md`}</pre>
              <p className="mt-3">
                如果输出为空，说明没有扫到明显敏感信息；如果有输出，先把真实目录、账号、邮箱、IP、端口、进程名和密钥痕迹改成泛化描述。
                截图里的地址栏、终端路径和账号也要手动检查。
              </p>
            </details>
          </div>
        </section>

        {message && (
          <div className="mb-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        )}

        
        <section className="rounded-3xl border border-gray-200 bg-white/70 p-6">
          <h2 className="text-xl font-semibold text-gray-900">品牌与图标设置</h2>
          <p className="mt-1 text-sm text-gray-500">
            对应浏览器标签页标题、小图标，以及网站左上角 Logo 和标题。
          </p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">浏览器标题</label>
              <input
                value={brand.site_title}
                onChange={(e) => updateBrand('site_title', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="个人博客网站设计"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">导航栏标题</label>
              <input
                value={brand.nav_title}
                onChange={(e) => updateBrand('nav_title', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="计算机博客"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">Logo 图片地址</label>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={brand.logo_url}
                  onChange={(e) => updateBrand('logo_url', e.target.value)}
                  className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/api/uploads/logo.png 或 https://..."
                />

                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-white hover:bg-gray-800">
                  <UploadCloud className="w-4 h-4" />
                  {uploading ? '上传中...' : '上传 Logo'}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleBrandImageUpload('logo_url', e.target.files?.[0])}
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500">显示在网站左上角，建议使用正方形图片。</p>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">浏览器小图标 favicon 地址</label>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={brand.favicon_url}
                  onChange={(e) => updateBrand('favicon_url', e.target.value)}
                  className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/api/uploads/favicon.png 或 https://..."
                />

                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-white hover:bg-gray-800">
                  <UploadCloud className="w-4 h-4" />
                  {uploading ? '上传中...' : '上传 favicon'}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleBrandImageUpload('favicon_url', e.target.files?.[0])}
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500">显示在浏览器标签页左侧，建议使用 32×32 或 64×64 图片。</p>
            </div>
          </div>
        </section>


        <section className="rounded-3xl border border-gray-200 bg-white/70 p-6">
          <h2 className="text-xl font-semibold text-gray-900">首页 Hero 设置</h2>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block mb-2 text-sm font-medium text-gray-700">小标签</label>
              <input value={hero.badge} onChange={(e) => updateHero('badge', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">标题前半部分</label>
              <input value={hero.title_before} onChange={(e) => updateHero('title_before', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">高亮文字</label>
              <input value={hero.title_highlight} onChange={(e) => updateHero('title_highlight', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">标题后半部分</label>
              <input value={hero.title_after} onChange={(e) => updateHero('title_after', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">副标题</label>
              <input value={hero.subtitle} onChange={(e) => updateHero('subtitle', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">主按钮文字</label>
              <input value={hero.primary_text} onChange={(e) => updateHero('primary_text', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">主按钮链接</label>
              <input value={hero.primary_link} onChange={(e) => updateHero('primary_link', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">副按钮文字</label>
              <input value={hero.secondary_text} onChange={(e) => updateHero('secondary_text', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">副按钮链接</label>
              <input value={hero.secondary_link} onChange={(e) => updateHero('secondary_link', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-gray-200 bg-white/70 p-6">
          <h2 className="text-xl font-semibold text-gray-900">侧边栏个人资料</h2>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="rounded-3xl bg-gray-50 p-6 text-center">
                <div className="mx-auto w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-1">
                  <div className="w-full h-full rounded-full bg-white overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-400">头像</span>
                    )}
                  </div>
                </div>

                <h2 className="mt-4 text-xl font-semibold text-gray-900">{profile.name || '未设置名称'}</h2>
                <p className="mt-1 text-sm text-gray-500">{profile.title || '未设置身份'}</p>
                <p className="mt-4 text-sm leading-7 text-gray-600">{profile.bio || '未设置简介'}</p>

                <label className="mt-5 inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-white hover:bg-gray-800">
                  <UploadCloud className="w-4 h-4" />
                  {uploading ? '上传中...' : '上传头像'}
                  <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
                </label>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-5">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">名称</label>
                <input value={profile.name} onChange={(e) => updateProfile('name', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">身份标题</label>
                <input value={profile.title} onChange={(e) => updateProfile('title', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">个人简介</label>
                <textarea value={profile.bio} onChange={(e) => updateProfile('bio', e.target.value)} rows={4} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">头像地址</label>
                <input value={profile.avatar_url} onChange={(e) => updateProfile('avatar_url', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">GitHub 链接</label>
                  <input value={profile.github_url} onChange={(e) => updateProfile('github_url', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Twitter / X 链接</label>
                  <input value={profile.twitter_url} onChange={(e) => updateProfile('twitter_url', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">邮箱</label>
                  <input value={profile.email} onChange={(e) => updateProfile('email', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-gray-200 bg-white/70 p-6">
          <h2 className="text-xl font-semibold text-gray-900">底部备案设置</h2>
          <p className="mt-1 text-sm text-gray-500">
            这里会替换原来的 Theme by Puock。电脑端横向显示，手机端上下显示。
          </p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block mb-2 text-sm font-medium text-gray-700">版权文字</label>
              <input
                value={footer.copyright}
                onChange={(e) => updateFooter('copyright', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Copyright mooncci in LNTU"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">ICP备案文字</label>
              <input
                value={footer.icp_text}
                onChange={(e) => updateFooter('icp_text', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="辽ICP备2024042989号-1"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">ICP备案链接</label>
              <input
                value={footer.icp_url}
                onChange={(e) => updateFooter('icp_url', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://beian.miit.gov.cn/"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">公安备案文字</label>
              <input
                value={footer.police_text}
                onChange={(e) => updateFooter('police_text', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="辽公网安备21041102000430号"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">公安备案链接</label>
              <input
                value={footer.police_url}
                onChange={(e) => updateFooter('police_url', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://beian.mps.gov.cn/#/query/webSearch?code=21041102000430"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block mb-2 text-sm font-medium text-gray-700">公安图标链接</label>
              <input
                value={footer.police_icon_url}
                onChange={(e) => updateFooter('police_icon_url', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://moooncci.cn/wp-content/uploads/2025/10/police.icon_-1.png"
              />
            </div>
          </div>
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="mt-8 rounded-2xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? '保存中...' : '保存全部设置'}
        </button>
      </div>
    </div>
  );
}
