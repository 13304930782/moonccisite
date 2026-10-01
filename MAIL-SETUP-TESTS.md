# mooncci Mail 验证记录

2026-10-01，本地隔离环境；Node 24.19.0、Python 3.12、Nginx 1.24.0、Chromium 153（Playwright 1.58.2 驱动）。

| 检查 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 17/17 通过（含静态 Autoconfig XML 解析与生成一致性） |
| `npm --prefix server test` | 184 通过、33 跳过、0 失败。跳过均为需要其他集成环境的既有测试；本功能 4 项后端测试未跳过 |
| `node --test server/test/mailSetup.test.js test/mail-autoconfig.test.cjs` | 5/5 通过；真实 plist 解析、正确类型/UUID/邮箱/转义、无密码、无多余 payload、错误域/控制字符/超长/XML 注入、TTL、容量、重试、缓存与真实应用 CSRF |
| `npm run build` / `npm run check:bundle` | 通过；总 JS 2,170,138 bytes，原上限 2,210,000；最大块 400,392；首屏 JS 287,975；未提高预算 |
| `node scripts/test-mail-setup-browser.cjs` | 构建产物 Chromium 8/8 组合通过：320/390/768/1440 × 浅色/深色；长地址无横向溢出、用户名和参数复制、拒绝剪贴板时选中文本、非法域提示、下载失败/重试、修改输入撤销旧下载链接、无邮箱 URL/存储/分析泄漏 |
| `python3 ops/mail-setup/test_nginx.py` | 真实 Nginx 本地 TLS 源站、TLS 网关、独立 autoconfig vhost；两个路径带/不带 query 返回相同 XML、MIME 正确、缺文件 404 不落 SPA、隐藏路径拒绝、原安全头保留；应用实际 POST→GET profile 经两层代理解析正确、no-store、测试邮箱/票据未写入普通日志、无请求/响应临时磁盘文件 |
| `python3 scripts/test-offline-release.py` | 6/6 通过，含隐藏文件拒绝、LF 校验、包字节、部署及回滚 |
| `npm audit --audit-level=moderate` | 门槛通过；报告现有 DOMPurify 1 个 low，不为本功能顺手升级无关依赖 |
| 离线前端和独立后端打包 | 交付时在干净提交上运行，逐字节验证归档、LF manifest/checksum、四文件后端白名单。实际 revision / SHA 见包清单与旁侧 `.sha256` |

浏览器测试使用模拟站点 API 与下载准备响应；真实下载生成另由后端与 Nginx 链路测试覆盖。
已查看 320 浅色与 1440 深色截图；中文字体补齐后重新跑全部八组。截图仅使用测试邮箱。
Nginx 测试只绑定 127.0.0.1，临时证书由测试 CA 信任，不跳过 TLS 验证，无生产访问或邮箱认证。

## 初次失败与修正

- 新页面最初导致总 JS 2,218,180 超过 2,210,000。采用 Vite 6 官方支持的 Terser 构建压缩后通过，保留原预算、所有业务代码与测试。
- Playwright 官方下载地址在本环境返回 HTML 而非浏览器 ZIP，安装失败；改用临时安装的 Chromium 153 二进制测试，不写入项目依赖。自动化 WebKit 未安装成功，未声称通过。
- 系统包安装遇到容器权限/UID 映射限制；Nginx 与字体改为在临时目录解包运行。测试配置中的临时目录和本地运行用户不进入生产模板。
- 首次浏览器夹具对第三方 iframe 写 localStorage 抛错；限制测试注入仅在顶层页面执行，保留页面错误断言，重跑八组通过。

## 明确未做 / 待用户验收

- 国内生产源站：目录、实际 Nginx include、HTTPS / 安全头 / 缓存 / 日志策略及公网返回待验收。
- 海外生产网关：实际 upstream、SNI、CA、CDN/WAF 日志隐私和分流待验收；不能用本地拓扑测试替代。
- 两个公网 HTTPS 入口：未上线；autoconfig 子域 DNS、证书、vhost 都待配置与验证。
- Thunderbird 实际版本的自动发现、Gmail iOS/Android、Apple iPhone/macOS 原生安装未在本环境运行。
- Apple 587 STARTTLS、TLS 升级失败时拒绝明文认证：官方 payload 没有独立 RequireSTARTTLS 键，必须实机/隔离协议观察验收，plist 解析和 HTTP 下载通过不证明此项。
- 未发送测试邮件、未读取生产邮箱/数据库、未修改 DNS/证书/Nginx/邮件服务器、未自动合并或上线。

## 实际修改文件清单

```text
.github/workflows/ci.yml
DEPLOY.md
MAIL-SETUP-DEPLOY.md
MAIL-SETUP-TESTS.md
ops/mail-setup/autoconfig-vhost.conf.template
ops/mail-setup/gateway.conf.template
ops/mail-setup/http-discovery.conf.template
ops/mail-setup/origin.conf.template
ops/mail-setup/test_nginx.py
package-lock.json
package.json
public/mail/config-v1.1.xml
scripts/build-mail-setup-backend.py
scripts/check-mail-setup-backend.cjs
scripts/generate-mail-autoconfig.cjs
scripts/test-mail-setup-browser.cjs
server/src/config/mail-client.json
server/src/index.js
server/src/lib/mailClient.js
server/src/routes/mailSetup.js
server/test/mailSetup.test.js
src/app/App.tsx
src/app/components/SiteFooter.tsx
src/app/pages/MailSetupPage.tsx
src/styles/mail-setup.css
test/mail-autoconfig.test.cjs
vite.config.ts
```

## 2026-10-02 审阅与修复

PR #62 原始提交 81a3dd83b378 的线上部署由交接记录提供，不重复安装四文件功能包。当前公开 /mail-setup 返回 200；主站 .well-known 与 autoconfig 子域 XML 均 200 application/xml、793 bytes，内容哈希相同；子域 HTTP 跳转去掉 query。本次未独立强制源站/网关路径，不将正常 DNS 验证混为两条线路验证。

新增回归：不支持方法以及 GET/HEAD 请求正文在全局 JSON 解析前拒绝，捕获 console.error 确认无邮箱输出；每来源最多四个 120 秒有效凭证，使用既有可信代理 req.ip，IPv6 按子网分组；第五次 429、Retry-After、其他来源可生成、已有链接可重试、过期恢复。配额记录依附全局有界凭证池，无额外无限 IP 表。共享 NAT 用户可能共享四个名额；多实例部署仍不支持。

本次本机专项 7/7；后端 186 通过、33 个既有集成测试跳过、0 失败。使用现有本机 server/node_modules；干净 Linux 依赖安装与完整构建以新提交 CI 为准。本次未重新运行浏览器或 Nginx 拓扑测试。未发送真实邮件、未访问生产邮箱。

用户交接记录：iPhone 安装和收件成功，发件为用户报告成功；不代表 Apple STARTTLS 失败拒绝认证已验证。Thunderbird 自动发现、生产完整日志及隐藏路径回归仍待验收。此前的“未上线”段落仅描述最初开发时状态。

证书：2026-10-02 用户确认未更换私钥并选择暂时保留，不能记为轮换完成。Apple 失败场景用户同意配合隔离测试，结果尚待记录。
