<h1 align="center">mooncci site</h1>

<p align="center">
  A personal home for articles, updates, projects, and everyday records.<br>
  写文章，记近况，展示作品，也记录日常。
</p>

<p align="center">
  <a href="https://mooncci.site"><strong>访问网站 · Website</strong></a>
  · <a href="DEPLOY.md">部署指南 · Deployment</a>
  · <a href="SECURITY.md">安全 · Security</a>
</p>

<p align="center">
  <strong><a href="#简体中文">简体中文</a></strong>
  · <strong><a href="#english">English</a></strong>
</p>

<p align="center">
  <a href="https://github.com/13304930782/moonccisite/actions/workflows/ci.yml"><img alt="Site checks" src="https://github.com/13304930782/moonccisite/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Node.js 24+" src="https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white">
  <img alt="React 18" src="https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white">
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="MySQL" src="https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white">
</p>

---

<a id="简体中文"></a>

# 简体中文

## 一个持续更新的个人站点

mooncci site 把文章、短近况和作品放在同一个站点里。读者可以阅读、评论、订阅更新；作者通过后台管理内容、媒体和发布状态，无需为每篇文章重新修改前端源码。

界面沿用黑白灰的阅读风格，支持浅色与深色主题。手机端有独立的导航与电量概览排版，历史图表可以横向滑动。

## 从记录到发布

### 写长文，也记短近况

文章支持可视化 Markdown 编辑、草稿、分类和标签；近况用于记录短更新。两者都接入评论、回复、点赞和审核。首页更新流汇总近期内容，作品页用于展示项目与链接。

### 把内容管理放回后台

后台提供文章分页、媒体库全库搜索、图片上传与压缩、回收站和批量操作。站点名称、首页文案、Logo、favicon 等通过配置管理。作者、管理员和站长按各自权限操作，编辑者不能越权管理他人的文章。

### 与读者保持联系

读者可以使用 RSS，或通过邮箱确认订阅。文章保留邮件订阅入口，近况详情展示评论。SMTP 通知、周报摘要与 GitHub Release 同步需要单独配置；未开启的服务不应被视为已经投递或同步。

### 记录日常状态

可选电量模块支持授权账号下的多宿舍数据、余额与日用电趋势、7/30 天视图和私密 RSS。天气挂件使用配置好的天气服务，并限制请求频率与配额。这些模块依赖对应服务、凭据及数据来源，并非所有部署都默认可用。

## 数据与安全

内容和账号保存在部署者管理的 MySQL 中，媒体保存在服务器上传目录。登录使用 HttpOnly Cookie 与服务端会话撤销；密码使用 bcrypt。草稿、后台及个性化响应有权限与缓存控制。

这是联网的全栈网站，不是离线应用。邮件、天气、Google 登录和 GitHub 同步等可选功能会连接相应外部服务。不要把真实密钥、Cookie、数据库备份或上传文件提交到仓库。漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## 当前状态

项目持续用于个人站点维护。文章、近况评论、内容后台、电量页面和离线发布流程已经实现；容量与工程质量改进仍在继续。用户及评论管理列表的进一步分页优化列在后续工作中，不把计划项当作已完成功能。

部署需要 **Node.js 24+、MySQL 8**，以及生产环境的 Nginx 和 PM2。React / TypeScript / Vite 构建静态前端，Express 提供相对路径 `/api` 接口，独立 worker 处理后台任务。

## 开发者快速开始

```bash
git clone https://github.com/13304930782/moonccisite.git
cd moonccisite
npm ci
npm ci --prefix server
```

复制 `server/.env.example` 为 `server/.env`，创建一个空 MySQL 数据库，填写数据库连接和至少 32 字符的随机 JWT 密钥。可用下面命令生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

本地 HTTP 开发还需调整以下配置：

```dotenv
NODE_ENV=development
SITE_URL=http://localhost:5173
COOKIE_SECURE=false
COOKIE_DOMAIN=
CORS_ORIGINS=http://localhost:5173
CSRF_TRUSTED_ORIGINS=http://localhost:5173
```

**仅新建空库**运行初始化：

```bash
node server/scripts/init-db.js
```

分别在三个终端启动：

```bash
npm run dev
npm run dev --prefix server
npm run worker --prefix server
```

前端通过 Vite 代理访问本机 API。已有数据库升级使用增量迁移，不能重新初始化或覆盖历史 SQL；详见 [DEPLOY.md](DEPLOY.md)。第三方功能先保持关闭，按需配置。

## 检查与发布

```bash
npm run check
npm test --prefix server
```

`npm run check` 依次运行前端严格类型检查、单元测试、生产构建及包体预算。CI 另外运行浏览器回归、隔离 MySQL 集成测试、离线部署故障测试和依赖审计。包体同时限制入口及其静态依赖、单个 JS 包与总 JS 体积，避免只靠拆小文件绕过限制。

默认由电脑构建并上传，服务器不再下载 GitHub 或安装前端构建依赖：

```powershell
python scripts/build-offline-release.py
powershell -ExecutionPolicy Bypass -File scripts/Upload-OfflineRelease.ps1
```

打包需要干净且已提交的源码；上传脚本校验包与 LF 校验文件，并输出服务器离线部署命令。**标准包只含前端**，不会更新后端依赖、执行迁移或重启 PM2。后端变更使用单独审核的部署包。完整说明见 [DEPLOY.md](DEPLOY.md)。

<details>
<summary><strong>目录与维护文档</strong></summary>

```text
src/          React 页面、组件、上下文与样式
server/       Express API、worker、SQL 与服务端测试
scripts/      构建、浏览器回归与离线发布工具
test/         前端与构建工具测试
public/       静态资源
```

