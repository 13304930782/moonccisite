# 宝塔部署说明

2026-09-09 近况评论与前端体验升级见 [UPDATES-UX-2026-09-09.md](UPDATES-UX-2026-09-09.md)。升级只增加新的评论迁移，保留线上历史迁移文件。

## 2026-09-09 审计修复上线（必须前后端一起更新）

详见 [审计与修复记录](AUDIT-2026-09-09.md)。GitHub 合并不代表宝塔已部署。先备份生产数据库、上传文件和 `.env`，在维护窗口内更新；不要把完整 `schema.sql` 导入已有数据库。

本版认证依赖新迁移 `202609090002_auth_revocation.sql`，新增 `auth_revocations` / `auth_invalidations`。**必须在启动新版 API 前完成迁移**，否则认证查询会返回服务不可用。新装库用 `init-db.js`，已有库用 `migrate.js`；不修改已执行迁移的内容或校验和。

```bash
# 源码根目录：安装、测试、构建
npm ci
npm ci --prefix server
npm test
npm test --prefix server
npm run build
# server 目录：确认已有库备份后再执行
cd server
node scripts/migrate.js --dry-run
node scripts/migrate.js
pm2 startOrReload ecosystem.config.cjs --update-env
```

随后发布整个 `dist`，保持 `index.html` 与带 hash 的资源一致。现有 `.env` 的 `JWT_SECRET` 必须至少 32 字符且不是示例值；不要覆盖真实密钥或电费加密密钥。HTTP 默认 `HOST=127.0.0.1`、`TRUST_PROXY=loopback`，与同机 Nginx 配套；其他拓扑请显式配置真实可信代理地址，避免设为无条件信任。

HTTPS 站点保持 `COOKIE_SECURE=true`，`COOKIE_DOMAIN` 与正式域一致。`CORS_ORIGINS` 为允许域列表；如果另设 `CSRF_TRUSTED_ORIGINS`，也须包含实际前端源。前后端同域，通过 `/api` 代理。禁止为认证、后台、草稿和个性化评论开启 Nginx/CDN 缓存；保留后端 `Cache-Control` 和 `Set-Cookie`。编辑器净化适配器在构建时生效，不能继续使用旧 dist。

上线验收：登录并刷新 25 次后仍可退出；退出后刷新及另一标签页均无登录状态；密码重置后旧会话不能访问；普通编辑不能删除共享媒体；草稿评论不能匿名读取。退出失败应显示明确错误，不能假装成功。检查 PM2 API 与 worker 日志，确认没有缺表/密钥配置错误。

数据库新增表可以保留；若应用回退到不识别撤销记录的旧版本，将丢失本次会话撤销保护，优先前向修复，确需回退时同时轮换 JWT_SECRET 强制重新登录。生产连接和真实外部投递不由本地 QA 结果替代。

本地开发：前端根目录 `npm run dev`；后端 `cd server && npm run dev`；后台任务 `cd server && npm run worker`。本地 `.env` 使用真实随机 JWT 密钥、`SITE_URL=http://localhost:5173`、`COOKIE_SECURE=false`、空 `COOKIE_DOMAIN`，并将 localhost 前端源加入 `CORS_ORIGINS`/CSRF 白名单。

本次三期内容平台的初始化、升级、开关、验收与回退步骤见 [内容平台上线与运维](CONTENT-DEPLOY.md)。已有数据库只走迁移流程，不能重新导入完整结构。

1. 在宝塔 MySQL 中创建空数据库，配置连接后在 `server` 运行 `node scripts/init-db.js --dry-run` 和 `node scripts/init-db.js`；已有站点使用 `node scripts/migrate.js --dry-run` 预览，再执行迁移。
2. 在服务器 `server/.env` 配置数据库和 `JWT_SECRET`。
3. 进入 `server` 执行 `npm install`。
4. 配置 `server/ecosystem.config.cjs` 的实际路径，用 PM2 同时启动 HTTP 与独立任务：`pm2 startOrReload ecosystem.config.cjs --update-env`。
5. 在前端根目录执行 `npm install && npm run build`。
6. 将 `dist` 上传到 Nginx 站点根目录。
7. 在 Nginx 站点配置 `/api` 反向代理到 `127.0.0.1:3001`。
8. Nginx 示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /www/wwwroot/mooncci/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        # PromptDock Early Access 安装包最大允许 512 MB。
        client_max_body_size 512m;
        proxy_request_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## PromptDock Early Access

1. 更新后端前先备份数据库，并预览待执行迁移：

```bash
cd /www/wwwroot/mooncci-source/server
node scripts/migrate.js --dry-run
```

新版至少需要执行 `202607220001_create_early_access_applications.sql`。如果 dry-run 同时显示之前暂缓的迁移（例如视频训练记录），不要直接执行；先将暂缓文件改回 `.pending` 后再次 dry-run，确认列表正确，再运行：

```bash
node scripts/migrate.js
```

2. 在 `server/.env` 设置上传上限（需与 Nginx 的 `client_max_body_size` 一致）：

```dotenv
EARLY_ACCESS_UPLOAD_MAX_MB=512
```

3. `server/uploads/releases/` 必须可由运行 PM2 的 `mooncci` 用户写入。安装包不会进入 Git 仓库；更新服务器时不要删除 `server/uploads`。

4. 重载 Nginx 与 PM2 后，在后台“邮件提醒设置”中：
   - 保存正式 HTTPS 站点地址；
   - 配置并测试 SMTP；
   - 使用站长账号上传 `PromptDock.dmg`。

上传接口会校验 `.dmg` 扩展名、MIME 类型、512 MB 上限和 UDIF `koly` 文件尾签名。上传成功后下载地址会自动保存为 `https://你的域名/api/uploads/releases/PromptDock.dmg`。

## Google 登录

1. 在 Google Auth Platform 的 Web OAuth 客户端中，将 `https://mooncci.site/api/auth/google/callback` 加入“已获授权的重定向 URI”（无末尾斜杠）。沿用当前 Client ID，原有 JavaScript 来源可保留。
2. 在 `server/.env` 配置：

```dotenv
GOOGLE_CLIENT_ID=your_web_client_id.apps.googleusercontent.com
GOOGLE_CERTS_URL=https://your-google-certificate-proxy.example.com/google-certs
```

`GOOGLE_CERTS_URL` 必须返回 Google 官方 `https://www.googleapis.com/oauth2/v1/certs` 的原始 JSON。境外网络可直连的服务器也可以直接填写官方地址；网络受限环境建议使用固定上游地址的 Cloudflare Worker，禁止实现任意 URL 代理。

3. 部署数据库迁移前先备份数据库并预览全部待执行文件：

```bash
cd /www/wwwroot/mooncci-source/server
node scripts/migrate.js --dry-run
node scripts/migrate.js
```

4. 更新后端代码或 `.env` 后重启 PM2：

```bash
su -s /bin/bash mooncci -c "cd /www/wwwroot/mooncci-source/server && pm2 startOrReload ecosystem.config.cjs --update-env"
```

5. 重新构建前端并将 `dist` 内容上传到 Nginx 站点根目录。Google 客户端 ID 会出现在浏览器代码中，这是 OAuth Web 客户端的公开标识；客户端密钥不得写入前端、仓库或日志。

## Electricity Monitor

宿舍电量监控使用现有 Node.js 后端、MySQL、PM2 和 SMTP，不需要 Python；定时采集由同一代码库的独立 `mooncci-worker` 进程运行。学校接口地址固定在后端；浏览器只访问本站 `/api/electricity`。

1. 在 `server/.env` 配置以下变量。前两项是敏感凭据，只能保存在服务器 `.env`，不要提交 Git：

```dotenv
ELECTRICITY_ENABLED=true
ELECTRICITY_SCHOOL_ACCOUNT=
ELECTRICITY_ROOM_VERIFY=
ELECTRICITY_CUSTOMER_CODE=2252
ELECTRICITY_COMMAND=OWNWaterElecService
ELECTRICITY_DAILY_NOTIFY=true
ELECTRICITY_NOTIFY_HOUR=21
ELECTRICITY_SCHEDULE_HOURS=7,12,21
ELECTRICITY_MANUAL_COOLDOWN_MINUTES=15
ELECTRICITY_LOW_PURCHASE_THRESHOLD=10
ELECTRICITY_LOW_TOTAL_THRESHOLD=20
```

2. 备份数据库并先预览迁移。确认只有预期文件后再执行：

```bash
cd /www/wwwroot/mooncci-source/server
node scripts/migrate.js --dry-run
node scripts/migrate.js
```

基础迁移 `202609010001_create_electricity_monitor.sql` 创建每日唯一快照表和通知状态表；同一天重复执行会更新当天快照，不会生成几十条重复记录。本次调度更新新增 `202609020001_add_electricity_email_slot.sql`，只增加早晚邮件去重所需的时段字段；不要修改已经执行过的旧迁移。

3. 以运行线上 API 的 `mooncci` 用户重载 PM2，让新环境变量和每天 07:00、12:00、21:00（Asia/Shanghai）的固定调度器生效。07:00 采集后发送早报，12:00 只采集，21:00 采集后发送晚报；任一采集失败后，当天剩余自动采集会暂停，次日自动恢复。管理端“立即查询”默认有 15 分钟冷却：

```bash
su -s /bin/bash mooncci -c "cd /www/wwwroot/mooncci-source/server && pm2 startOrReload ecosystem.config.cjs --update-env"
```

4. 登录站长后台，打开“水电监控设置”：确认两项凭据均显示“已配置”，保存收件人与阈值，点击“立即查询”，再点击“发送测试日报”。SMTP 仍复用“邮件设置”中的配置。

5. 构建并发布前端后访问 `/electricity`。公共页面只返回用电统计和历史，不返回学校账号、宿舍校验凭据、完整学校响应或内部请求参数。若需要停用，设置 `ELECTRICITY_ENABLED=false` 并重载 PM2。
# 宿舍电量私密 RSS 增量更新

2026-09-05 新增独立电量报告 RSS。迁移、私密路径 Nginx 日志/缓存设置，以及区分 Windows PowerShell 与服务器 SSH 的增量部署命令见 [ELECTRICITY-RSS.md](ELECTRICITY-RSS.md)。只执行新增迁移，不覆盖 `.env` 或旧迁移。

## 2026-09-07 电量完整日统计

见 [ELECTRICITY-DAILY-USAGE.md](ELECTRICITY-DAILY-USAGE.md)。新增迁移 202609070001，先预览并执行迁移，再重启 API/worker 和部署前端；早晚邮件时间不变，新增零点采集。

## 学校历史用电首次导入修复

见 [ELECTRICITY-HISTORY-SYNC.md](ELECTRICITY-HISTORY-SYNC.md)。独立导入学校已有日明细，不等待零点，不改变已保存的预测；无需新迁移或前端部署。

## 2026-09-08 电量图表切换与可读性

