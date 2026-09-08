# mooncci 宿舍电量私密 RSS

## 本次实现与边界

现有系统是一个由服务器环境变量配置的宿舍，电量管理权限为 `owner`。没有用户与多宿舍绑定模型，因此沿用站长权限：每位站长只能管理自己在当前配置宿舍下的订阅链接，不接受客户端指定用户或宿舍。未新建账户、宿舍设置页或其他监控功能。

电量页面 `/electricity` 底部新增「私密 RSS 订阅」，仅登录的站长可见。支持创建、查看、复制和重置；重置前明确说明旧链接立即失效。未登录、管理员、编辑和普通用户不能管理订阅。

现有电量面板及其公开数据接口保持兼容；此次私密保护的是独立的报告订阅，没有将既有面板改成私有。报告不进入博客 RSS、文章更新流、sitemap 或公开订阅入口。

视觉按 Extension 模式沿用原页面：黑白灰变量、Inter、细线分区、原有按钮，控件至少 44px；品牌保持 mooncci。设计变化 1/10、动效 1/10、密度 4/10、素材依赖 1/10、品牌一致性 10/10。原导航、图表、表格、容器宽度和 logo 均保留。

## 报告流程

- 独立 worker 和已有 MySQL worker 锁保持不变。`ELECTRICITY_SCHEDULE_HOURS` 默认 `7,12,21`，最早时段生成早报，最晚时段生成晚报；午间只采样。已有自定义时间继续生效。
- 在原定时采集完成后，先写入 `electricity_reports`，再发送原早晚邮件。邮件和 RSS 使用同一份不可变快照与指标，SMTP 失败不影响已提交报告。
- 按 `scope_key + report_date + period` 唯一；UUID 为稳定报告 ID。重试复用已保存报告，不再次采集、不更新发布时间、不生成重复 RSS 条目。
- `dailyNotify` 继续只控制早晚邮件。关闭该选项时，已启用的监测仍保存定时报表；`enabled=false` 则仍按旧逻辑停止采集。
- 手动刷新、测试邮件、低电量告警不创建 RSS 报告。采集失败时，只保存该次已尝试的早/晚时段的失败记录，不额外发邮件；已有当天失败暂停策略不变，未尝试的时段不伪造报告。
- 最新 60 份报告倒序返回。不会删除报告历史，也不从旧每日覆盖记录反推历史早晚报告。
- 新增采样 `scope_key`，旧采样不回填宿舍归属。报告指标只采用相同 scope 与电表的新采样，因此上线初期均值和预计天数可能显示「数据不足」。
- 今日用电直接使用采集值；余额变化比较此次采集与前一次同宿舍采集，并记录比较基准时间。7 日均值取最近 7 个自然日内有效日采样（包含有效的 0、以及当日截至采集时的用电），同时显示样本天数。至少 3 天有效样本且均值大于 0 才预计天数。
- 缺失值不转换为 0；采集失败、数据过期/时间未知和部分字段缺失分别说明。发布时间和正文时间使用 Asia/Shanghai，RSS `pubDate` 输出 `+0800`。

## 接口与私密性

- `GET /api/electricity/rss/subscription`：登录站长查看自己的当前链接，不会自动创建。
- `POST /api/electricity/rss/subscription`：幂等创建。复用 Cookie 登录、`ownerOnly` 和全局 `X-Requested-With`/Origin CSRF 检查。
- `POST /api/electricity/rss/subscription/reset`：替换令牌，旧链接立即失效。
- `GET /api/electricity/rss/feed.xml?token=...`：阅读器凭令牌读取，无需 Cookie，只查询报告、不触发采集或邮件。

随机令牌为 32 字节（256 位），数据库以 SHA-256 索引验证，另用 AES-256-GCM 加密保存副本供站长再次复制。加密使用现有 `JWT_SECRET` 派生密钥并绑定用户与宿舍 scope。数据库中没有明文订阅令牌。重置替换哈希及密文；停用/降权账号后读取失效；改变宿舍配置不能用旧链接读取新宿舍。轮换 `JWT_SECRET` 后需要重新登录并重置订阅链接。

所有该路由响应使用 `private, no-store`、`no-referrer` 和 `noindex`。应用代码不记录 URL/令牌，不埋点、不存 localStorage；RSS 正文也不包含令牌。阅读器已下载的历史内容无法远程抹除。

**部署时必须设置 Nginx 的专用位置块，防止默认访问日志记录查询字符串中的令牌，并禁止代理缓存：**

