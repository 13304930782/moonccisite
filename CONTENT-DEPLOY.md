# 内容平台上线与运维

本次包含统一视觉、短动态、作品/GitHub Releases、RSS 与邮件周报。前端与 API 应配套发布；本地实现和验收不代表生产已部署。Nginx、PM2、Google 登录、电费监控、内测安装包的原有配置见 [DEPLOY.md](DEPLOY.md)。

## 本地启动

需要 Node.js 24 或更新受支持版本、MySQL 8、npm。所有命令在对应目录执行。

1. 项目根目录执行 `npm install`。
2. 在 `server` 目录执行 `npm install`，复制 `.env.example` 为 `.env`，填写专用开发数据库与随机 `JWT_SECRET`。
3. 仅本地 HTTP 开发设置 `NODE_ENV=development`、`COOKIE_SECURE=false`、`COOKIE_DOMAIN=`、`SITE_URL=http://127.0.0.1:5173`、`CSRF_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`。生产继续使用 HTTPS、Secure Cookie 和正式域名。
4. 按下面“空数据库”或“已有数据库”流程准备数据库。
5. `server` 目录运行 `npm run dev`；另一个终端在项目根目录运行 `npm run dev`。需要后台任务时，再在 `server` 的第三个终端运行 `npm run worker`。Vite 将相对 `/api` 代理到 `127.0.0.1:3001`。

开发和预览保持 `GITHUB_SYNC_ENABLED=false`、`NEWSLETTER_DELIVERY_ENABLED=false`。电费监控和 SMTP 的外部调用也应使用开发专用配置或关闭。不要复制生产数据库到自动化测试。

## 数据库：空库与升级分开处理

**全新安装：**先在宝塔建立空数据库、配置连接，在 `server` 执行：

```bash
node scripts/init-db.js --dry-run
node scripts/init-db.js
node scripts/migrate.js --dry-run
```

初始化器只接受完全空的数据库；导入完整 `schema.sql`，并记录已包含的七个迁移校验值。它不创建用户或文章。不应在导入当前完整结构后再次逐个执行旧迁移，否则会遇到重复列。站长账户继续通过原有注册和管理员配置流程设置。

**已有站点升级：**先备份数据库和 `server/uploads`，保存正在运行的代码、前端 `dist`、PM2/Nginx 配置与服务端 `.env`。备份文件不进入 Git。先在备份恢复出的预览库验证，在 `server` 执行：

```bash
node scripts/migrate.js --dry-run
node scripts/migrate.js
node scripts/migrate.js --dry-run
```

在已完成旧版本迁移的站点，新增项应为 `202609050001_create_content_platform.sql`。如果出现其他未执行项或校验不一致，先核对实际数据库和历史记录。不要修改已执行的 SQL 文件，也不要以新初始化器绕过历史不一致。新迁移只新增内容表，不改旧业务表、不自动发布内容。

新内容连接统一使用 UTC；周报按 Asia/Shanghai 计算。旧文章保持现有存储方式，更新流读取时转换为 UTC。`POSTS_STORAGE_UTC_OFFSET_MINUTES` 默认采用 Node 进程当前时区偏移；如果旧文章原来由其他时区的进程写入，明确设置原偏移（中国标准时间 `480`，UTC `0`）。请抽查一篇有已知发布时间的文章，避免跨日和周报边界偏移。

## 三期能力的启用顺序

**第一期：视觉与近况。**部署配套前后端并完成迁移后，在“近况与短动态”维护首页当前近况、发布短动态。owner/admin 可管理，editor/user 不可。文章、动态普通编辑保留原发布时间，撤回后公开详情返回 404。旧 `paper/plasma` 主题偏好分别映射为浅色/深色。

**第二期：作品与 GitHub。**在后台录入 PromptDock、电费监控的真实介绍、技术栈、地址和封面；发布并填推荐顺序，首页最多显示三个。每个项目仅绑定一个公开仓库，格式 `owner/repository`；仓库与同步开关仅 owner 可配置。

```dotenv
GITHUB_SYNC_ENABLED=true
GITHUB_TOKEN=
CONTENT_DB_CONNECTION_LIMIT=5
```

可选 GitHub Token 仅置于服务端环境变量，使用公开仓库只读权限。全局环境开关和项目开关均开启才运行同步。重启 PM2 后，独立任务每分钟检查到期项目，正常间隔一小时；后台提供手动重试，限流退避期间不能绕过冷却。首次仅导入最近十个正式 Release；预发布、草稿、普通提交不导入，历史导入不进入周报。后续更新已导入版本和首次同步后发布的新版本，保留手动隐藏状态。使用 ETag 条件请求，每日 UTC 00 时段重新扫描历史页。上游撤回或改为预发布的版本须在完整扫描后再通过版本详情按 ID 确认，才不再公开；请求失败保留已有内容及错误状态。

**第三期：RSS 与邮件。**RSS 无需 SMTP，路径 `/api/feed.xml`，最多五十条公开更新。确认后台邮件设置中的正式站点地址，复用现有 SMTP 并先完成现有测试邮件流程，再设置：

```dotenv
NEWSLETTER_DELIVERY_ENABLED=true
```

重启 PM2 后开放邮箱确认订阅；已注册用户不会自动订阅。owner 在“邮件周报”另行开启定时发送，可随时暂停。仅打开环境开关不会自动打开数据库中的发送开关。后台暂停周报仍允许确认订阅。

确认链接有效 24 小时，退订令牌有效一年，数据库只存哈希。链接令牌放在 URL fragment，页面去除地址栏令牌后由读者点击按钮确认，链接预取不会改变订阅状态。每封周报的退订链接独立，新的周报不会让旧退订链接提前失效。公开订阅接口有 IP 限流、邮箱冷却。

