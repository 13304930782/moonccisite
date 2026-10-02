# 国内直连回退与 DNS 分流评估

日期：2026-09-20。状态：回退步骤已准备，线上控制台操作尚未确认完成。不要按本文直接迁移 NS 或启用美国公开入口。

## 已有证据

用户在国内运行同机交替五轮 GET：Cloudflare 回国内中位 1.500 秒，带预览头回国内 1.526 秒，固定国内源站直连 0.141 秒；本轮均 200，前轮有一次超时。该样本表明经 Cloudflare 的路径明显较慢，不代表全国各网络统计，也不能单独归因于 Worker CPU。国内不明显退化的上线门槛未满足。

美国预览请求经诊断头确认 reader-response。公开请求、Cookie/Authorization 绕过、登录提供方及账号页面路由通过；这不等于真实登录及权限验收。JS/CSS 字节与国内相同，原 MIME 字符串严格比较误判已修复。未完成实际停机演练、登录回调验收和账号配额告警。

## 当前回退（不购买、不换 NS）

1. mooncci-read-router 设置 ROUTING_ENABLED=false 并部署，MODE 保持 preview。
2. 移除该 Worker 的 mooncci.site/* 路由。不要删除 Worker、密钥或登录代理路由。
3. 主域名 mooncci.site A 记录保留 182.92.179.81，仅将代理改成 DNS-only 灰云。核对是否另有 AAAA，不能留下指向非预期服务的记录。
4. origin-cn、reader-origin 保持原记录。保留美国 mooncci-reader、cuegroveapp.com、邮件、MySQL 及 PM2。
5. 国内 DNS 缓存更新后检查解析地址、首页、文章与实际登录。只关闭 Worker 逻辑仍经过 Cloudflare，且绑定 Route 仍消耗调用。
6. 禁用此前临时的“美国节点预览测试”BIC 跳过规则（精确核对名称和匹配条件），不更改其他安全规则。

## 后续可行性

目标仍为同域名、国内直连、海外美国阅读。DNS 只能选择主机，不能按 Cookie、URL 或 HTTP 方法分流。美国端因此必须新增独立的公开入口：匿名白名单读取到本地阅读服务，所有认证/私有路径、OAuth 和写操作反向代理固定国内源站。写请求禁止代理自动重试；保留原 Host、Cookie、Location 语义和 CSRF 校验；规范可信代理链，不信任客户端伪造的转发头。外部请求中的内部节点密钥必须移除，由内部代理按固定规则注入。现有 reader-origin 受密钥保护，不能简单把海外 DNS 指向它作为完成方案。

美国需另建 mooncci.site TLS 虚拟主机，保持 cuegroveapp.com/mail 不变。先用 curl --resolve 和隔离测试入口验收，不能直接上线修改 DNS。只读缓存、下架失效和草稿附件隔离仍是独立工作。DNS 地域判断受递归 DNS/ECS 与缓存影响，不是逐请求准确定位；免费线路不等于自动健康故障转移。

供应商候选：阿里云文档的免费基础线路列出境外，但需按当前控制台核实地域线路、TTL 和实际额度；不将“境外线路”与“海外 DNS 节点/加速”混为一谈。Cloudflare 地域 DNS 调度属于 Load Balancing 能力，不默认为已有免费 Workers 权益。

关键迁移依赖：当前 Google/GitHub 登录代理在 mooncci.site 下使用 Cloudflare。整站迁出权威 DNS 后，不能假定免费 Cloudflare 自定义域名仍保持激活；官方 Partial/CNAME setup 要求 Business 或 Enterprise。迁移前必须盘点代理类型、DNS、证书、OAuth 配置、MX/TXT/CAA、DNSSEC DS 等，准备保留或替换代理路径并完成登录验收。当前不变更 NS，不擅自停用 DNSSEC，不采购套餐。

先核实注册商与现有 DNS 全量清单，再选择 DNS 方案；若免费方案不能同时满足现有登录代理与同域名限制，则维持国内直连，明确成本/域名调整的选择后再实施。

## 官方参考

- https://help.aliyun.com/zh/dns/pubz-set-domain-name-subdomain-name-related-faq
- https://help.aliyun.com/zh/dns/pubz-intelligent-analysis
- https://developers.cloudflare.com/load-balancing/understand-basics/traffic-steering/steering-policies/geo-steering/
- https://developers.cloudflare.com/dns/zone-setups/partial-setup/

## 登录代理代码盘点（2026-09-20）

用户确认注册商为阿里云、权威 DNS 为 Cloudflare。用户回退后的解析为 182.92.179.81，首页 nginx HTTP 200；未直接核实控制台路由删除及实际登录。

- Google：server/src/lib/googleIdentity.js 的默认地址为 https://google-certs.mooncci.site/google-certs，允许 GOOGLE_CERTS_URL 覆盖；国内验证 id_token，检查证书的响应格式与有效期。仓库未找到该 Google Worker 的实际完整实现，迁移前获取线上代码和变量名称（不收集密钥值）。
- GitHub：cloudflare/github-oauth/worker.mjs 版本 3，只允许 POST /token、GET /user、GET /emails，固定 GitHub 官方上游，使用 X-Mooncci-Proxy-Key 保护。请求/响应限长、禁止自动重定向、不缓存不记录凭据，不重试授权码交换。国内配置 GITHUB_OAUTH_PROXY_URL 和 GITHUB_OAUTH_PROXY_KEY，密钥不应改变或暴露。
- OAuth 回调由 server/src/lib/socialConfig.js 根据 siteOrigin 构造 /api/auth/{provider}/callback。迁移服务器侧代理不需要改变浏览器回调域名；实际配置仍需用后台显示值核验。

建议按依赖顺序：补全 DNS 和 Google Worker 清单 → 美国新增隔离代理测试入口 → 从国内验证代理连通性及真实登录/绑定 → 切换代理并保留 CF 旧版本回退 → 核实阿里云境外线路和 DNSSEC 迁移 → 美国公开入口预览验收 → 最后切换 NS 和海外记录。不会因为具备一台美国主机就视为这些工作已完成。

美国代理方案会让登录依赖美国主机，需要资源隔离、超时/并发限制、日志脱敏和监控。保持美国现有小站和邮件不变；不开放数据库公网写入。不得直接复制当前私密阅读节点作为公开登录入口。

## DNS 导出补充审计（用户导出时间 2026-09-19 17:42:54 UTC）

Google Worker 源码已收到并还原为 cloudflare/google-certs/worker.mjs，之前的源码缺口已补全。未部署新版代理。

导出显示主域和两个源站 A 记录均灰云。另有以下迁移依赖：

| 记录 | 当前依赖 | 迁移前处理 |
|---|---|---|
| 根域 MX 三条 | Cloudflare Email Routing | 需核对转发规则、目的邮箱及其对活动 zone 的要求；DNS 文件不包含转发规则，不能照搬 MX 后假定继续可用 |
| openwrt CNAME | Cloudflare Tunnel（橙云） | 需核对 Tunnel 公共主机名、Access 策略和客户端用途；不能照搬 cfargotunnel.com CNAME 即认为迁移完成 |
| mail CNAME | Cloudflare Pages（橙云） | mail1-1vb.pages.dev；需确认自定义域绑定及新 DNS 下验证方式 |
| status CNAME | Better Stack | 保留 statuspage.betteruptime.com，检查自定义域验证/TLS |
| media A | 独立主机 104.245.13.12 | 保留，不覆盖成美国阅读服务器 |
| send MX | Amazon SES | 保留发信相关 MX/SPF/DKIM；TXT 原值不写入本报告 |
| TXT | 发信和域名验证 | 从原始导出逐条迁移，不在公开仓库复制验证值 |

Cloudflare Worker 自定义域绑定不一定显示为该导出中的普通 A/CNAME，DNS 导出不能替代 Workers 域绑定清单。DNSSEC 的注册商 DS 也不能仅依据该导出判断。

修正实施门槛：迁移登录代理只是其中一项，并不足以授权直接切换 NS。先核对 Email Routing、Tunnel、Pages 的使用与替代方案；默认全部保留。此阶段保留国内直连及现有 Cloudflare 权威 DNS，不采购套餐，不变更邮件、Tunnel 或登录服务。美国代理部署草案暂不作为上线方案交付，以免诱导提前切换 NS。

## 切换交付验收门槛

交付对象不是单独一组 NS 地址，而是：19 条业务 DNS 记录的经核对导入表（4 A、3 CNAME、4 MX、8 TXT），阿里云实际分配的 NS、DNSSEC 处理方案、独立美国公开入口与登录代理离线包、邮件和 Tunnel 已验证替代方案、上线/回退操作单。原始 TTL=1 为 CF 自动 TTL，不能机械导入为 1 秒。原 CF SOA/NS 不作为业务记录迁移。

本地 .cache/dns-migration-review/records-review.json 已建立私密记录清单，包含原 TXT，不提交到公开仓库，也不能直接导入生效。切换资格当前为 false。

上线门槛：测试域名先分别验证国内/海外路由与性能；美国固定源站读取、用户登录/收藏/评论/发布/删除一致性、Cookie/CSRF/回调；邮件实际收发/转发；Tunnel 原用途连通及 Access 策略；Pages 和状态页 TLS；模拟 DNS 缓存新旧并存时均可正常访问。NS 回滚受缓存/TTL 影响，不是即时恢复，必须保持新旧入口和依赖并行可用。任何付费替代方案先列具体费用再决定。

用户允许更换 DNS，限制是必须交付可行且已验证的迁移方案，不是禁止迁移。不得反复询问已经授权的 NS 迁移意向。

## 当前交付进度：独立地区 DNS 验证

ops/geo-dns-preview 提供独立子域 route-test.mooncci.site 的配置清单、只读检查器和回退步骤，三个本地测试通过。仅委派测试子域到阿里云，不切主域 NS，先验证默认/境外线路实际效果。实际阿里云分配的 NS 等待用户提供，不伪造。美国生产入口、登录代理替代、邮件与 Tunnel 迁移尚未交付/验收；本包不能代替生产迁移包。

## 最新状态（2026-09-20，覆盖上文过时进度描述）

- 主站仍为 Cloudflare 权威 DNS 下灰云直连国内；未执行正式 NS 切换。
- 阿里云独立测试子域已经生效，国内/美国线路均验证；权威 NS 为 ns1.alidns.com、ns2.alidns.com。这不能代替正式根域控制台分配值的核实。
- 美国 mooncci.site 正式域名入口已部署；独立浏览器定向登录、会话、私有页面、退出由用户确认正常。
- 用户确认美国与国内入口的收藏添加/取消可互相观察，已完成可撤销业务写入验证。
- 国内仅信任 107.174.123.42 转发真实 IP；美国覆盖客户端伪造转发头。线上独立 API 限流桶验收通过。
- 最终网关策略为页面/静态资源走读节点，所有动态 API 直接回固定国内地址，数据库唯一，不承诺静态发布自动同步。
- Google 国内隐藏/海外显示的界面需求已按用户要求暂缓，现有全站登录行为不改。
- 本地私密 baseline zone 草稿保留 19 条历史记录，补记已确认的 2 条测试区委派。该草稿明确 NOT READY，不作为可直接上线的当前全量导入文件。
- 仍需最新 CF 导出与 Email Routing、Tunnel、Pages 使用情况。Google/GitHub 代理、DNSSEC DS 及根域 NS 必须核实，不能靠复制 CNAME/MX 视为迁移服务完成。

用户服务决策：根域邮件转发用途暂不确定，保留并核对规则；openwrt 子域及隧道保留，计划以后使用；mail 子域用户授权删除，已从本地新区域草稿移除，线上尚未操作。历史完整导出保留用于回退。

最新用户决定：全部保留，撤销此前删除 mail 的指令。候选区域已恢复 mail 记录；线上 DNS、Pages、Worker 均未删除。邮件转发、邮件数据库、mail 页面/Worker、openwrt Tunnel 和登录代理均纳入迁移保留范围。

## 邮件切换与登录代理下一步（2026-09-20）

- 公共 DNS 查询根域 MX 为 mx.mooncci.site，优先级 10。用户确认真实外部邮件到达 mooncci 账户及 websiteaccount 全收账户。Dovecot 在新增账户后出现 SQLite schema changed，重启后指定邮件重投成功；不据此断言已永久解决所有数据库问题。
- 老 Cloudflare Worker、Pages 和邮件数据库保留；历史邮件没有导入新邮局。Resend DNS 保留，发送未重新验收。
- cuegroveapp.com 当前 NS 为 rory/meg.ns.cloudflare.com。候选方案是在原 Google/GitHub Worker 增加 google-certs.cuegroveapp.com / github-auth.cuegroveapp.com 自定义域，旧域同时保留。必须确认该区域继续使用 Cloudflare、绑定生效、国内连通和实际登录后才修改应用环境变量。尚未修改 Worker 或线上环境。
- OpenWrt 可评估在继续留在 Cloudflare 的区域新增公共主机名；迁移必须同时核对原 Access 策略和用途，不默认把管理界面公开。原 openwrt.mooncci.site 在根域迁出后不能只复制 Tunnel CNAME。
- 根域 NS 仍未切换。待更新全量 DNS 导出、根域新 NS、DNSSEC、Pages/Worker 依赖后再执行。


## 恢复网站部署前核对（2026-09-20，覆盖此前候选状态）

- 用户确认 cuegroveapp.com 继续使用 Cloudflare。Google/GitHub 新 Worker 域绑定已完成，国内代理连通及真实登录经用户确认，应用环境变量已切换。
- OpenWrt 在刷机后的 192.168.2.1 恢复连接，openwrt.cuegroveapp.com 的 Access 与 LuCI 访问由用户确认。
- webmail.cuegroveapp.com 的 Roundcube 已完成登录、历史邮件及收发验收。Certbot HTTP 验证自动续期的最终截图显示 dry-run 成功、timer active、证书部署及 HTTPS 检查通过；此结论只涵盖 webmail HTTPS，不涵盖 IMAP/SMTP 证书。
- 旧 Cloudflare 临时邮件数据继续保留；历史面板前端仍需确认替代域与后端连接，不能因 Roundcube 完成而视为该面板已迁移。
- 返回主站部署：国内/美国入口验收已完成，下一步更新 Cloudflare 全量 DNS 导出，核实根域阿里云分配 NS 与注册商 DS，再完成依赖核对与正式切换。
- 尚未执行主域 NS 切换；本地历史 DNS 草稿仍不可直接导入。
