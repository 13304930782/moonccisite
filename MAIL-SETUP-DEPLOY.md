# mooncci Mail：部署与验收

## 基线与范围

2026-10-01 重新查询的最新 PR 是 #61，已合并。其 head 为
`codex/media-byte-metadata-20261001` / `c7f6a42ddf9519f783d1ed4bd094479c48d26d26`；
本任务从包含该 head 的 main `906d308b17551e59ca8907886383f51fb6c33c32` 建立
`codex/mail-setup-20261001`。已读 PR 说明、实际 diff、review（含媒体路径的 CodeQL 评论）；不改媒体逻辑。

本功能配置已有邮箱，不创建或查询账号，不读取生产邮箱或数据库，不发送测试邮件。
未修改 MX：`mooncci.site → mx.mooncci.site → 107.174.123.42`。
IMAP/SMTP 始终为 `mail.cuegroveapp.com`；不是 `mail.mooncci.site`。
465 本机 TLS 测试成功、Gmail 添加失败的具体原因未确认，不能据此诊断服务器故障。
本次只推荐 993 / SSL/TLS 与 587 / 必须 STARTTLS，认证用户名为完整邮箱。

单一参数来源是 `server/src/config/mail-client.json`（公开参数，无密码）。页面直接导入；
后端生成 Apple profile；`node scripts/generate-mail-autoconfig.cjs` 生成静态 XML。
构建及测试检查 XML 未过期。不增加数据库、后端依赖或网站通知邮件设置。

## 客户端与官方依据

2026-10-01 核对下列官方文档；文档支持不等于具体客户端版本已实测：