每周一 09:00（Asia/Shanghai）起处理上周一至本周一零点的公开更新；没有新内容不发。服务当日或当周恢复后可补处理该周，跨过整周的历史周报不自动补发。文章/短动态/项目版本分组，撤回、隐藏、普通编辑和首次导入历史不生成新通知。

投递按订阅者与周次唯一。明确失败最多重试三次，加首次共四次，间隔 30 分钟；网络超时等结果不明确的投递标记“待核对”，不自动重发。发送进程中断超过 15 分钟也进入待核对。owner 核对 SMTP 日志后可标记“已发送”或“跳过”。电费提醒与新内容任务相互独立。

## 验证与生产发布

在根目录 `npm run build`，在 `server` 运行 `npm test`。数据库集成测试默认跳过；仅在初始化完毕、名称匹配 `mooncci_qa` 或 `mooncci_qa_*` 的一次性数据库运行：

```bash
cd server
CONTENT_INTEGRATION=true DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=qa_user DB_PASSWORD=qa_password DB_NAME=mooncci_qa JWT_SECRET=local_test_secret POSTS_STORAGE_UTC_OFFSET_MINUTES=0 node --test --test-concurrency=1 test/*.test.js
```

上例为 Bash；Windows 使用对应 `$env:变量名` 设置。集成测试会写入和修改测试内容、id=1 的测试账户和订阅状态，绝不能使用真实站点数据库。GitHub/SMTP 在测试中模拟，不会向真实读者发邮件。

预览确认后，安排生产变更窗口：备份 → `--dry-run` → 迁移 → 构建并替换前端 `dist` → 更新后端代码 → 在 `server` 使用原站点用户执行 `pm2 startOrReload ecosystem.config.cjs --update-env`。先按实际路径调整 ecosystem 中两个进程的 `cwd`；HTTP 使用 `mooncci-api`，任务使用单实例 `mooncci-worker`，不要将任务重新挂入 Web 启动函数。独立数据库任务锁会拒绝重复 worker。Nginx 保留 SPA 回退、`/api/` 代理与上传目录。

上线冒烟：浅深主题/手机导航、登录/退出、搜索、文章/评论、媒体上传、内测申请、电费页面、短动态发布编辑撤回、作品草稿权限、RSS 无私有内容。GitHub 与邮件先使用站长控制的真实公开仓库和测试邮箱核验，再开放给访客。

**回退：**先关闭新增两个环境开关并暂停周报，切回已保留的前端构建与后端代码，重载 PM2，并停止 `mooncci-worker`。新增表可暂时保留，旧代码不会使用；不要自动删除表。若确实需要数据库恢复，应在维护窗口核对上线后的新写入后再决定，防止覆盖新文章、用户和评论。`server/uploads` 始终独立保留。


## 本次补充：品牌、时间与独立任务

品牌名固定为 `mooncci`，包含导航、页脚、账户、后台、浏览器标题、邮件和 RSS。保存的旧品牌文字在展示边界兼容规范化；不改数据库名、旧 URL、环境变量名称或部署目录。

`SITE_URL` 是 RSS、邮件链接及后续 canonical/sitemap 的唯一绝对地址来源。迁移前确认它是实际公开 HTTPS 根地址；后台历史邮件设置中的 `site_url` 不再覆盖此环境变量。RSS 标识改用稳定的 `urn:mooncci:{type}:{id}`。

首次发布时间与重新发布规则见 [实施记录](IMPLEMENTATION.md)。本次没有新增数据库列和迁移，也没有修改已执行迁移；已有站点重点更新前后端代码、PM2 ecosystem 以及任务启动命令。请确保发布后 `pm2 ls` 同时显示 `mooncci-api` 和 `mooncci-worker`，并检查后者取得任务锁。重复 worker 会退出，由 PM2 延迟重试；数据库任务锁连接丢失时 worker 退出，避免失锁继续执行。

`CONTENT_DB_CONNECTION_LIMIT` 最小为 5，预留进程任务锁、两个并行任务的任务锁和查询连接。电费配置修改仍写入原数据库，worker 的下一采集时段读取最新配置；人工采集入口保持原样。

上线验收补充：所有品牌展示均为 mooncci、直达导航无“探索”下拉、桌面/手机与浅深主题一致、系统减少动态效果生效。SEO 缺项和最小改动方案已并入原第一期实施记录，本轮不声称已提供服务端文章渲染或 sitemap。


安装环境修正：当前 `geoip-lite@2.0.3` 要求 Node >=24；生产运行环境必须满足此要求。依赖锁文件统一使用官方 npm 下载地址，保留包版本和 integrity。宝塔共享 npm 缓存若无写权限，应使用 mooncci 独享缓存（如 `/var/cache/mooncci-npm`），不修改共享缓存所有者。20260905 初始部署包未覆盖重写，已经上传的版本需同步修正下载地址和运行环境后再发布。


当前服务器采用独立 Node 24.20.0：`/opt/mooncci-node-v24.20.0/bin/node`。ecosystem 的 API 和 worker 都显式指定此 interpreter；宝塔默认 Node 和现有 PM2 守护进程不必切换。依赖安装时在 mooncci 用户的该次命令中把 `/opt/mooncci-node-v24.20.0/bin` 放到 PATH 首位，缓存使用 `/var/cache/mooncci-npm`。已上传的初始部署包需要在待发布目录同步修改 ecosystem 后再发布；新服务器按实际安装路径调整 interpreter。
