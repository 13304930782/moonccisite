# mooncci site

> 中文 | [English](#english)

mooncci site 是一个基于 React、Vite、TypeScript、Node.js、Express 和 MySQL 的个人内容站点与后台管理系统。项目包含文章发布、评论审核、媒体库、站点设置、邮件通知、用户角色权限等功能，适合长期维护的个人博客或内容管理站点。

## 功能特性

- 用户注册、登录、退出、忘记密码
- HttpOnly Cookie 登录态与角色权限控制
- owner / admin / editor / user 四级角色
- 文章发布、编辑、草稿和公开展示
- 评论发布、审核、删除、恢复、点赞和回复
- 站点设置、Logo、favicon、备案和首页内容配置
- 图片上传、格式校验、压缩、媒体库、回收站和批量操作
- SMTP 邮件配置、评论提醒和后台邮件发送
- 后台管理页和移动端 / 平板端适配
- Nginx 反向代理、PM2 后端运行、Vite 静态部署

## 技术栈

### 前端

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Lucide React

### 后端

- Node.js
- Express
- MySQL
- PM2
- Multer
- Sharp
- Helmet
- express-rate-limit

### 部署

- Nginx
- PM2
- MySQL
- Cloudflare 可选

## 目录结构

```text
.
├── src/                  # 前端源码
├── server/               # 后端源码
│   ├── src/              # Express API
│   ├── database/         # 数据库结构与迁移
│   └── scripts/          # 运维脚本
├── scripts/              # 前端打包与站点维护脚本
├── public/               # 静态资源
├── package.json
└── README.md
```

## 本地开发

安装前端依赖：

```bash
npm install
```

安装后端依赖：

```bash
cd server
npm install
```

配置环境变量：

```bash
cp server/.env.example server/.env
```

然后按实际环境填写数据库、JWT、SMTP 等配置。不要提交真实 `.env` 文件。

启动前端：

```bash
npm run dev
```

启动后端：

```bash
cd server
npm run start
```

## 构建

```bash
npm run build
```

构建产物位于：

```text
dist/
```

## 数据库

数据库结构和迁移文件位于：

```text
server/database/
```

执行迁移前建议先备份数据库。迁移脚本支持先 dry-run 再执行，避免误操作。

## 部署说明

生产环境建议：

- 前端使用 Vite 构建后交给 Nginx 托管
- 后端使用 PM2 运行 Express 服务
- Nginx 将 `/api` 反向代理到后端服务
- 上传目录禁止执行脚本文件
- `.env`、数据库备份、日志、上传文件不提交到 Git
- 静态资源开启长期缓存，`index.html` 不强缓存

## 安全设计

项目已重点加固以下内容：

- 使用 HttpOnly Cookie 保存登录态
- 后端统一校验登录状态和角色权限
- 写操作要求可信请求头
- CORS 白名单限制
- Helmet 安全响应头
- 登录、注册、忘记密码等接口限流
- 图片上传限制 MIME、扩展名和文件内容
- 禁止 SVG 等高风险格式上传
- 评论内容、Markdown 链接和图片地址做安全处理
- 普通用户评论需要审核
- 管理员和编辑权限边界区分
- 敏感配置通过 `.env` 管理

## 角色权限

| 角色 | 权限说明 |
| --- | --- |
| owner | 站长，拥有最高权限 |
| admin | 管理员，可管理内容、用户、评论和大部分设置 |
| editor | 编辑，可写文章和管理自己的内容 |
| user | 普通用户，可评论、点赞和申请成为编辑 |

## 注意事项

- 不要提交 `.env`、数据库备份、日志、上传目录和构建产物
- 不要在公开文档里暴露真实服务器路径、账号、IP、邮箱或密钥
- 高风险模块包括认证、权限、上传、评论、邮件和 Markdown 渲染，需要定期复查
- 发布前建议执行构建、接口冒烟测试和安全检查脚本

---

## English

mooncci site is a personal content website and admin dashboard built with React, Vite, TypeScript, Node.js, Express, and MySQL. It includes publishing, comments, media management, site settings, email notifications, user roles, and production deployment support.

## Features

- User registration, login, logout, and password reset
- HttpOnly Cookie based authentication
- Role-based access control: owner, admin, editor, user
- Post creation, editing, drafts, and public publishing
- Comment review, deletion, restore, likes, and replies
- Site settings, logo, favicon, footer, and homepage configuration
- Image upload, validation, compression, media library, recycle bin, and batch actions
- SMTP configuration, comment notifications, and admin email sending
- Admin dashboard with mobile and tablet support
- Nginx reverse proxy, PM2 backend process, and Vite static deployment

## Tech Stack

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Lucide React

### Backend

- Node.js
- Express
- MySQL
- PM2
- Multer
- Sharp
- Helmet
- express-rate-limit

### Deployment

- Nginx
- PM2
- MySQL
- Optional Cloudflare integration

## Project Structure

```text
.
├── src/                  # Frontend source code
├── server/               # Backend source code
│   ├── src/              # Express API
│   ├── database/         # Schema and migrations
│   └── scripts/          # Maintenance scripts
├── scripts/              # Build and maintenance scripts
├── public/               # Static assets
├── package.json
└── README.md
```

## Local Development

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd server
npm install
```

Create the backend environment file:

```bash
cp server/.env.example server/.env
```

Fill in your database, JWT, SMTP, and other runtime values. Never commit real `.env` files.

Run the frontend:

```bash
npm run dev
```

Run the backend:

```bash
cd server
npm run start
```

## Build

```bash
npm run build
```

The production frontend output is generated in:

```text
dist/
```

## Database

Database schema and migration files are stored in:

```text
server/database/
```

Always back up the database before running migrations. Use dry-run mode first when available.

## Deployment Notes

Recommended production setup:

- Serve the Vite build output with Nginx
- Run the Express backend with PM2
- Proxy `/api` requests from Nginx to the backend service
- Prevent script execution in upload directories
- Keep `.env`, database backups, logs, uploads, and build output out of Git
- Use long-term cache for hashed static assets and no-cache for `index.html`

## Security Highlights

- HttpOnly Cookie authentication
- Centralized backend authentication and role checks
- Request source validation for write operations
- CORS allowlist
- Helmet security headers
- Rate limits for authentication and sensitive endpoints
- Strict image upload validation
- SVG uploads disabled
- Safe Markdown link and image handling
- Comment moderation for normal users
- Clear admin/editor/owner permission boundaries
- Secrets managed through environment variables

## Roles

| Role | Description |
| --- | --- |
| owner | Site owner with highest-level permissions |
| admin | Administrator for content, users, comments, and most settings |
| editor | Can write posts and manage owned content |
| user | Can comment, like, and apply to become an editor |

## Notes

- Do not commit `.env`, database backups, logs, uploads, or build artifacts
- Do not publish real server paths, accounts, IP addresses, emails, or secrets
- Authentication, permissions, uploads, comments, email, and Markdown rendering should be reviewed regularly
- Before release, run build checks, smoke tests, and security scans