“余额趋势”使用折线图，“日用电”只显示学校历史日用量柱状图；两者均保留 7 天／30 天范围切换。支持鼠标悬停、触屏点按和键盘方向键；减少动态效果模式关闭图表动画。

在 Windows PowerShell 中构建并上传：

```powershell
Set-Location 'C:\Users\Administrator\Documents\mooncci site'
npm run build
python scripts/build-electricity-charts-package.py
scp .cache/mooncci-electricity-charts-20260908.tar.gz root@182.92.179.81:/root/
```

在服务器 SSH 中运行：

```bash
mkdir -p /root/mooncci-electricity-charts-20260908
tar -xzf /root/mooncci-electricity-charts-20260908.tar.gz -C /root/mooncci-electricity-charts-20260908
bash /root/mooncci-electricity-charts-20260908/deploy-electricity-charts.sh
```

此包更新两个前端源码文件和已构建的静态资源。脚本先校验 SHA256、备份源码及线上 index.html，再发布资源、切换入口；保留旧资源供现有会话及回退使用。无需迁移、安装后端依赖或重启 PM2。部署后刷新 `/electricity`，检查两种图表、时间范围和手机点按提示。

## 2026-09-08 可选城市天气小球

见 [WEATHER-COMPANION.md](WEATHER-COMPANION.md)。右下角原版 grok-ball 跟随鼠标、支持揉动；访客可手动选择城市或授权定位，后台站点设置可以指定临时心情和持续天数。使用现有设置表，无需迁移或新增依赖；需更新前后端并重启 API。

天气小球定位城市识别：需允许服务器访问 `nominatim.openstreetmap.org`，默认无需密钥。可选 `MOONCCI_REVERSE_GEOCODING_URL` 指定兼容 Nominatim reverse 的 HTTPS 服务；详见 `WEATHER-COMPANION.md`。无新增迁移。

北京服务器无法访问 Nominatim 时，使用天气小球 v4 包中的 `configure-weather-amap.sh` 配置高德 Web 服务 Key。脚本先实测行政区和逆地理编码权限，通过后备份并更新 `.env` 的 `MOONCCI_CITY_PROVIDER=amap` 与 `AMAP_WEB_SERVICE_KEY`，不显示 Key。然后运行同包 `deploy-weather-companion.sh`。不需要数据库迁移或 npm 安装；详见 WEATHER-COMPANION.md。

账号权限变更与评论审核通知更新见 `ADMIN-NOTIFICATIONS.md`。沿用现有 SMTP/后台邮件开关，无迁移；部署使用 `deploy-admin-notifications.sh`，重启 API。通知仅在实际审核或权限变化后触发，脚本不发测试邮件。


天气小球 v5 修复区县定位精度并将手动城市选择保存 30 天。部署包 `mooncci-weather-companion-20260908-v5.tar.gz`，使用同包 `deploy-weather-companion.sh` 同步前后端；已配置高德 Key 不需重填，且无需数据库迁移、npm 安装或 worker 重启。更新后旧的错误区名需手动纠正或重新定位一次。具体 Windows PowerShell / 服务器 SSH 命令见 [WEATHER-COMPANION.md](WEATHER-COMPANION.md)。


天气小球 v6 增加全站每日摸摸/被打统计与连续两次双击后的短暂生气。使用 `mooncci-weather-companion-20260908-v6.tar.gz` 同包部署脚本，自动执行新增迁移 `202609080001_create_companion_interactions.sql`，再同步前后端、重启 API、检查统计接口；不重启 worker，不重配高德。遇到其他待迁移文件会停止。详细 PowerShell / SSH 命令见 WEATHER-COMPANION.md。

天气小球 v7 仅整理卡片说明、城市确认弹窗与来源排版。包名 `mooncci-weather-companion-20260908-v7.tar.gz`，继续使用同包部署脚本；没有新增数据库迁移，已应用的 v6 迁移自动跳过。


天气小球 v8：大陆天气改用现有高德 Web 服务 Key，其他地区使用 Open-Meteo。发布包 `mooncci-weather-companion-20260908-v8.tar.gz`；执行同包 `deploy-weather-companion.sh`。脚本先验证高德天气权限与当日预报，再备份与部署，失败保留原站点。v8 无新迁移或 npm 依赖，详细 Windows PowerShell / 服务器 SSH 命令见 `WEATHER-COMPANION.md`。


天气小球 v9：`mooncci-weather-companion-20260908-v9.tar.gz`，按 `WEATHER-COMPANION.md` 的 Windows PowerShell / 服务器 SSH 步骤部署。复用 site_settings 保存全站日/月调用预算，不新增迁移或依赖。新签名浏览器 Cookie 使用现有 JWT_SECRET；无需修改配置。前置高德权限检查消耗的请求也计入预算。高德 Key 若用于其他应用，应在其控制台核对总额度，本站无法读取外部历史调用。此次一并修复手机小球状态标签换行。


天气小球 v10 同包交付后台回到顶部、四连击手感与账户页触控修复。包名 `mooncci-weather-companion-20260908-v10.tar.gz`；按 `WEATHER-COMPANION.md` 执行，沿用已配置 Key，无新增迁移或依赖。未修改登录接口与业务权限。


### 2026-09-08 v11 动画性能优化

当前累计包：`.cache/mooncci-weather-companion-20260908-v11.tar.gz`。上传、解压与部署命令见 `WEATHER-COMPANION.md` 的 v11 部署部分。新增 ChartViewport 与 observeChartSize 源码已随包同步，包含此前 v10 交互修复。没有新增数据库迁移、依赖或配置；沿用自动预检、备份、API 重启及静态前端发布流程。

完成后切换电量页余额/日用电及 7/30 天，检查大小调整与提示；再按之前相同操作录制 Performance，比较 Layout 和帧间隔。不要把自动化 SVG 写入数量下降当成实测 FPS 提升。


### 2026-09-08 学校历史明细同步 v3（取代 v2）

当前包 `.cache/mooncci-electricity-history-sync-20260908-v3.tar.gz`，命令见 `ELECTRICITY-HISTORY-SYNC.md`。用户要求仅每天 00:00 自动同步，已取消 v2 的白天及启动独立补拉；保留原零点窗口内缺失任务补执行。增加零点学校日明细可用情况日志。脚本一次补入已有缺失后重启 worker，无新依赖/迁移，不需要前端部署。


### 2026-09-08 v4 后台手动同步

当前包 `.cache/mooncci-electricity-history-sync-20260908-v4.tar.gz`，上传与部署命令见 `ELECTRICITY-HISTORY-SYNC.md`。站长后台水电监控设置新增“同步学校历史用电”，保持仅零点自动同步，手动同步有任务锁和持久冷却。v4 包含前端构建，部署脚本备份后重启 API/worker 并发布前端；没有新数据库迁移或配置，不再在部署过程中自动补历史。

### 电量后台运行计划与页面整理（2026-09-09 v5）

后台“水电监控设置”支持逐行添加整点计划、修改任务和删除非零点行，00:00 日统计固定保留。计划保存在现有 site_settings，worker 每 5 分钟读取更新；早报、晚报各最多一次，保存不补发。首次部署需同时更新 API、worker 与前端，无新增迁移或依赖；原手动历史同步、冷却与零点预测逻辑保持。上传和发布命令见 [ELECTRICITY-HISTORY-SYNC.md](./ELECTRICITY-HISTORY-SYNC.md)。

### 多宿舍电量管理（2026-09-09）

本版需要数据库迁移，不能只覆盖 dist。部署命令、密钥备份与后台使用步骤见 [ELECTRICITY-ROOMS.md](./ELECTRICITY-ROOMS.md)。原有宿舍迁移后仅站长登录可见；新宿舍通过网站用户名绑定成员。新建宿舍的空通知邮箱不会使用全站默认收件人，所有电量读取均验证权限。


### 下拉菜单主题修复（2026-09-09）

在已部署多宿舍版本的基础上，执行 `npm run build` 和 `python scripts/build-dropdown-theme-package.py` 生成 `.cache/mooncci-dropdown-theme-20260909.tar.gz`。上传服务器后解压并运行 `bash deploy-dropdown-theme.sh`。脚本同步源码与前端资源，并备份旧入口和源码；无需数据库迁移或 PM2 重启。电量页面和后台剩余的原生选择器统一使用现有 ThemeSelect，保留字段、禁用选项及选中值逻辑。


### 退出登录修复（2026-09-09）

根因：旧前端只清理 React 状态及本地缓存，没有调用已有 POST /api/auth/logout 清除 HttpOnly Cookie。现已等待服务器成功后退出，加入提交中与失败提示、迟到的 /auth/me 响应保护、同源标签页退出通知；认证接口添加 private, no-store。无需数据库迁移，沿用原 JWT/Cookie 模型。

执行 `npm run build` 和 `python scripts/build-logout-fix-package.py`；上传 `.cache/mooncci-logout-fix-20260909.tar.gz`，解压后运行 `bash deploy-logout-fix.sh`。脚本备份源码与入口，更新前后端并重启 mooncci-api，不重启 worker；包含上一版下拉主题修复。验证：`node --test server/test/authLogout.test.js`，以及隔离浏览器环境下真实 AuthProvider + 认证路由的退出后刷新、退出失败、重复请求和迟到查询场景。未在生产账号执行退出测试。


### 电量访问提示页对齐修复（2026-09-09）

未登录、加载中、无宿舍和无权限状态共用 site-container / page-content，替换不存在的 container-shell，并移除独立的 80px 纵向内边距。桌面内容与导航对齐，手机沿用 20px 侧边距，保留现有文案、权限与跳转。运行 `npm run build`、`python scripts/build-electricity-access-layout-package.py` 后，上传 `.cache/mooncci-electricity-access-layout-20260909.tar.gz`，解压执行 `bash deploy-electricity-access-layout.sh`；纯前端修复，无数据库迁移或 PM2 重启。


### 后台列表与媒体库容量修复

参见 [CAPACITY-2026-09-09.md](CAPACITY-2026-09-09.md)。使用 `scripts/deploy-media-capacity.sh <完整提交号>` 后台部署，本批无需数据库迁移或依赖更新，仅重启 API。


## 默认发布方式：电脑打包、离线上传

前端更新在干净且已提交的源码上运行 `python scripts/build-offline-release.py`。脚本先构建，再生成 `.cache/mooncci-frontend-<提交号前12位>.tar.gz`、LF 校验文件和 `.cache/offline-release.json`；任何打包内容不一致都中止。执行 `powershell -ExecutionPolicy Bypass -File scripts/Upload-OfflineRelease.ps1` 上传，脚本在本机再次校验并输出服务器命令。服务器不访问 GitHub/npm。

服务端校验包内文件、等待部署锁（最多120秒）、备份 index、复制静态资源并最后替换入口；不删除旧哈希资源。切换后校验失败则恢复入口，按备份目录记录退出码，日志带时间。文件校验通过不等于公网 HTTPS/CDN 已验收，完成后仍需刷新实际页面检查。