```nginx
# 在 mooncci 站点 HTTPS server {} 中，和原 /api/ 位置块并列。
location = /api/electricity/rss/feed.xml {
    access_log off;
    # Nginx 上游连接错误可能携带完整请求行，此私密入口仅保留 critical 日志。
    error_log /var/log/nginx/mooncci-electricity-rss.error.log crit;
    proxy_cache off;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

使用宝塔 Nginx 时，把 `error_log` 路径改为已存在的 `/www/wwwlogs/mooncci-electricity-rss.error.log`。如果站点前方还有 CDN、WAF 或分析代理，也应对这个确切路径关闭缓存并屏蔽查询参数日志。不要在命令行、工单或公开截图中粘贴真实令牌。

## 迁移、启动与部署

无新 npm 依赖、无新邮件开关。保留已有 SMTP、采集凭据、时间配置和 PM2 配置。API 与 worker 必须使用相同 `SITE_URL`、`JWT_SECRET` 和宿舍环境变量；`SITE_URL` 设置为实际公网 HTTPS 站点，不能使用请求 Host 推断私密链接。

唯一新增迁移为 `server/database/migrations/202609050002_create_electricity_reports.sql`：创建报告、订阅表，为每日采样添加可空 scope 字段。不修改已执行的迁移，也不导入整份 `schema.sql` 覆盖生产数据库。

本地打包文件位于 `.cache/mooncci-electricity-rss-20260905-v2.tar.gz`。其中只有本次涉及的代码、新迁移和前端构建；没有 `.env`、数据库内容或真实订阅令牌。

**Windows PowerShell：上传本次更新包。**

```powershell
Set-Location 'C:\Users\Administrator\Documents\mooncci site'
scp '.cache\mooncci-electricity-rss-20260905-v2.tar.gz' root@182.92.179.81:/root/
```

**服务器 SSH：** 先通过宝塔备份当前数据库，保留上一版代码和构建。配置上面的 Nginx 专用位置块，再解压并校验包：

```bash
mkdir -p /root/mooncci-electricity-rss-20260905-v2
tar -xzf /root/mooncci-electricity-rss-20260905-v2.tar.gz -C /root/mooncci-electricity-rss-20260905-v2
bash /root/mooncci-electricity-rss-20260905-v2/deploy-electricity-rss.sh --preview
```

预览应只显示新增电量报告迁移待执行。确认没有迁移校验错误后，在**服务器 SSH**执行：

```bash
bash /root/mooncci-electricity-rss-20260905-v2/deploy-electricity-rss.sh
```

脚本备份本次覆盖的源码和当前 `index.html`，复制新迁移，执行迁移后安装代码，重启 `mooncci-api` 与 `mooncci-worker`，健康检查成功后同步前端。不会覆盖 `.env`、旧迁移或删除旧前端 assets。Nginx 配置需通过宝塔保存校验，或使用服务器实际安装位置的 `nginx -t` 后 reload；脚本不猜测 Nginx 安装路径。

回滚时恢复脚本打印的备份中的源码和 `index.html`，重启两个 PM2 进程；新增表和可空字段可保留，不删除报告或订阅数据。

源码方式本地启动仍为项目根目录 `npm run dev`，后端 `npm run dev --prefix server`。生产 API/worker 仍由原 PM2 配置启动，不在多个 Web 进程中启动定时器。

## 验证记录

- 普通后端测试包含报告字段/未知数据、时区、XML 转义、scope 加密以及持久化报告邮件模板检查。
- 独立本机 MySQL `mooncci_electricity_rss_qa` 集成测试通过：真实迁移和唯一索引、并发重复写、早晚不同 ID、重试不再采集、SMTP 失败后 RSS 可读、关闭邮件仍保存报告、午间/测试邮件排除、采集异常记录、登录/权限/CSRF、无效令牌、重置失效、切换宿舍、停用/降权、空列表及 60 条读取上限不删除历史。
- Chrome `DOMParser` 与 Python `xml.etree.ElementTree` 解析通过；正文 HTML、中文和特殊字符通过。
- 本机 Chrome：1440、768、390、320px，浅色/深色无横向溢出；创建、复制、复制失败手动选择、重置说明/取消/确认、读取失败重试与非站长入口隐藏均通过。UI 状态验证使用模拟接口，权限与持久化使用真实本机数据库测试。
- 原博客 `/api/feed.xml` 检查通过，不包含电量报告；原邮件模板测试和前端构建/TypeScript 检查通过。
- 未连接生产电量上游，未发送真实邮件，未部署生产；没有在 iOS 阅读器中实测。

重跑集成测试必须显式设置 `ELECTRICITY_RSS_INTEGRATION=true`，并使用专用本机数据库 `mooncci_electricity_rss_qa`；测试会清理该专用库中的测试表数据，禁止指向生产数据库。


打包修复：v2 将部署脚本和清单固定为 LF 换行；脚本也兼容读取 CRLF 清单。业务代码、前端构建和 SQL 迁移内容不变。
