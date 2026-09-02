# 宝塔部署说明

1. 在宝塔 MySQL 中创建数据库并导入 `server/database/schema.sql`。
2. 在服务器 `server/.env` 配置数据库和 `JWT_SECRET`。
3. 进入 `server` 执行 `npm install`。
4. 用 PM2 启动后端：`pm2 start src/index.js --name mooncci-api`。
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

宿舍电量监控使用现有 Node.js 后端、MySQL、PM2 和 SMTP，不需要 Python 或额外常驻服务。学校接口地址固定在后端；浏览器只访问本站 `/api/electricity`。

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