此标准包**仅包含前端**。后端代码、依赖及增量迁移继续使用每批单独审核的白名单包，保护已执行的历史 SQL，不把 Windows node_modules 上传到 Linux。本轮发布流程改进无业务或数据库变更。


离线打包前现已自动运行 `npm run check`（严格类型、测试、构建、预算），详细标准见 [QUALITY-GATES.md](QUALITY-GATES.md)。本轮只有开发依赖与文档/构建工具变化，生产后端无需安装新依赖或执行迁移。


### 用户与评论管理离线发布

在干净的已合并提交上运行 `python scripts/build-admin-lists-release.py`。它执行前端质量检查，打包 dist 和唯一后端文件 `server/src/routes/admin.js`，校验归档及 LF 校验文件。使用 `powershell -ExecutionPolicy Bypass -File .\scripts\Upload-OfflineRelease.ps1` 上传，按脚本输出的命令启动后台部署并检查日志。

本包要求先前容量改进已部署（含 `server/src/lib/listPagination.js`），不安装依赖，不覆盖 SQL、环境变量或上传文件。部署备份 API 和旧入口，重启 mooncci-api，通过健康检查后切换前端；失败时恢复旧 API 和入口。worker 不重启。不要用纯前端包替代本次前后端更新。


### 发布后只读验收

新的离线包包含 `verify-live.mjs`。部署日志显示退出码 0 后执行：

```bash
/opt/mooncci-node-v24.20.0/bin/node /www/backup/实际包目录/verify-live.mjs https://mooncci.site
```

脚本不需要 npm 安装，只发送匿名 GET，每个请求超时 10 秒，不跟随重定向。请使用最终站点根地址。检查首页和入口静态资源是否与包一致、MIME、API JSON、匿名权限和 no-store。输出 PASS/FAIL，失败退出码 1；不会停止服务或自动回滚。若 CDN 改写 HTML/资源也会报告不一致，需人工核实改写及缓存策略。检查不包含动态页面交互、真实账号退出、数据库连通性、邮件和学校 API。

所有本次前端文件还会在部署目录逐个核对 SHA256；旧哈希文件保留。脚本执行失败会恢复入口，后端包还恢复原 API 并确认其健康状态。资源校验日志与备份放在部署日志给出的备份目录中。


### 账号停用会话修复

使用 `python scripts/build-admin-lists-release.py` 生成当前提交的前端及 admin.js 范围包，再运行电脑上传脚本。此版本必须更新后端，部署会备份并重启 mooncci-api，包含完整资源校验及 API 恢复检查。使用现有 auth_invalidations 表，不覆盖或执行历史 SQL，不安装依赖。

停用后重新启用的账号必须重新登录，停用前的会话不能恢复。此行为针对本次部署后执行的停用；未批量撤销历史账号会话。生产人工验收请用专用测试账号验证，不要互相停用实际站长账号。


### 首页动态与 NOW 回退

首页最近动态改用完整 activity 流，按发布时间混排已发布文章、近况和公开项目版本，不再传入排除文章的 scope=home。普通编辑保留发布时间，不另生成重复动态。

站点设置中的“正在做什么”手填内容优先；为空或纯空白时，单独查询最新一条已发布近况，不受最近六条动态类型限制。回退区标记“最近近况”，显示发布时间及详情链接；没有近况时明确说明，没有默认示例内容。网络错误沿用重试状态。

纯前端离线包发布，不改数据库或重启 PM2。下次打开/重新加载首页后取最新数据，不是常驻页面实时推送。


### 离线包固定时间戳的复制修复

归档使用固定 mtime=0；不同版本的 asset-manifest.json 可能大小相同、内容不同。原 rsync -a 的大小/时间快速比较会跳过该文件，触发部署后的 SHA256 校验失败。两个离线部署脚本改用 rsync -ac，按内容比较后复制，保留完整校验和失败回滚。失败日志直接列出未通过文件。Linux 回归覆盖同大小、同时间戳、不同内容的旧清单替换。


### 第三方登录管理与邮箱验证（2026-09-10）

后台 `/admin/login-settings` 仅站长可访问，支持 GitHub、Google、QQ、微信、Gitee 的开关、应用 ID、密钥保存/清除与回调提示。默认保留现有 Google，其余渠道默认关闭。只有配置齐全且已启用的渠道显示在登录/注册页；Google 使用整行本地普通按钮，其余使用本地图标。密钥不回显，AES-256-GCM 加密存储。空密钥保留原值，更换应用 ID 必须先停用，并重新填写密钥。历史绑定按平台和应用 ID 隔离。

Google 使用 OIDC `id_token` 跳转模式和原有 `googleIdentity.js` 验签，默认 CF 证书代理 `https://google-certs.mooncci.site/google-certs` 及 `GOOGLE_CERTS_URL` 覆盖逻辑保持不变。未保存后台覆盖时沿用 `GOOGLE_CLIENT_ID` 或原默认值。不需要 Client Secret，不改 CF Worker。需在 Google 控制台添加后台显示的重定向 URI。按钮无需外部 SDK 或 iframe，点击才导航到 Google；实际授权仍需用户能够访问 Google。服务器使用单次 state、浏览器 Cookie 和 nonce 校验；独立回调页先清除 URL fragment，再以同源 POST 提交身份凭证，不请求 access token。已有 `users.google_sub` 关联保持可用；对尚未绑定的同邮箱账户，要求先用原方式登录再主动绑定，不自动合并。

其他四个平台的完整回调地址：`https://mooncci.site/api/auth/{github|qq|wechat|gitee}/callback`，以后台显示值为准，来源于服务端 `SITE_URL`。微信用开放平台网站应用，授权回调域填 `mooncci.site`；GitHub 用 OAuth App；Gitee 授权范围 `user_info`；QQ 使用 `get_user_info`；微信使用 `snsapi_login`。GitHub 只请求 `read:user user:email` 并使用 PKCE。第三方授权仍需平台审核及真实凭据，配置页的“已启用”表示本地配置完整，并不表示平台授权已实测。

邮箱：Google 可信 Gmail/Workspace 邮箱和 GitHub 的 verified 邮箱可用于新注册。未得到可信邮箱时，仅创建 30 分钟的临时注册记录并跳转 `/complete-registration`；无正式账号、无登录 Cookie、不能评论。邮箱验证码有效 10 分钟、最多尝试 5 次、重发间隔 60 秒，另有 IP/邮箱限流。通过验证才创建普通用户和正式登录会话。同邮箱已存在时要求原账号登录绑定。SMTP 必须可用，请先在邮件设置完成测试。随机不可知密码只存 bcrypt；若以后需密码登录，可通过已验证邮箱走忘记密码。现有邮箱密码注册流程未改变。

`/account/connections` 支持登录后主动绑定；菜单有入口。绑定回调绑定原会话，退出/禁用后不可继续，已有绑定不可被另一用户抢占。不提供可能导致账号失联的直接解绑功能。OAuth state 持久化、限时、浏览器 Cookie 绑定且单次消费；授权码和平台 token 不写入日志或数据库。

发布：`python -X utf8 scripts/build-social-login-release.py` 会先执行前端 check 并要求 Git 工作区干净，生成 `.cache/mooncci-social-login-<commit>.tar.gz` 和 LF SHA256 文件。`powershell -ExecutionPolicy Bypass -File scripts/Upload-OfflineRelease.ps1` 上传后打印匹配的 nohup 部署及验证命令。

离线包只替换登录相关后端文件及前端，使用服务器现有 node_modules，不下载依赖。独立迁移脚本只执行新增的 `202609100001_social_login.sql`，建立 oauth_providers/identities/states/registrations 四张表并记录标准迁移摘要，不扫描、改写历史 SQL 或校验和。执行前检查现有 Google 和会话表。新表建好前现有 API 持续运行。备份范围内后端文件和旧前端入口，复制后重启 mooncci-api 并检查健康及配置接口，失败恢复原文件与入口。保留 `.env`、上传文件、Google CF 代理模块、worker 和旧哈希资源；新增表在回退后保留，不删除账号数据。

测试：`npm run check`、`npm test --prefix server`；`SOCIAL_INTEGRATION=true node --test server/test/socialLogin.integration.test.js` 只使用本地 `mooncci_qa_social_login` 专用测试库（默认端口 33079）。覆盖配置权限/CSRF、密钥不回显、state 重放、邮箱强制验证/重放、账号禁用、绑定冲突、退出失效和已有 Google 关联。模拟第三方响应不等同于真实平台联调；审核通过后每个平台应实测一次授权、注册、绑定与退出。

协议参考：
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://gitee.com/api/v5/oauth_doc
- https://wiki.connect.qq.com/使用authorization_code获取access_token
- https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html

### Google 普通按钮升级包

已部署第三方登录管理后，执行 `python -X utf8 scripts/build-google-login-release.py` 构建本地离线包，再运行 `scripts/Upload-OfflineRelease.ps1` 上传。该包只替换 `socialLogin.js`、`socialConfig.js`、`socialProviders.js` 和前端；部署前只读检查现有表，不执行任何 SQL 迁移，不修改 `.env`、CF 验签模块或依赖，重启一次 `mooncci-api`，失败回退已备份的 API 文件与首页入口。

上线前在 Google Web 客户端添加 `https://mooncci.site/api/auth/google/callback` 到“已获授权的重定向 URI”。无需提供 Client Secret，也不用改 CF Worker。缺少该设置会出现 `redirect_uri_mismatch`。真实账号授权需配置完成后联调；本地自动测试覆盖跳转、nonce/state、防重放、旧账号关联和强制邮箱验证。


## 后台与个人设置离线更新（2026-09-10）

本次使用 `python -X utf8 scripts/build-account-settings-release.py`。包包含已构建前端、明确列出的账号 API 文件及唯一新增迁移 `202609100002_account_settings.sql`。部署前检查已有第三方登录、会话撤销表和依赖；只创建 `account_profiles`、`account_challenges` 并登记迁移校验，不重跑或覆盖历史 SQL。保留 `.env`、Google CF 证书代理、依赖和上传目录。更新后仅重启 API，失败恢复原 API 文件和首页入口；新增表保留，账号删除操作本身不因代码回滚而恢复。

个人设置位于 `/account/settings`，旧绑定页重定向到这里。头像支持 JPG/PNG/WebP，限制 2 MB 和 1600 万像素，转换为 256×256 WebP 保存到后端 `uploads/avatars`（需纳入日常上传备份）。换邮箱要求新邮箱验证码，加当前密码或重新授权已绑定第三方；成功后旧登录及密码重置链接失效。第三方换绑/解绑验证当前邮箱，新授权成功才替换旧绑定。