- [审计记录](AUDIT-2026-09-09.md)
- [近况、加载与图表体验](UPDATES-UX-2026-09-09.md)
- [后台容量改进](CAPACITY-2026-09-09.md)
- [质量门槛](QUALITY-GATES.md)
- [内容平台配置](CONTENT-DEPLOY.md)

</details>

<details>
<summary><strong>贡献与数据兼容</strong></summary>

保留现有设计，使用相对 API 路径。数据库改动新增迁移，不编辑已经执行过的迁移。认证、权限、上传、编辑器和发布变更应覆盖失败场景与现有数据兼容性。提高包体预算时必须说明原因和影响，不能通过调高告警阈值掩盖增长。

</details>

## 授权与致谢

仓库目前没有项目级 LICENSE 文件，不宣称采用 MIT 等开源许可证。第三方组件与素材说明见 [ATTRIBUTIONS.md](ATTRIBUTIONS.md) 和 [public/licenses](public/licenses)。

<p align="right"><a href="#english">English →</a></p>

---

<a id="english"></a>

# English

## A personal site that keeps growing

mooncci site brings articles, short updates, and projects together. Readers can follow, comment, and subscribe; authors publish through an administration interface instead of editing frontend source for every post.

The reading interface uses a restrained monochrome palette with light and dark themes. Mobile navigation, electricity summaries, and horizontally scrollable history charts adapt to smaller screens.

## From writing to publishing

### Articles and short updates

Write Markdown with a visual editor, keep drafts, and organize articles with categories and tags. Short updates have their own detail pages. Both support moderated comments, replies, and likes. A shared activity feed and project pages connect the site's content.

### A practical content workspace

Manage paginated article lists, search the full media library, upload and compress images, and use trash and batch actions. Site branding and homepage copy are configurable. Server-side roles restrict access; editors can manage their own articles rather than other authors' work.

### Stay in touch

RSS and confirmed email subscriptions provide ways to follow updates. Articles retain subscription forms; update details focus on comments. SMTP notifications, weekly digests, and GitHub Release synchronization require separate configuration and activation.

### Optional everyday tools

The electricity module supports multiple authorized rooms, balance and daily-usage trends, 7/30-day views, and private RSS. The weather companion uses configured providers with request limits and quotas. Availability depends on the deployment's credentials and data sources.

## Data and security

Accounts and content live in the operator's MySQL database, and media lives in the server upload directory. Authentication uses HttpOnly cookies with server-side revocation; passwords use bcrypt. Drafts, administrative endpoints, and personalized responses enforce permissions and cache controls.

This is a connected full-stack application. Optional mail, weather, Google sign-in, and GitHub features contact their respective services. Keep secrets, cookies, database backups, and uploaded files out of Git. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## Current status

The site is actively maintained. Content publishing, update comments, administration, electricity views, and offline frontend deployment are implemented. Further capacity work, including user/comment administration pagination, remains planned.

Development requires **Node.js 24+ and MySQL 8**; production uses Nginx and PM2. The frontend uses React, TypeScript, and Vite. Express serves `/api`, and a separate worker runs background tasks.

## Developer quick start

```bash
git clone https://github.com/13304930782/moonccisite.git
cd moonccisite
npm ci
npm ci --prefix server
```

Copy `server/.env.example` to `server/.env`, create an empty MySQL database, and configure its connection and a random JWT secret of at least 32 characters. For local HTTP development, use `SITE_URL=http://localhost:5173`, `COOKIE_SECURE=false`, an empty `COOKIE_DOMAIN`, and include that frontend origin in `CORS_ORIGINS` and `CSRF_TRUSTED_ORIGINS`.

For a **new empty database only**, run `node server/scripts/init-db.js`. Then run these commands in separate terminals:

```bash
npm run dev
npm run dev --prefix server
npm run worker --prefix server
```

Existing databases require incremental migrations. Never reinitialize a live database or overwrite applied migration files. See [DEPLOY.md](DEPLOY.md).

## Verification and deployment

```bash
npm run check
npm test --prefix server
```

The frontend check runs strict type checking, unit tests, a production build, and bundle budgets. CI also runs browser regressions, isolated MySQL integration tests, offline deployment failure tests, and dependency audits. Budgets cover the initial static import graph, individual chunks, and total JavaScript.

Build an offline frontend archive on the computer, then upload it from PowerShell:

```powershell
python scripts/build-offline-release.py
powershell -ExecutionPolicy Bypass -File scripts/Upload-OfflineRelease.ps1
```

The uploader validates the archive and LF checksum file and prints server deployment commands. This package is **frontend-only**: backend dependencies and database migrations need a separately reviewed package. See [DEPLOY.md](DEPLOY.md).

<details>
<summary><strong>Architecture and maintenance</strong></summary>

- `src/`: frontend pages, components, contexts, and styles.
- `server/`: API, worker, SQL migrations, and backend tests.
- `scripts/`: build, browser regression, and offline deployment tools.
- `test/`: frontend and build-tool tests.
- [Quality gates](QUALITY-GATES.md), [capacity improvements](CAPACITY-2026-09-09.md), and [audit record](AUDIT-2026-09-09.md).

Changes should preserve the existing design, use relative API paths, add new migrations instead of rewriting old ones, and verify authorization, failure recovery, and data compatibility. Bundle-budget increases need an explicit explanation of the cost.

</details>

## Licensing and acknowledgements

There is currently no project-level LICENSE file in this repository; no MIT or other open-source license is claimed for the project. See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) and [public/licenses](public/licenses) for third-party notices.

<p align="right"><a href="#简体中文">← 简体中文</a></p>
