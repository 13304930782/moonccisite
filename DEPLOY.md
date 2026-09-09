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

1. 在 Google Auth Platform 创建 Web OAuth 客户端，并将正式域名加入“已获授权的 JavaScript 来源”。弹窗回调模式不需要填写重定向 URI。
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

后台“水电监控设置”支持逐行添加整点计划、修改任务和删除非零点行，00:00 日统计固定保留。计划保存在现有 site_settings，worker 每 30 秒读取更新；早报、晚报各最多一次，保存不补发。首次部署需同时更新 API、worker 与前端，无新增迁移或依赖；原手动历史同步、冷却与零点预测逻辑保持。上传和发布命令见 [ELECTRICITY-HISTORY-SYNC.md](./ELECTRICITY-HISTORY-SYNC.md)。

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

后台 `/admin/login-settings` 仅站长可访问，支持 GitHub、Google、QQ、微信、Gitee 的开关、应用 ID、密钥保存/清除与回调提示。默认保留现有 Google，其余渠道默认关闭。只有配置齐全且已启用的渠道显示在登录/注册页；Google 保留整行官方按钮，其余使用本地图标。密钥不回显，AES-256-GCM 加密存储。空密钥保留原值，更换应用 ID 必须先停用，并重新填写密钥。历史绑定按平台和应用 ID 隔离。

Google 继续使用现有 GIS 凭证模式和 `googleIdentity.js`，默认 CF 证书代理 `https://google-certs.mooncci.site/google-certs` 及 `GOOGLE_CERTS_URL` 覆盖逻辑保持不变。未保存后台覆盖时沿用 `GOOGLE_CLIENT_ID` 或原默认值。不需要 Client Secret，不改 CF Worker，也不新增 Google 回调模式。已有 `users.google_sub` 关联保持可用；对尚未绑定的同邮箱账户，要求先用原方式登录再主动绑定，不自动合并。

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