用户管理的“设置”支持资料、登录邮箱、权限、重置邮件及删除。管理员不能修改站长或其他管理员；站长可管理其他账号，不能删除自己或站长账号。删除会停用账号、撤销登录、释放邮箱及第三方绑定，但保留用户名、头像、文章和评论，显示“已删除”；原用户名仍保留，不可重用。

验证：`npm run check`、`npm test --prefix server`、`ACCOUNT_INTEGRATION=true node --test server/test/accountSettings.integration.test.js`（隔离 MySQL）、`node scripts/test-account-browser.cjs`（构建后运行）。验收覆盖手机无横向溢出、资料保存、退出、验证码、第三方换绑及删除保留内容。真实第三方授权和邮件投递仍需使用已配置应用验收。


## 文章草稿与发布机制（2026-09-11）
使用 `python -X utf8 scripts/build-article-drafts-release.py` 构建独立离线包。唯一增量迁移 `202609110001_article_drafts.sql` 添加 posts.version 和 article_drafts。自动保存仅写工作稿，明确发布后更新公开内容。脚本保留历史 SQL、配置、上传和依赖；只重启 API。失败恢复原 API 与首页入口，新增表和已保存草稿继续保留。新安装快照同步登记新迁移，升级不要执行 init-db.js。

本机草稿保存在按用户和草稿隔离的 IndexedDB 中，默认 7 天。服务器与本机内容不同时要求明确选择恢复；本机存储不可用会提示。并发编辑返回 409，不自动覆盖。真实线上验收仅使用指定测试文章，不修改正式内容。

旧文章 PUT 接口现要求携带读取到的 version，缺失或过期返回 409。新编辑页统一使用草稿接口，不能让旧客户端绕过版本校验覆盖新内容。

### OAuth failure diagnostics

Build the scoped offline release with `python scripts/build-oauth-diagnostics-release.py` after checks pass and the branch is merged. This package updates the frontend and only `server/src/routes/socialLogin.js` and `server/src/lib/socialProviders.js`; it restarts `mooncci-api` without migrations or dependency changes. It preserves environment settings, uploads and Google certificate proxy configuration.

After reproducing a failed authorization, inspect the `[oauth-failure]` log entry matching the error reference on the account page. Entries contain only a fixed failure category, processing stage, reference and allowlisted upstream error/status; never add tokens, authorization codes, client secrets or raw upstream responses to these logs. Successful root URL connectivity alone does not establish successful OAuth token exchange.

### 可选 GitHub CF 代理

见 `cloudflare/github-oauth/README.md`。本地执行 `python scripts/build-github-proxy-release.py` 生成限定后端范围的离线包；Worker 单独部署到自己的 CF 账号。默认不启用，部署网站包不会改 `.env`。该包沿用授权诊断的双文件更新和回滚脚本，无迁移；启用需配置 Worker 域名和共享 Secret。

### 访问统计与 Microsoft 登录

本地构建：`python scripts/build-analytics-release.py`。这是独立后端包：新增四张 analytics 表，仅应用 `202609140001_analytics.sql`，更新入口、analytics 路由、socialConfig/socialProviders 和前端，重启 API。无新增依赖，不替换 `.env`、上传目录、历史迁移或 Google 验签模块。回滚恢复旧入口及 API；新增统计表保留，不执行删除数据的逆向迁移。

部署后，后台「访问统计」提供 7/30/90 天趋势、累计浏览量、按浏览器去重访客、注册增长、热门页面、来源域名、按页面宽度分类的设备、当前账号状态/角色/第三方绑定数量。流量日期按 UTC。新增注册日期由数据库时间戳换算为 UTC；旧注册记录只按现有数据展示。

浏览量不是浏览器访问日志的精确替代：同一浏览器同一页面 30 秒去重；排除管理员、后台、预览、登录/注册/授权、已识别机器人和 DNT。匿名随机 cookie 保留 90 天，服务端只存 HMAC 后的标识，不存 IP、完整来源 URL、查询参数或搜索词；清除 cookie、不同浏览器和拦截脚本会影响访客统计。明细以访问时触发的每小时限量清理保留约 90 天，汇总浏览量长期保留。不展示虚构历史访问量。

验收：退出管理员账号后打开公开文章，作者/日期旁有灰色眼睛数字；连续刷新 30 秒内不增加，30 秒后增加；后台显示同期趋势。草稿预览和管理员访问不增计数。普通用户访问 `/api/admin/analytics` 应返回 403，未登录为 401。

Microsoft 配置：在 https://entra.microsoft.com/ 的应用注册中新建应用，支持账号类型选择“任何组织目录中的账号和个人 Microsoft 账号”，平台 Web，回调填写 `https://mooncci.site/api/auth/microsoft/callback`。创建客户端密码后，将应用（客户端）ID 和密码的“值”（不是 Secret ID）填到网站后台「第三方登录 → Microsoft」，保存启用。只使用 openid/profile/email，不申请通讯录、邮件读取或离线访问权限。密码到期需更新。注册需要本地验证邮箱；已有账号主动绑定，不按 Microsoft 返回的邮箱自动合并。组织策略可能需要管理员同意；真实授权须使用用户自己的应用验收。

Microsoft 官方资料：https://learn.microsoft.com/en-us/entra/identity-platform/userinfo 。图标来自官方登录品牌素材：https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps ，保存在 `public/login-icons/microsoft.svg`。


## 旧站文章导入与发布前检查

文章管理中的“从旧站导入文章”仅对站长和管理员开放。当前支持 WordPress 公开 REST API：输入旧站固定文章链接，图片下载并登记到媒体库，内容保存到 `article_drafts`；不会立即发布。相同来源或已有链接别名会返回已有文章/草稿。首次发布保留旧站的本地发布时间，编辑已有公开文章不会重置日期。

`ARTICLE_IMPORT_ORIGINS` 是逗号分隔的 HTTPS 来源白名单，默认 `https://moooncci.cn`；正文和封面若使用独立图片域名，也须由服务器管理员加入白名单。禁止私网 DNS 地址及未授权跳转，连接固定使用已校验的 IPv4 地址。若服务器 DNS 返回代理保留地址（例如 198.18.0.0/15），请修复服务器 DNS，不要放宽私网校验。

单次最多 40 张图片、原始单图 8MB、总下载 50MB、解码 2000 万像素。图片重新编码为无损 WebP，动图仅导入首帧并提示。失败不创建草稿并清理本次新增文件。旧站脚本、表单及嵌入框架不导入；音视频需手动核对。不迁移评论与旧阅读量。

发布前检查验证标题、正文与图片加载，外链仅做格式检查；提供 375px、768px、1024px 独立 iframe 视口。此检查是编辑器辅助流程，不替代后端权限与字段校验。Safari 系统阅读器仍需真机验收。

本版本包含新依赖 `turndown`、`@mixmark-io/domino`，使用专用 `build-article-import-release.py` 离线打包。无需 SQL 迁移，但服务器必须已安装 `article_drafts`、`media_assets` 和 `posts.version`。部署脚本先检查旧文件版本，备份后只替换清单中的文件、两项纯 JavaScript 依赖和前端资源，重启 `mooncci-api`；保留 `.env`、上传目录和历史 SQL。失败自动恢复原后端及前端入口。上线后通过后台导入一篇未迁移的文章进行实测。


### Article update dates release

The article dates package contains the built frontend and only `server/src/routes/posts.js`
and `server/src/routes/articleDrafts.js`. It reuses the existing `posts.updated_at` column;
no migration or dependency installation is required. Published edits explicitly set
`updated_at=NOW()` while preserving `published_at`. Public article lists sort by update
time (with publication/creation fallback and descending ID ties). Draft autosaves do not
change the public timestamp. Existing timestamps are retained without a bulk rewrite.

Build locally with `python scripts/build-article-dates-release.py`. The scoped deployer
checks production file hashes against the baseline, backs up both backend files and the
frontend entry, restarts `mooncci-api`, and checks health before publishing the frontend.
Run `deploy.sh` in a child shell through `nohup`; never source it. `.env`, uploads and SQL
history are untouched. Unknown server edits stop deployment rather than being overwritten.


## Blog foundation releases

Build stages separately: `python scripts/build-blog-foundation-release.py 1` (discovery), `2` (about/links), `3` (SEO). Later packages include prior stages. Each scoped package preserves database, uploads and environment; it checks server file baselines, backs up replaced files and restarts the API. No dependencies or migrations are introduced. Never use the frontend-only packer for these releases.


### Third-stage SEO activation (separate from API/frontend deployment)

The SEO backend reads `SEO_HTML_TEMPLATE`, defaulting to `/www/wwwroot/mooncci.site/index.html`.
Keep `SITE_URL=https://mooncci.site` (or the real canonical HTTPS origin). No `.env` overwrite is performed.
The built `default-share.png` is the fallback for articles without covers. Public article HTML is generated
from the deployed Vite HTML template; this is metadata rendering, not server rendering of the full article body.

After `deploy.sh` reports exit code 0, activate the separate Nginx configuration:

```bash
nohup bash /www/backup/PACKAGE_DIRECTORY/enable-blog-seo.sh > /www/backup/PACKAGE_DIRECTORY/seo-nginx.log 2>&1 < /dev/null &
tail -n 40 /www/backup/PACKAGE_DIRECTORY/seo-nginx.log
```

Replace `PACKAGE_DIRECTORY` with this release's extracted directory. The upload script prints the exact path.
The default BaoTa vhost is `/www/server/panel/vhost/nginx/mooncci.site.conf`; pass a different confirmed vhost
path as the script's first argument when necessary. The script requires exactly one matching HTTPS server
block, adds `/www/server/panel/vhost/nginx/mooncci-blog-seo.inc`, backs up the original configuration, runs
`nginx -t`, and reloads only if valid. Failures restore the saved vhost/snippet. Its log prints the exact
child-shell rollback command. If the vhost layout is ambiguous, manually include the supplied snippet inside
the HTTPS `server` block, then run `nginx -t` before reload. Do not replace the existing API/assets locations.

The snippet forwards `/article/:id`, `/sitemap.xml`, `/robots.txt` to Node and adds `X-Robots-Tag: noindex`
to private frontend routes. After activation:

```bash
/opt/mooncci-node-v24.20.0/bin/node /www/backup/PACKAGE_DIRECTORY/verify-blog-seo.mjs https://mooncci.site
```

If rolling back to a package without the SEO backend, first use the Nginx rollback command, then restore the
backend files/frontend entry from that package's deployment backup. Older assets are retained for rollback.

Local acceptance: `npm run check`, `npm --prefix server test`, `node scripts/test-blog-foundation-browser.cjs`,
`node scripts/test-blog-pages-admin-browser.cjs`. MySQL-dependent integration tests still require the configured
test database; skipped tests are not evidence of a live database deployment. Production Nginx checks run on
activation, not in the Windows development environment.


## Dependency monitoring (Better Stack)