- [Mozilla 格式](https://wiki.mozilla.org/Thunderbird:Autoconfiguration:ConfigFileFormat)：1.1、`password-cleartext` 为普通密码认证；SSL / STARTTLS 负责连接加密，不能设置为 plain。
- [Mozilla 自动发现](https://wiki.mozilla.org/Thunderbird:Autoconfiguration)：旧页面包含历史实现描述，本项目只交付指定的 HTTPS 入口，不推广成所有客户端兼容。
- [Apple Mail payload](https://support.apple.com/guide/deployment/mail-payload-settings-dep9c14bfc5/web) 与 [Apple 官方 schema](https://github.com/apple/device-management/blob/release/mdm/profiles/com.apple.mail.managed.yaml)：`com.apple.mail.managed`，端口为 integer，UseSSL 为 boolean，无密码字段。官方 schema 允许 iOS 4+、macOS 10.7+ 手动安装，但这些历史下限不是本次测试矩阵。
- Apple 使用 `OutgoingMailServerPortNumber=587` 与 `OutgoingMailServerUseSSL=true`；schema 没有单独的 RequireSTARTTLS 开关。期望通过 STARTTLS 建立 TLS，必须实机核对握手和拒绝降级，不能靠 plist 解析声称已证明强制升级。不要改成 UseSSL=false 或遇到失败改用不安全连接。
- [Gmail 官方添加账户说明](https://support.google.com/mail/answer/6078445)：iOS / Android 的入口和加密名称会随版本不同。保留手动 IMAP 设置；不保证读取 Mozilla XML。用户已实测所给参数可添加账户，此处未另行登录。
- Apple profile 仅用于系统“邮件”，不用于 Gmail App；未签名，必须用户确认安装并在系统中输入自己的密码。iPhone 实机安装待验收。
- 不实现 Exchange / Outlook Autodiscover，不伪造响应。

## 发布包与构建

在本地有 Node 24+、Python 3、npm 的环境执行（Windows 的 Python 可用 `python`）：

```bash
npm ci
npm --prefix server ci
npm run check
npm --prefix server test
node --test server/test/mailSetup.test.js
node scripts/test-mail-setup-browser.cjs
python3 ops/mail-setup/test_nginx.py
python3 scripts/test-offline-release.py
# 提交并推送本功能分支后，工作区必须干净：
python3 scripts/build-offline-release.py
python3 scripts/build-mail-setup-backend.py
```

原 JS 预算未修改；新页面触发约 8 KB 超限后，使用 Vite 6 支持的 Terser 5.51.2 构建压缩，
不加运行时依赖、不改浏览器支持目标、不启用 unsafe 压缩。
前端包沿用原脚本，含 `/mail-setup`、页脚入口、`dist/mail/config-v1.1.xml`，不包含后端、隐藏路径或凭据。
后端包是独立的四文件白名单，加校验器、清单、Nginx 模板和本文档；没有依赖安装或迁移。
只有需要 Apple 个性化下载时才部署后端包；未部署时页面保留手动指导，生成失败提示不会假装下载成功。

前端归档逐字节校验；两种包均提供 LF `SHA256SUMS` 和 `.sha256`。
现有前端部署器备份并恢复 index，但不会自动恢复未哈希 XML；因此部署前单独备份已有 `mail/config-v1.1.xml`，不存在也要记录，以便回滚。

Windows PowerShell 上传示例（填写真实 SSH 地址，不让生产服务器下载 GitHub 或构建）：

```powershell
$Target = 'root@YOUR_CONFIRMED_WEB_HOST'
$Frontend = Get-ChildItem .\.cache\mooncci-frontend-*.tar.gz | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$Backend = Get-ChildItem .\.cache\mooncci-mail-backend-*.tar.gz | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-FileHash -Algorithm SHA256 $Frontend.FullName
scp $Frontend.FullName ($Frontend.FullName + '.sha256') "${Target}:/www/backup/"
scp $Backend.FullName ($Backend.FullName + '.sha256') "${Target}:/www/backup/"
```

核对包内 REVISION / MANIFEST 与本任务提交，不按文件时间推断代码基线。

## 先核实现网目录与进程

当前仓库 runbook/前端脚本列出静态目录 `/www/wwwroot/mooncci.site`、后端
`/www/wwwroot/mooncci-source/server`；DEPLOY.md 的早期示例仍出现其他目录。
这些只是候选，**本次没有登录生产确认**。先在国内源站和海外网关分别查看：

```bash
nginx -T 2>&1 | less
# 使用现有 PM2 所属用户和 Node PATH；只查看 id、状态、入口和 cwd，避免打印环境变量/凭据：
su -s /bin/bash mooncci -c 'pm2 jlist' | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{for(const p of JSON.parse(s))console.log(p.pm_id,p.name,p.pm2_env.status,p.pm2_env.pm_exec_path,p.pm2_env.pm_cwd)})'
```

不要上传或公开完整 nginx -T、PM2 环境、server/.env；Nginx 可能包含网关鉴权头。
核对 HTTPS server_name/root、证书路径、静态/隐藏文件/SPA/API 规则、海外 upstream 的 TLS SNI 和 CA bundle。
后端下载票据存进程内存，最多 128 个、有效两分钟，30 秒清理；无需磁盘，重启会使旧链接失效。
需要单一 API 进程或粘性路由把 POST 与 GET 送到同一进程；多实例时不要靠随机负载均衡声称可靠。

## 分层部署（手动，不自动上线）

1. 在源站及所有网关/CDN/WAF先配置日志与缓存隐私，再开启个人化下载。
2. 在确认的目录解压、校验后端包，核对四文件基线；备份后仅替换白名单，重启已核对入口的 API，不重启 worker。
3. 按原离线流程部署前端包；单独备份旧 XML；不运行数据库脚本。
4. 合并 Nginx 精确片段并 `nginx -t`，成功才 reload。两域入口独立验收。

后端操作应写入独立脚本，用 `nohup bash SCRIPT > LOG 2>&1 < /dev/null &` 执行；不要把 `set -e` 或 `exit` 粘贴到交互 SSH。
以下是该脚本中的操作框架，变量必须先填为核实值；不直接运行未替换的模板：

```bash
set -Eeuo pipefail
# package_dir、server_root、backup_dir、api_id、pm2_user、node_bin 均填写已核实值。
# backup_dir 必须是本次新建的专用目录，禁止重复使用。
cd "$package_dir"
sha256sum --strict -c SHA256SUMS
node check-backend.cjs "$server_root"  # 任一线上文件不同立即停止，不能覆盖
mkdir -m 700 "$backup_dir"
# 记录新增文件原本是否存在，保存所有原文件，包括重复部署时的版本。
python3 - "$server_root" "$backup_dir" <<'PY'
import sys,json,tarfile
from pathlib import Path
root,backup=map(Path,sys.argv[1:]); names=json.loads(Path('BASELINE.json').read_text())
existing=[n for n in names if (root/n).exists()]
(backup/'existing.json').write_text(json.dumps(existing))
with tarfile.open(backup/'before.tar','w') as t:
 for n in existing:t.add(root/n,arcname=n,recursive=False)
PY
for file in src/index.js src/config/mail-client.json src/lib/mailClient.js src/routes/mailSetup.js; do
  install -d -m 755 "$(dirname "$server_root/$file")"
  install -o "$pm2_user" -g "$pm2_user" -m 644 "server/$file" "$server_root/$file"
  cmp "server/$file" "$server_root/$file"
done
node --check "$server_root/src/index.js"
node --check "$server_root/src/routes/mailSetup.js"
runuser -u "$pm2_user" -- env PATH="$node_bin:$PATH" pm2 restart "$api_id"
curl -fsS --max-time 10 http://127.0.0.1:3001/api/health
```

前端解压到独立目录校验后，按现有流程（确认 `MOONCCI_WEB_ROOT`）：

```bash
nohup env MOONCCI_WEB_ROOT='/CONFIRMED/STATIC/ROOT' bash /CONFIRMED/EXTRACTED/FRONTEND/deploy.sh > /www/backup/mail-frontend.log 2>&1 < /dev/null &
tail -n 60 /www/backup/mail-frontend.log
```

## Nginx 最小增量

- `ops/mail-setup/origin.conf.template`：放进**现有** HTTPS server；只新增两个精确 XML location 和专用 profile 前缀。`@WEB_ROOT@` 替换为实际静态目录。精确 location 优先于隐藏路径正则，其他隐藏文件保护保留。XML 缺失返回 404，不落 SPA。
- `gateway.conf.template`：海外网关合并相同精确路由。`@PRIMARY@` 用现有已核实的国内 upstream（可复用 keepalive pool），`@CA_BUNDLE@` 用现有 CA；验证源站证书、SNI mooncci.site；不走匿名 reader 或图片缓存。XML 请求移除查询参数和客户端请求头后转发，profile 原样转发 POST/GET 及 CSRF 请求头。
- 片段不设置 add_header，避免意外取消原 vhost 继承的安全头。检查实际安全头与原 API 代理的额外规则，按原值保留。profile 的 no-store 由应用返回，不允许网关隐藏或覆盖。
- 若全站使用 server 级别 `if`/rewrite 拒绝隐藏路径，location 无法覆盖先执行的 return：仅为**完整标准 XML 路径**加入例外，保留其他隐藏路径拒绝；不关闭全局保护。若已有同名 location，修改原精确 location，不能重复添加。
- 主站 HTTP 使用 `http-discovery.conf.template`，自动配置跳转移除 query。server 级 return 必须调整到既有兜底 location 才能让例外生效。保持其他 HTTP 路径原跳转。
- `autoconfig-vhost.conf.template` 仅用于新增子域，填自己的证书和实际 XML 所在目录。若选独立网关提供该子域，复用 gateway 的 XML 精确代理，不给它增加个人化下载接口。

所有相关精确请求关闭 access_log，并将可能含请求行的 error_log 限定到 `/dev/null`；也关闭 CDN/WAF/反代日志的 query/body 采集。
专用 `/api/mail-setup/` 必须绕过 CDN/共享缓存、关闭请求/响应磁盘缓冲，保留 no-store。
不能把邮箱或随机票据写进分析事件/APM；当前 PageAnalytics 的允许列表不含 /mail-setup，无须放宽。
TLS 层/CDN 层和 server rewrite 早期拒绝可能先于 location：分别核查日志采集策略，不以片段替代全链路核验。

Nginx 备份与回滚（在每台主机分别执行，填写核实路径）：

```bash
# 编辑前：把现有 vhost 与其 include 都复制到本次独立备份目录，权限 700/600。
cp -a /CONFIRMED/VHOST.conf /CONFIRMED/BACKUP/VHOST.conf
# 合并对应模板后：
nginx -t && nginx -s reload
# 检查失败不 reload；恢复原 vhost 及修改过的 includes，再测试：
cp -a /CONFIRMED/BACKUP/VHOST.conf /CONFIRMED/VHOST.conf
nginx -t && nginx -s reload
```

新增 vhost 回滚时移出 Nginx include 目录；不删除证书。前端恢复原备份 index 与 XML；
后端从 before.tar 恢复原文件，仅删除 existing.json 未列出的本次三个新增文件（固定白名单），再重启同一 API。
恢复前先核对当前四文件仍是本次版本，防止回滚覆盖后续他人更新。保留备份、日志与包的 SHA。

## DNS / HTTPS（需用户手动完成）

新增 `autoconfig.mooncci.site` 的 A/AAAA 或 CNAME，**默认线路作为基础记录**；不能因 Web 服务器在海外就只配“海外”线路。
指向实际提供 XML 的 Web 入口，不要求与邮件服务器同机。只发布实际可服务的 IPv6。
独立证书必须覆盖 autoconfig.mooncci.site，现有主站证书不一定覆盖它。
不改 MX、mx.mooncci.site、IMAP/SMTP 地址或 mail.mooncci.site。
记录、HTTPS 证书、虚拟主机全部正确并验证后才能宣称第二入口可用；本次未上线。

## 可重复验收

不要用真实账号填探测 URL；用 `probe@mooncci.site` 即可，不尝试登录。

```bash
curl --fail --silent --show-error --dump-header /tmp/mail-headers.txt 'https://mooncci.site/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=probe%40mooncci.site' -o /tmp/mail-config.xml
python3 -c 'import xml.etree.ElementTree as E; r=E.parse("/tmp/mail-config.xml").getroot(); assert r.tag=="clientConfig" and r.attrib["version"]=="1.1"'
curl --fail --silent --show-error --dump-header /tmp/autoconfig-headers.txt 'https://autoconfig.mooncci.site/mail/config-v1.1.xml?emailaddress=probe%40mooncci.site' -o /tmp/autoconfig.xml
cmp /tmp/mail-config.xml /tmp/autoconfig.xml
```

确认 200 + application/xml（不是博客 HTML / 登录页 / WAF 验证页），无 Cookie/登录/JS 要求；
分别不带 query 再请求，内容应相同。使用 `curl --resolve HOST:443:CONFIRMED_IP` 对国内源站和海外网关逐一验证，
保持 HOST/SNI 正确，不用 `-k` 跳过证书。核查 `.env`、`.git/config`、`server/.env` 等仍不可公开访问。
关闭 XML 文件的临时测试应在隔离环境执行，确认 404 不回退首页，不能破坏线上文件。

Thunderbird：记录版本与系统，创建干净测试配置/添加已有邮箱，检查自动发现结果的主机、端口、TLS 和完整用户名；
没有用户另行授权不要输入密码或发送邮件。DNS/HTTPS 验收与实际发现分别记录。
Apple：Safari 点击生成后再点击原生下载链接，检查 MIME、未签名状态、邮箱字段和唯一 Mail payload；
用户确认安装并自己输入密码。记录 iOS/macOS 版本，验收 993 TLS、587 STARTTLS，以及升级失败时不得明文认证。
没有这些实机证据不能宣布全面可用；Gmail、Outlook 保留手动设置。

本地测试记录与未完成项目见 `MAIL-SETUP-TESTS.md`。国内源站、海外网关、公网两个入口、真实客户端是四类不同证据，不能互相替代。
