# 免费分流：内部验证版，尚未上线

美国主机：107.174.123.42，Ubuntu + 宝塔，现有站点 cuegroveapp.com。已有 SSH 密钥无法登录；尚未检查版本、端口、站点配置或证书。

## 当前行为

ROUTING_ENABLED 默认 false；MODE 默认 preview；没有生产 Route。preview 只处理海外地区且有预览密钥的匿名公开 GET/HEAD。MODE=live 才处理全部符合条件的海外读取。大陆、未知地区、Cookie、Authorization、Range、所有写请求及白名单外路径走国内原站。请求头不能指定转发目的地。

阅读节点需要独立随机密钥（Worker READER_KEY secret 与节点一致），PREVIEW_KEY 另外生成。节点直接请求没有密钥则拒绝；Worker 只转发白名单头。私人数据、草稿附件和 OAuth 不进入节点。

首版提供相同前端版本静态资源及无缓存公开回源。文章/HTML 现有 private/no-store 指令严格保留；尚未实现动态正文缓存、发布失效和公开媒体同步。美国故障、异常 Cookie 或重定向时仅公开读取回国内；真实文章 404 不掩盖；静态资源缺失回国内。

## 部署顺序

1. 运行 scripts/Probe-ReaderHost.ps1，确认系统、Node、3102 端口与宝塔站点；不要在聊天里发 SSH 密码。
2. 独立 mooncci-reader 用户及 /opt/mooncci-reader 目录；Node 24+ 使用独立 /opt/mooncci-reader-node/bin/node，不升级旧站正在使用的运行时。离线包 SHA256SUMS 校验后解压到版本目录，current 指向它。不要覆盖未知目录。
3. /etc/mooncci-reader.env 使用 root:root 600。PRIMARY_ORIGIN 必须直达国内独立 HTTPS 源站域名（例如 origin-cn.mooncci.site），不能填 mooncci.site 或美国节点域名，避免循环。国内新域名使用同一 Nginx 公开读取路由及有效 TLS；不改主域 DNS。新源站域名尚未创建。
4. 安装专用 service，确保 3102 仅监听本机。宝塔新建 reader-origin.mooncci.site，仅该新站使用 nginx-location.conf。配置证书，nginx -t 后才 reload，前后检查 cuegroveapp.com；不修改原站配置。
5. 上传 Worker，设置 READER_ORIGIN、READER_KEY、PREVIEW_KEY；先 ROUTING_ENABLED=false。创建 mooncci.site/* Route，不覆盖更具体的登录代理路由，不给源站子域加 Worker。主域 DNS 保持国内，Route 超额设 Fail open。
6. 开启 preview，验收版本一致、国内/海外延迟、下架、404、OAuth 回调和写操作仅执行一次；前端版本与 FRONTEND_REVISION 一致，保留旧哈希资源。用户登录后整条请求回国内。
7. 回退设 ROUTING_ENABLED=false；接近额度时禁用/移除分流 Route 才能停止该 Route 消耗。仅关闭逻辑仍消耗调用。登录代理共享账号额度，超额后其可用性没有保障。

## 上线前仍需完成

账号整体（含登录代理）70%/90% 额度告警、动态缓存与发布失效、公开媒体同步、真实 Cloudflare 运行时与跨境性能验收。未完成前不要切 live。当前不是完整双服务器方案或灾备。

测试：node --test test/read-router.test.cjs；包含真实本地 Node HTTP 服务，不等于 Cloudflare 或跨境验证。

官方额度与 Fail open：https://developers.cloudflare.com/workers/platform/limits/
Route：https://developers.cloudflare.com/workers/configuration/routing/routes/