Build: `python -X utf8 scripts/build-dependency-health-release.py`.
Upload: `powershell -ExecutionPolicy Bypass -File scripts/Upload-DependencyHealth.ps1`.
Run the printed server commands in a child shell; deploy uses nohup, backs up the
three scoped backend files and frontend entry, and restarts only mooncci-api.
No migrations, dependency installs, environment replacement or upload changes.
Requires the already deployed blog-foundation stage 3 index baseline; unexpected
production modifications stop the release. Failure restores the old entry and
backend files; new unreferenced modules may remain on disk after rollback.

Create GET monitors at 3 minute intervals, with a request timeout of at least
15 seconds:
- `/api/posts?format=paged&page=1&pageSize=1`: public article/database service.
- `/api/health/dependencies/google`: server to configured GOOGLE_CERTS_URL,
  requiring a parseable currently valid X509 certificate in the response.
- `/api/health/dependencies/microsoft`: server to Microsoft discovery and RSA
  signing keys, restricted to Microsoft's identity host.

Dependency endpoints return 200 with ok=true or 503 with ok=false. Unknown IDs
return 404. Results (including failures) are cached for 60 seconds per API process;
concurrent requests share one probe. Checks have a 10 second total timeout, 256 KiB
response limit, no redirects, and a 30 requests/minute/IP route limit in addition
to the global API limiter. Clients cannot specify target URLs. Only non-sensitive
status, timestamp and elapsed time are public. Probes run on demand, not on a timer;
Better Stack supplies the schedule. A cached response retains its probe timestamp.
These are connectivity/dependency checks, not full OAuth login or client-secret
validation. GitHub monitoring has been approved and uses the existing
GITHUB_OAUTH_PROXY_URL and GITHUB_OAUTH_PROXY_KEY only. Add
`/api/health/dependencies/github` after deploying this release. It sends an
intentionally invalid token to the proxy /user route and requires HTTP 401 plus
Worker v3 diagnostic upstream_http_401. Local proxy rejection, generic 401,
redirects, rate limits and timeouts fail the check. Missing configuration returns
503. The public endpoint converts this verified upstream rejection to HTTP 200;
Better Stack should monitor this endpoint, not the proxy /user route directly.
No real user token, OAuth state or login session is created. The key never appears
in the public response; redirects are disabled. This verifies the /user transport,
not token exchange or complete login. Previous dependency-health packages are
accepted as upgrade baselines.

This release also includes the pending frontend fix preserving the Microsoft
four-color logo in dark mode. No GitHub push is required for offline deployment.

## mooncci Mail 客户端设置（2026-10-01）

`/mail-setup`、公共 Mozilla Autoconfig 和可选 Apple 描述文件下载的分包、Nginx 精确路由、日志隐私、DNS/证书与回滚步骤见 [MAIL-SETUP-DEPLOY.md](MAIL-SETUP-DEPLOY.md)。尚未上线，不改 MX 或邮件服务器，不复用网站通知 SMTP 账号；测试边界见 [MAIL-SETUP-TESTS.md](MAIL-SETUP-TESTS.md)。
### 个人邮箱收件箱与已发送（2026-10-03）

已开通的个人邮箱在 `/account/mailbox` 或站长的 `/admin/mailbox` 使用同一个收发界面。收件箱和已发送通过邮局 IMAP 993 读取，网页仅呈现纯文本正文；超过 2 MB 的邮件和附件请用邮件客户端查看。读信会将收件箱邮件标记为已读。新网页邮件经 SMTP 接收后会尝试保存一份到 IMAP 已发送；保存失败时明确提示，不能据此重发，因为 SMTP 已接受邮件。既有网页发送日志仍单独保留，不迁移也不删除邮局邮件。

本功能需要一个独立的后端离线包（`scripts/build-mailbox-imap-release.py`），包含 IMAP 依赖并隔离放在 `src/lib/mailbox-vendor`，避免更改站点其他依赖；安装时只重启 API。随后通过常规 `scripts/build-offline-release.py` 部署前端包，前端部署不重启 PM2。邮局域名默认沿用 `MAILBOX_SMTP_HOST`，也可在后端 `.env` 单独设置 `MAILBOX_IMAP_HOST` 和 `MAILBOX_IMAP_PORT=993`；不需要迁移数据库或改动邮局服务器。

### 个人邮箱密码与客户端设置（2026-10-04）

在 `/account/mailbox` 和站长的 `/admin/mailbox`，已开通用户可以进入客户端设置，并通过发送到登录邮箱的一次性验证码查看、复制或修改自己的邮局密码。客户端设置页从邮箱入口预填地址；配置文件仍不包含密码。改密先迁移 `202610040001_mailbox_password_changes.sql`，再更新网站 API，最后更新邮局代理；网站与邮局确认一致前，网页收发信会暂停。详细顺序、模糊结果的人工核对和密钥保护见 `server/mail-agent/README.md`。前端单独走离线静态包，不能用前端脚本替代后端或邮局部署。



## Article revisions / private bookmarks staged releases

Stage 1: `python -X utf8 scripts/build-reader-release.py revisions` then
`powershell -ExecutionPolicy Bypass -File scripts/Upload-ReaderRelease.ps1 -Stage revisions`.
Before production migration, create a BaoTa database backup. The upload script
prints verified child-shell/nohup commands, log path and frontend verification.
The revisions package applies ONLY `202609190001_article_revisions.sql`, replaces
five explicit backend files, restarts mooncci-api and mooncci-worker, and publishes
frontend assets after health verification. Existing backend file hashes must match
the accepted baseline. No historical SQL, .env, uploads or dependencies are replaced.
Fresh installs use updated schema.sql/init-db.js; never import that snapshot into
an existing database. The dedicated migrator uses the installed dependencies and
normal schema migration lock/checksum ledger. On failure the deployer restores
backed-up code and index.html, restarts the affected processes, and retains the
additive table and all saved revision data. For manual rollback, restore
server-before.tar into the backend root and index.html from the printed backup
folder, then restart the same processes; do not DROP the revision table.

Revisions are private to article authors and administrators. Autosaves consolidate
into five-minute server-time buckets with at most 200 automatic snapshots and a
30-day lifetime; manual/published/pre-restore snapshots remain until deletion.
Restoring only updates the working draft, never original publication time or
public article contents. An old article receives a baseline when first opened or
modified after installation, with the actual baseline capture time. Media URL
replacement also versions affected articles; history preserves the old URL, not
a copy of the underlying image file. Permanently removed media cannot be restored
by restoring article text. Daily worker cleanup and save-time caps use the same
retention rules. SQL rollback tests intentionally log an ER_SIGNAL_EXCEPTION.

Validation: `REVISION_INTEGRATION=true TEST_DB_PORT=33079 node --test server/test/articleRevisions.integration.test.js`
against a local, empty-password QA MySQL only; it creates/drops its own mooncci_qa database.
Browser validation: `node scripts/test-article-revisions-browser.cjs` (set
PLAYWRIGHT_CHANNEL=msedge on Windows). These commands never target production data.

### Stage 2: private bookmarks (deploy after stage 1)

Build: `python -X utf8 scripts/build-reader-release.py bookmarks`.
Upload: `powershell -ExecutionPolicy Bypass -File scripts/Upload-ReaderRelease.ps1 -Stage bookmarks`.
The package contains a complete frontend plus exactly four backend files:
`src/index.js`, `src/routes/account.js`, `src/routes/socialLogin.js`,
`src/routes/bookmarks.js`. Its only SQL is `202609190002_article_bookmarks.sql`.
It verifies the revisions table already exists, applies the additive migration,
and restarts only mooncci-api. It does not execute the historical migration set,
install dependencies, restart the worker, or replace .env/uploads. If stage 1
was rolled back, redeploy stage 1 before stage 2; the table existing alone does
not confirm that revision-history routes are active.

Before either stage, use BaoTa Database > the blog database > Backup and confirm
a downloadable backup completed. The deploy script additionally backs up each
replaced backend file and index.html under its printed `/www/backup/mooncci-reader.*`
folder. Keep that backup and the deployment log. Deploy stage 1, validate history
list/diff/restore with an editor account, then deploy stage 2 and validate bookmarks
with a reader account. Packages are local; neither new feature is pushed to GitHub
or installed in production automatically.

Private endpoints: GET `/api/bookmarks?page=1` (12 items), GET/PUT/DELETE
`/api/bookmarks/:postId`. Only the authenticated user's rows are accessible;
responses are no-store. Unpublished rows expose only relation ID, article ID,
collection time and available=false. No titles, covers, summaries or body leak.
Hard deletion cascades, and the existing administrator account-deletion transaction
clears private bookmarks during soft deletion. Focus/visibility refreshes local UI;
failed writes retain their error message. Login returns to an allowlisted article
or bookmarks URL and never automatically adds a bookmark.

Validation: `BOOKMARK_INTEGRATION=true TEST_DB_PORT=33079 node --test server/test/articleBookmarks.integration.test.js`;
`READER_MIGRATION_INTEGRATION=true TEST_DB_PORT=33079 node --test server/test/readerMigrations.integration.test.js`;
`node scripts/test-bookmarks-browser.cjs`. Use a disposable local test MySQL, not the
production database. The migration test executes the actual package migrator twice
per stage and verifies existing bookmarks survive.

Manual rollback (replace BACKUP with the path printed by the failed stage; roll
back stage 2 before stage 1). Run in a child shell, never source into SSH:

```bash
nohup bash -c '
set -euo pipefail
backup="$1"
stage="$2"
case "$backup" in /www/backup/mooncci-reader.*) ;; *) exit 1;; esac
case "$stage" in revisions|bookmarks) ;; *) exit 1;; esac
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
test -f "$backup/server-before.tar"
test -f "$backup/index.html"
tar -xpf "$backup/server-before.tar" -C /www/wwwroot/mooncci-source/server
cp -p "$backup/index.html" /www/wwwroot/mooncci.site/index.html
su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart mooncci-api"
if [ "$stage" = revisions ]; then
 su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart mooncci-worker"
fi
' bash /www/backup/mooncci-reader.BACKUP bookmarks > /www/backup/mooncci-reader-rollback.log 2>&1 < /dev/null &
tail -n 40 /www/backup/mooncci-reader-rollback.log
```

Rollback keeps both new tables and their data, all uploads and configuration;
new unreferenced backend modules/assets may remain harmlessly on disk. Do not
restore a whole historical SQL dump or drop these tables for a code rollback.
After restart, check `/api/health` and the signed-in page for the deployed stage.

## Dependency diagnostics hotfix (backend only)

Build `python -X utf8 scripts/build-dependency-diagnostics-release.py`, then upload
with `powershell -ExecutionPolicy Bypass -File scripts/Upload-DependencyDiagnostics.ps1`.
The verified offline archive replaces ONLY `server/src/lib/dependencyHealth.js`;
it does not contain frontend assets, unrelated pending features, SQL, dependencies,
.env or uploads. It accepts the previous deployed dependency checker hash or this
patch's hash, backs up the file, restarts mooncci-api and checks local health.
Failure restores the previous file and restarts the API. No worker restart.
The upload script prints child-shell/nohup deployment and log commands.

Logs use the prefix `[dependency-health]` and one JSON object per actual failed
probe, plus one `recovered` event when the next probe succeeds. Cache hits and
healthy steady-state checks do not log. Public 200/503 responses, their fields,
60-second caching and 10-second timeout stay unchanged. Correlate `checkedAt`
with Better Stack's response body; timestamps are UTC. Logs cannot reconstruct
failures that occurred before deploying this patch.

`responseStatus` is the status received from the proxy/upstream, NOT the public
health endpoint's 503. `proxyDiagnostic` contains only known Worker diagnostic
labels (`request_rejected`, `upstream_http_429`, `upstream_fetch_timeout`, etc.).
Missing/unknown diagnostic headers are labelled `missing`/`unrecognized`.
`proxyVersion` accepts only known versions 1, 2, 3. `reason` differentiates config,
network, timeout, malformed responses and unexpected proxy responses; `networkCode`
is limited to fixed DNS/TLS/connection error codes. No raw error message, URL,
request headers, response body, key, cookie or user token is logged.

Manual rollback: replace BACKUP with the printed backup folder, in a child shell:

```bash
nohup bash -c '
set -eu
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
tar -xpf /www/backup/mooncci-dependency-diagnostics.BACKUP/server-before.tar -C /www/wwwroot/mooncci-source/server
su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart mooncci-api"
' > /www/backup/dependency-diagnostics-rollback.log 2>&1 < /dev/null &
tail -n 40 /www/backup/dependency-diagnostics-rollback.log
```

## Proxy-only IPv4 mitigation

Build `python -X utf8 scripts/build-proxy-ipv4-release.py`; upload with
`powershell -ExecutionPolicy Bypass -File scripts/Upload-ProxyIPv4.ps1`.
This package requires the dependency diagnostics patch baseline and contains only
`src/lib/proxyTransport.js`, `src/lib/dependencyHealth.js`,
`src/lib/socialProviders.js`, `src/lib/googleIdentity.js`. It replaces no frontend,
configuration, dependencies, uploads or SQL; unrelated reader features are excluded.
The API is restarted after backing up existing files. Failure restores those files.
The new unreferenced helper may remain after rollback. The uploader prints the
verified child-shell/nohup commands and PM2 diagnostic log command.

Only the configured Google certificate URL and configured GitHub proxy routes
/token, /user, /emails use HTTPS family=4 and autoSelectFamily=false. TLS hostname
and certificate verification remain enabled; DNS still resolves current IPv4
addresses (no pinned Cloudflare IPs). Other providers keep their existing fetch
transport. OAuth request bodies/headers and response validation are preserved.
There are no redirects or retries, especially no replay of token exchange.
All affected calls retain a 10-second total AbortSignal deadline; Google's old
6-second socket inactivity timeout is replaced with a 10-second total deadline.
Health-probe result fields/cache and sanitized diagnostics remain unchanged.

This mitigates unavailable IPv6 and premature dual-stack address attempts on the
current host, but does not establish the prior incident's unique root cause or
eliminate IPv4 packet loss. After deployment, confirm both dependency endpoints
return 200/ok=true, and perform Google/GitHub login using a real account. Observe
subsequent Better Stack events and correlate checkedAt with diagnostic logs.
Read-only diagnosis remains available in scripts/diagnose-dependency-network.cjs.

Manual rollback (replace BACKUP with the printed backup directory):
```bash
nohup bash -c '
set -eu
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
tar -xpf /www/backup/mooncci-proxy-ipv4.BACKUP/server-before.tar -C /www/wwwroot/mooncci-source/server
su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart mooncci-api"
' > /www/backup/proxy-ipv4-rollback.log 2>&1 < /dev/null &
tail -n 40 /www/backup/proxy-ipv4-rollback.log
```


## 2026-09 维护基础专用包

新增 `/admin/runtime`，接口 `/api/admin/runtime` 仅 owner/admin 可读，响应 no-store。API 启动时间、worker 存活记录、真实迁移清单及应用磁盘状态分开显示。worker 90 秒无更新标为未知，不将进程存活当作任务成功。`server/runtime` 不进 Git，不包含账号或密钥；可用 `MOONCCI_RUNTIME_DIR` 改目录（部署记录仍使用默认目录，改目录时需同步部署工具）。

构建：提交本地变更后运行 `python scripts/build-maintenance-release.py`，上传：`powershell -ExecutionPolicy Bypass -File scripts/Upload-Maintenance.ps1`。上传器验证 SHA256 并输出 nohup 子进程部署命令。服务器需 Python 3.6+。本包包含前端及 MANIFEST.json 中列出的后端文件，无依赖安装和迁移；旧哈希资源不删除。后台功能要求先完成修订历史、收藏两批迁移，缺失则部署停止，不自动执行历史 SQL。

部署前逐项比对生产文件 SHA256，只接受已知基线或本次目标文件，发现未知改动停止。备份位于 `/www/backup/mooncci-manifest-*`。发生执行失败按清单恢复原文件并重启 API/worker；数据库、.env、uploads 和历史 SQL 始终不在替换范围。成功后记录发布包版本，不能把这个版本理解成所有后端文件均来自该提交。

运维脚本在包内 ops/，**不会随网站部署自动安装、启用计时器或修改备份配置**。配置与验证步骤见 `scripts/ops/README.md`。每日备份、异地复制、月度完整恢复演练和 RPO/RTO 验收尚需目标环境配置及实际运行；仓库校验不等同于可恢复性验收。

回滚成功部署时先停止下一次发布，用 MANIFEST.json 与备份逐项比对，确认在线文件仍为该包哈希；恢复备份中同名文件，对原来不存在的新文件仅删除清单记录的新增文件。保留旧哈希前端资源及全部新增数据表。不得整目录覆盖源站。自动失败回滚已包含上述文件级恢复；人工成功发布回滚在完成演练前不要用于生产。


成功部署后如需回滚，使用该包内 `ops/rollback.py`，与同目录 `deploy.py` 一起放置后，在子进程运行：`nohup python3 /www/backup/包目录/ops/rollback.py /www/backup/mooncci-manifest-对应备份目录 > /www/backup/mooncci-rollback.log 2>&1 < /dev/null &`。工具先校验所有在线文件和备份，再恢复；发现后续修改即拒绝。用 `tail -n 60 /www/backup/mooncci-rollback.log` 检查结果。恢复中断时保留现场和备份，不重复覆盖未知文件。


## 双服务器内部验证版（未切换流量）

美国主机 107.174.123.42 / Ubuntu / 宝塔，已有 cuegroveapp.com。使用独立用户、目录、3102 本机端口及独立源站域名，禁止覆盖原网站或默认 Nginx 配置。当前 SSH 无可用密钥，用户已提供只读环境信息：Ubuntu 24.04.4、宝塔 Node 22.23.1、3102 空闲；专用首次安装器据此准备。

`python scripts/build-reader-node-package.py` 生成美国阅读节点专用离线包，复用 `.cache/maintenance-release.json` 对应生产版本的静态资源，不在美国服务器构建前端或拉取 GitHub。Worker 单文件为包内 WORKER.mjs；默认关闭、仅准备 preview 模式。独立服务使用已验证的宝塔 Node 22.23.1 路径，不升级或替换已有网站的运行时。无需 MySQL、生产 .env 或账号密钥。

动态 HTML/API 继续 no-store，草稿附件不进入节点；当前仅静态资源及公开匿名转发，不宣称已完成动态缓存与失效。账号额度监控、公开媒体同步及跨境性能实测仍在上线门槛内。完整操作边界见 cloudflare/read-router/README.md。


美国首次安装入口为 `scripts/Upload-ReaderNode.ps1`。服务器安装器只使用已有 `/www/server/nodejs/v22.23.1/bin/node`，精确版本不符则停止；通过节点本机测试后，启用独立 systemd 服务，不改宝塔 Nginx/DNS，不重启 PM2。检查日志出现 `Reader local installation complete. Public routing remains OFF.` 后，再进行源站域名、证书和 Worker 内部验证。BOM 问题已在只读检查工具中改用无 BOM UTF-8 的 Base64 传输修复。
# Mailbox performance pilot (2026-10-04)

This release does not change SMTP submission, accepted/uncertain states, synchronous Sent APPEND,
mailbox permissions, password verification, message retention, Postfix or Dovecot configuration.
The candidate is tested with the deployed ImapFlow 2.2.1 and existing isolated mailbox dependencies.

`MAILBOX_TIMING_ENABLED=true` enables one numeric JSON summary (`mailbox_timing`) per sampled
send/list/read request. `X-Mail-Request-ID` correlates the response and log. Default sampling is 10%,
with slow (>=3s) and unsuccessful requests eligible regardless of sampling; the shared per-process
cap defaults to 60 records/minute. The deployment pilot uses 100% sampling subject to this cap.
No addresses, subjects, bodies, passwords, encrypted secrets, AUTH data, headers or arbitrary error
objects are passed to the timing logger. `flags_ms=0` includes reads that do not need to mark Seen.
`imap_connect_ms` includes authentication/initialization, not just TCP/TLS. Warm health checks are
reported separately as `imap_health_ms`. `total_ms` begins before route authentication and ends at
HTTP finish (or client abort; an abort record is partial). Existing process log retention applies.

Pooling is OFF by default. Enabling `MAILBOX_IMAP_POOL_ENABLED=true` also requires
`MAILBOX_IMAP_POOL_API_PROCESSES=1`, PM2 instance 0, current owner role, and exactly
`mooncci@mooncci.site`. Ordinary users retain the original cold path. The pilot has one retained
connection in the API process, a 30s idle TTL and 45s socket inactivity timeout, max 8 admitted tasks
per account, 15s queue wait limit and 60s active-operation deadline. Busy exhaustion fails closed;
it never opens an extra connection. A reused connection is checked using NOOP with a 4s deadline,
so a half-open socket does not wait for the longer idle-compatible socket timeout. Reconnection is
allowed only before the mailbox operation begins; FETCH/STORE/APPEND are never automatically replayed.
Each admitted operation rechecks active user/mailbox, owner role, rotation status and encrypted
credential version after queueing. Website password change/rotation, reconnect/disconnect, mailbox
revocation and admin account invalidation immediately close local retained connections and invalidate
queued snapshots. Out-of-band mail-server password edits cannot send an immediate application event;
the short idle TTL still bounds retained sessions.

The release and owner-enable scripts refuse multiple API processes or cluster mode. **Disable this
pilot before PM2 scaling.** This is not a distributed connection pool; the process-count declaration
must not be used to bypass that deployment check. Dovecot's 10 connections/user/IP limit remains
unchanged. This pilot adds at most one retained owner connection, while other clients retain their
existing behavior. SIGINT (PM2) and SIGTERM close the pool and stop accepting new HTTP connections.
The HTTP shutdown grace is bounded at 60s; the supervisor's kill timeout may terminate earlier.

Validation commands:

```powershell
node --test server/test/mailbox*.test.js
npm run typecheck
npm run build
node scripts/test-mailbox-send-feedback.cjs
node scripts/test-mailbox-credentials-browser.cjs
python scripts/build-mailbox-performance-release.py
python scripts/build-offline-release.py
```

The backend packer requires a clean committed tree, verifies all LF/checksum bytes and uses baseline
`b594edf475fa972b1c7ec54b57d2e3602457904b`. It installs only seven reviewed JS files, verifies the
current file hashes first, saves rollback copies and only five performance env keys. No migration,
dependency installation or worker restart is involved. Run `deploy.sh` with nohup in a child shell.
It initially enables instrumentation only. The frontend remains a separate frontend-only archive.

Given the `BACKUP` path printed by deployment, run these **on Beijing as root**:

```bash
# Enable the owner pilot after baseline observation and the read-only benchmark:
bash /www/backup/mooncci-mail-perf.XXXXXX/mode.sh owner
# Immediate feature rollback: keep timing, return everyone to cold connections:
bash /www/backup/mooncci-mail-perf.XXXXXX/mode.sh instrumentation
# Disable both features:
bash /www/backup/mooncci-mail-perf.XXXXXX/mode.sh off
# Full scoped code/config rollback:
bash /www/backup/mooncci-mail-perf.XXXXXX/rollback.sh /www/backup/mooncci-mail-perf.XXXXXX
```

Replace `XXXXXX` with the actual recorded backup suffix. Each mode command restarts only the API.
Full rollback refuses unreviewed intervening changes, restores only these files/flags and preserves
all other env settings, SQL, uploads and mail data. Frontend rollback restores its separately saved
index.html; hashed assets are retained.

The owner benchmark `scripts/benchmark-mailbox-imap.cjs` runs 10 cold + 30 warm lists and 10 cold +
30 warm reads. It selects an already-read small message, forces EXAMINE, blocks STORE/APPEND and
all non-allowlisted protocol commands, never invokes SMTP, and emits only numeric phases. It can
load staged candidate libraries with `--library-root`, leaving deployed source untouched. Results
use nearest-rank p50/p95; the read benchmark excludes Seen writes by design. Do not run it in
parallel with another benchmark or a live mailbox load test.

### Owner lifecycle and HTTP observations (phase 1, October 4)

Package against the current reviewed deployment using `python scripts/build-mailbox-performance-release.py --base add96b76f74ca559b376b04d6f77d28a1f3578ae`.
The same seven-file scope and backup checks apply; six scoped env keys are now saved.
`mode.sh owner` selects a 300000ms idle lease; `mode.sh owner-short` restores 30000ms;
`mode.sh instrumentation` disables reuse. Other users remain on the cold path.
ImapFlow 2.2.1 closes our quiet, unlocked, non-IDLE socket on inactivity timeout. Therefore
the pooled socket timeout is idle + 15000ms (315000ms in the pilot), while the existing 60000ms
operation deadline and 4000ms pre-reuse NOOP deadline remain unchanged. No periodic keepalive
extends the lease; incoming server traffic cannot reset the pool's wall-clock idle expiry.
Password/access changes and shutdown still invalidate immediately. Pool counters are process-local,
reset on restart, and emitted as content-free lifecycle events, capped at 60/minute.

Mailbox timings now include normalized paths (no UID/query), millisecond completion time, account
and history requests, and trusted ingress metadata. IDs are generated by Node, never copied from
client headers. The CN loopback proxy overwrites ingress based on the trusted peer, not on a
client-provided header. Nginx logs the returned Node ID; requests rejected before Node keep `-`
and have their separate Nginx ID. This distinction must be preserved in analysis.

`ops/mail-performance/nginx-observation.py install CN` on Beijing and `install US` on the existing
US gateway add an independent mailbox-only access log at `/www/wwwlogs/mooncci-mail-timing.log`.
This records only normalized route, IDs, entry, status and HTTP/upstream timings. It does not log
IP addresses, query strings, cookies, auth, bodies or email headers. It preserves existing general
logging, backs up exact configuration bytes, tests Nginx before graceful reload, and automatically
restores on failure. Revert with `python3 BACKUP/nginx-observation.py rollback BACKUP` using its
printed `OBSERVATION_BACKUP`. Remove the temporary log setup after the observation window; normal
Nginx log rotation applies. No Postfix/Dovecot settings are involved.
# Bounded multi-user Web Mail rollout (2026-10-04)

The currently supported single API fork shares at most 6 IMAP and 4 SMTP account slots,
including cold fallback. Each account has one serialized lane per protocol, at most 8
queued operations and a 15-second admission deadline. At most 64 operations per protocol
may wait. Idle LRU slots are evicted under pressure; otherwise idle lifetime is at most
five minutes. Busy slots are never evicted. Invalidated busy slots retain their reservation
until the operation actually settles, preventing reconnect overlap.

Dovecot 2.3.21 limits each user/source-IP pair to 10 connections, not all users from Beijing
to 10 total connections. Its IMAP process limit is 1024. Postfix has a client connection
limit of 50 and default process limit of 100. These are ceilings; Web Mail deliberately
uses much less, leaving headroom for Roundcube and external clients. Re-budget before
adding PM2 workers; deployment refuses rollout unless exactly one API fork instance 0 runs.

`MAILBOX_POOL_ROLLOUT_PERCENT` deterministically hashes internal user IDs. The existing
owner remains included at 0%; `MAILBOX_POOL_TEST_USER_IDS` adds explicit test accounts.
Live DB validation before each operation requires active user/mailbox, unchanged encrypted
credential/address, and no pending password change. Account deletion also invalidates
that user's connections immediately after commit.

Build with `python scripts/build-mailbox-performance-release.py --base b9fa03f79104ffd2d7f36ac0c9c2a78031b200bb`.
The scoped backend archive adds no frontend dependencies, migration or mail-server settings.
Deployment creates a fresh `/www/backup/mooncci-mail-perf.XXXXXX` backup and starts with
instrumentation only. Run its `mode.sh` in a nohup child shell, in order:
`owner-smtp`, `test <A_ID,B_ID,C_ID>`, `rollout25`, `rollout50`, `all`.
Stop expansion on any isolation, TLS, resource or uncertain-delivery failure.

Independent rollback modes: `bash <backup>/mode.sh smtp-off`, `imap-off`, or `instrumentation`.
Full rollback: `bash <backup>/rollback.sh <backup>`. Run in a nohup child shell and check
its log. These restart only the API and never replay mail or modify mailbox/queue contents.
`MAILBOX_POOLS_ENABLED=false` disables both reuse paths while retaining bounded cold admission.

Pool logs have protocol-level counters/gauges and request IDs, with no identity labels.
Active/idle count conservative account-slot reservations: a dead socket may retain an idle
slot until next use, LRU or expiry. This can overestimate live sockets but never admits extra
connections outside the budget. Transport fault events and failed operations may both
contribute to the broken event counter; it is not a count of distinct connections.
Per-request reuse/reconnect flags are the basis for rates. Pool logs are capped at 120/minute;
request timing sampling keeps its separate configured cap. Saturation returns the existing
bounded error response; no SMTP operation is automatically retried.

The separate SMTP observation commit records start/end, public Nodemailer durations/size
and strictly parsed Postfix queue IDs, without full responses, headers, addresses, AUTH or
MIME content. Local TLS fixtures exercise 10/20/50 users without external mail delivery.

# Owner SMTP pooling pilot (2026-10-04)

`MAILBOX_SMTP_POOL_ENABLED=true` and `MAILBOX_SMTP_POOL_API_PROCESSES=1` only apply to the active owner mailbox `mooncci@mooncci.site` in API instance 0. Other mailboxes retain a new transport per request. One serialized process lane uses `maxConnections=1`, `maxMessages=50`, `maxRequeues=0`; queue capacity is 8 behind the active send, queue wait 15 seconds, connection timeout 15 seconds, active socket inactivity 30 seconds and overall SMTP operation limit 60 seconds. There is no retry after submission begins.

The public Nodemailer `getSocket` hook supplies a certificate-verified native TLS socket. SMTP/AUTH/DATA remain implemented by Nodemailer. Tracked public sockets allow immediate credential/revoke/shutdown cleanup and retain the original active timeout. Only after a successful submission does the socket enter a 300-second idle lease (315-second idle watchdog). Before the next send it returns to the 30-second active timeout. The independent idle timer closes the transport even if server traffic continues. This does not change SMTP accepted/uncertain handling, DB records, synchronous Sent APPEND or MIME storage.

The backend offline packer includes the two SMTP adapter files with preflight baseline hashes. Install first in instrumentation-only mode, verify health, then explicitly run its backup-local `mode.sh owner-smtp` for the dual owner pilot. `mode.sh owner` immediately returns SMTP to cold transports while retaining the five-minute owner IMAP pilot; `mode.sh instrumentation` disables both reuse paths but retains timing; `rollback.sh BACKUP` restores the exact files and prior flags. All switches restart API 0 only. Keep worker 1 unchanged. Do not enable on a multi-worker API deployment.

New numeric telemetry: `smtp_connect_ms` (DNS/TCP/TLS via getSocket), `smtp_pool_wait_ms`, `smtp_connection_reused`, `smtp_reconnect_count`. `smtp_submit_ms` still measures the entire adapter call, including validation/queue time. A cold fallback has no split connection instrumentation (zero is unmeasured there, not proof that connect was free). Never add protocol debug logs.
# Opt-in real-browser diagnostics (2026-10)

`/diagnostics` starts a tab-local 20-minute recording only after an explicit click.
Export contains normalized paths (no query strings or message IDs), request IDs,
status, resource timing, API duration and UI-ready markers. It never uploads the
browser report automatically. The user's relay mode selection is a label, not a
network location measurement. A UI-ready marker describes that component's state,
not a guarantee that every page resource has rendered. Browser timing restrictions
and missing fields must not be interpreted as zero latency.

API timing is also opt-in (`X-Mooncci-Diagnostic: 1`) with an endpoint allowlist and
60 safe log rows/minute/process. `SITE_DIAGNOSTICS_ENABLED=false` disables server
observations. No Cookie, Authorization, request/response body or full headers are
logged. `X-Mail-Request-ID` takes precedence when correlating mailbox operations.
The reader forwards only the boolean opt-in and validated response timing/UUID.
`UNKNOWN` ingress is preserved when no trusted ingress signal exists.

Run `npm run check`, `node --test server/test/siteDiagnostics.test.js`, and
`node scripts/test-browser-diagnostics.cjs` before release. Tests use local fixtures;
they do **not** reproduce iCloud Private Relay. Capture real iPhone/iPad reports
with relay on/off before claiming that cross-region latency is resolved.

Build backend and reader archives with `python scripts/build-site-diagnostics-release.py`
from a clean reviewed commit. Each archive includes a baseline hash manifest and
checksum sidecar; run `nohup bash deploy-site-diagnostics.sh > deploy.log 2>&1 &`
in its own extracted directory after checksum verification. Backend deployment
only restarts the verified API process; reader deployment only restarts its service.
Neither edits `.env`, mail pool flags, worker, dependencies, SQL, Nginx or mail data.
Rollback: `bash /www/backup/mooncci-site-diagnostics.<id>/rollback-site-diagnostics.sh /www/backup/mooncci-site-diagnostics.<id>`
using the backup printed by that host's deploy log. Frontend uses the existing
offline frontend workflow and its independent index backup. Build with
`VITE_BUILD_REVISION` set to the reviewed commit for exported report attribution.

Bundle review: diagnostics adds an optional page and small shared timing collector;
the total raw JS allowance increases from 2,210,000 to 2,225,000 bytes. Initial JS,
initial CSS, maximum chunk and gzip budgets are unchanged (measured initial JS
approximately 296 kB raw / 96 kB gzip).

Mailbox navigation release is frontend-only: snapshots retain only the latest
header page and scroll position per folder in the mounted, account-keyed component.
They are cleared on account/permission/password-change status changes and never
written to browser storage. Folder switches still revalidate with the API; failed
401/403/409 responses erase snapshots. Reading never prefetches message bodies.
Sending history loads only when its disclosure is opened; confirmed send status
survives a later folder refresh failure. Published resource requests coalesce only
while in flight, with independent cancellation and a 40-entry bound.

Run `node scripts/test-mailbox-navigation.cjs` and
`node scripts/test-mailbox-send-feedback.cjs` after building. Deploy only the
frontend archive; do not restart PM2. The US reader has **no index.html**: sync only
`dist/assets/` with `rsync -ac --ignore-existing`, then verify the asset checksums.
Do not run the main site's frontend entry-point installer on the reader directory.
Retain old hashed assets; rollback the Beijing `index.html` from the printed backup.

## 真实设备诊断修正与美国 HTTP/2（2026-10-05）

前端沿用离线包部署；诊断阶段缺失值现在为 `null`，新增同源页面链接点击事件与 `request_wait_ms`，不默认采集、不自动上传。不得把组件级 `content-ready` 当作完整页面完成。

美国网关协议修正单独部署，不由前端包执行。将 `ops/mail-performance/us-http2.py` 以 LF 字节上传到美国服务器 `/root/mooncci-us-http2.py`，先运行：

```sh
python3 /root/mooncci-us-http2.py preview
# 将上一步 before 字段的 SHA256 作为参数；仅在核对目标为美国网关后执行。
nohup python3 /root/mooncci-us-http2.py apply REVIEWED_SHA256 > /root/mooncci-us-http2.log 2>&1 < /dev/null &
```

脚本仅对 `/www/server/panel/vhost/nginx/mooncci.site.conf` 添加一条 `http2 on;`，备份、语法校验、平滑 reload，再验证 h2/h1 兼容与正常证书校验。失败自动回滚；不重启 PM2、不更改 upstream/数据库/邮件服务。回滚使用部署日志返回的备份路径：

```sh
python3 /root/mooncci-us-http2.py rollback /www/backup/mooncci-us-http2.RETURNED_SUFFIX
```

手动回滚也有 SHA 漂移检查；如配置已被另一个发布修改，拒绝覆盖，须审查差异。实际用户体验需重新导出设备记录确认，HTTP/2 握手通过本身不是性能达标证据。调查记录见 `docs/real-device-diagnostics-20261005.md`。


## Tiptap frontend release (2026-10-06)

This release replaces the visual editor with Tiptap. Native rich text is stored in the existing content field with `<!--mooncci-richtext:v1-->`; legacy Markdown is preserved until edited in visual mode. No database migration or backend dependency change is required. The frontend renders both formats and sanitizes rich HTML before rendering/importing.

The mobile toolbar sits below the bounded editor and scrolls horizontally. Legacy Markdown conversion and the search panel load on demand. Existing Radix dependencies are reused. Entry budgets remain unchanged.

Release exception: the user explicitly requested immediate deployment after reviewing the aggregate bundle-budget failure. `bundle-budget.json` and CI checks remain unchanged. Type checking, unit tests and production build must pass; record the measured aggregate failure separately instead of claiming `npm run check` passed. Build the scoped frontend archive locally using `make_bundle` only after those checks and a clean committed tree, preserving its LF/checksum verification. Upload and run the packaged deploy script in a child shell with nohup; do not restart PM2.

Rollback: the deploy script saves the previous index and retains hashed resources. Restoring that index reverts the UI, but the previous renderer does not support newly saved native rich text. After users save native content, keep the new dual-format reader in any rollback release; do not convert or discard saved content. An immediate rollback before native content is created may restore the saved index atomically.


## Public document rendering (SEO)

`npm run build` builds the browser into `dist/` and the isolated Node renderer into
`server/runtime/`. Install server dependencies for local rendering with `npm ci --prefix server`.
The Express document route reads the same frontend `index.html` and renders the existing React
pages using anonymous, allowlisted loopback reads. It never forwards session cookies or credentials.
Only published content enters public HTML; private tools remain noindex and client rendered.
Set `SEO_HTML_TEMPLATE` when the frontend root differs from `/www/wwwroot/mooncci.site/index.html`.
Retain the existing `PUBLISHING_ENABLED` setting; disabled series are omitted from indexing.

Validate with `npm run typecheck`, `npm test`, `npm test --prefix server`,
`npm run build`, `node scripts/test-document.mjs`, and `npm run check:bundle`.
MySQL integration cases require the existing test database setup; skipped cases are not passes.

The scoped offline package uses `scripts/build-document-release.py` and `scripts/deploy-document.sh`.
Before packaging, copy `scripts/document-runtime/package*.json` into `.cache/document-deps/`
and run `npm ci --prefix .cache/document-deps --omit=dev --ignore-scripts`.
Commit source, build, then run `python scripts/build-document-release.py`.
The bundle includes pure-JavaScript jsdom dependencies under `server/runtime/node_modules`,
not Windows native modules and not the live backend node_modules directory.
It replaces only three SEO source files, the renderer, frontend assets and the SEO Nginx snippet.
No migrations, environment replacement, upload deletion, mail changes or worker restart occur.
The API restart is required for the new Node renderer. This is not a frontend-only package.

Upload the archive and its `.sha256` with PowerShell `scp -i <existing-key> <archive> <sidecar> root@182.92.179.81:/www/backup/`.
On the server, verify `sha256sum -c <archive>.sha256`, unpack to a new named directory,
and run `nohup bash <unpacked-directory>/deploy.sh > <release-log> 2>&1 < /dev/null &`.
The script records a unique backup directory and automatically restores source, index and Nginx
on failure. Retain hashed frontend assets so open tabs and rollback remain functional.
For manual rollback, restore `src/routes/seo.js` and `src/lib/seo.js` from that backup,
restore `index.html`, `vhost.conf` and `nginx-before.inc` to their original paths;
restore the prior `runtime` directory when present, run `nginx -t`, reload Nginx and restart
`mooncci-api` as user `mooncci`. Use a child shell, never `set -e` or `exit` in an interactive SSH shell.

The independent `www.mooncci.site` virtual host uses a separate certificate and returns 301 to
`https://mooncci.site$request_uri`. Its HTTP ACME challenge path must remain accessible for renewal.
DNS defaults to the existing Beijing server solely for this redirect; root-domain regional records
and mail DNS records remain unchanged. Check certificate renewal through the existing BaoTa ACME job.

### 自动静态 sitemap（2026-10-07）
`/sitemap-pages.xml` 是运行时生成的完整公开地图，不放入前端 public 目录。
`mooncci-sitemap.timer` 每 5 分钟调用本机已有的 `/sitemap.xml` 公开查询，校验后原子替换；失败保留上一份并记录 systemd 错误。发布/撤回/删除最多约 5 分钟同步。数据库不可用期间会保留上次地图，恢复后自动更新。
打包：`python scripts/build-sitemap-release.py`。上传包与 SHA256 后在子 shell 执行 `nohup bash deploy.sh > deploy.log 2>&1 < /dev/null &`。无需重启 PM2 或迁移数据库。
检查：`systemctl status mooncci-sitemap.timer`、`journalctl -u mooncci-sitemap.service -n 20`。
回滚：`nohup bash rollback.sh /www/backup/mooncci-sitemap.XXXXXX > rollback.log 2>&1 < /dev/null &`（用部署日志实际备份目录替换）。

### 依赖监控瞬时故障处理（2026-10-07）
成功探测缓存仍为 60 秒，失败缓存缩短至 5 秒。只读 GET 发生连接重置、临时 DNS 错误或超时时最多重试一次，每次 4 秒，整次探测仍受 10 秒上限约束。HTTP 错误和证书内容错误不重试；持续失败返回 503。重试恢复记录 retry_succeeded 和次数。OAuth token 交换与真实登录流程保持不变。

## Homepage performance release

Build with `npm run build`, then `python scripts/build-home-performance-release.py` after committing. The scoped package includes the API entry, bounded image variant handler, matching SSR runtime and frontend. It uses existing Sharp dependencies, restarts only mooncci-api, and does not touch uploads, environment or SQL. Run deploy.sh with nohup in a child shell; its output records the backup directory. Roll back using `nohup bash rollback.sh /www/backup/mooncci-home-performance.XXXXXX > rollback.log 2>&1 < /dev/null &`. Image variants are limited to six widths, two concurrent transforms and a 16 MiB process cache. Original images remain available; deletion is checked before serving cached variants. Weather waits for initial load plus 1.5 seconds; automatic login preload waits three seconds while intent-based preload stays immediate.


### 首页性能与访客会话探测修复（2026-10-08）

前端会话探测改为 GET /api/auth/session；匿名、过期或失效会话返回 200 和 {"user":null}。GET /api/auth/me 仍要求登录。认证服务异常返回 503，前端保留当前账号状态。两条接口均使用 private, no-store 并按 Cookie/Authorization 区分响应。

本次发布必须同步 dist/、server/runtime/、server/src/lib/publicDocument.js 与 server/src/routes/auth-cookie.js。先更新后端再开放新前端；不能使用纯前端发布器部署此修改。需要单独审查限定文件的后端离线包并重启 API，无新增依赖或数据库迁移。保留 .env、uploads 和历史 SQL。

验收：npm run check；node scripts/test-document.mjs；node --test server/test/sessionProbe.test.js server/test/authLogout.test.js server/test/publicDocument.test.js。上线后以无 Cookie 的请求验证 /api/auth/session 返回 200 和 user:null、/api/auth/me 返回 401，再在相同条件下复测 PageSpeed FCP/LCP。
