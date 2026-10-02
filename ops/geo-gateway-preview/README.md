# 美国正式域名入口：定向验收包

只允许在 mail.cuegroveapp.com 上替换 /www/server/panel/vhost/nginx/mooncci.site.conf。
要求用户已在美国宝塔创建独立 mooncci.site 站点并安装有效证书。
固定复用 127.0.0.1:3102 读节点与 /etc/mooncci-reader.env 的本机密钥。
主回源固定 https://182.92.179.81，TLS SNI 与 Host 为 mooncci.site，系统 CA 校验开启。
不改 DNS、数据库、PM2、已有 reader 服务、其他站点、证书或 .env。

匿名 GET/HEAD 公开页面与静态资源经过读节点。全部动态 API、Cookie、Authorization、Range、未知路径及写入直接回国内，并覆盖客户端伪造的转发头。
保留 Origin、Referer、Cookie、Authorization、请求体、Set-Cookie 和原站重定向。
不自动重试主回源请求。公开读取失败可回源；缺失静态资源回源，文章 404 保持 404。
清除客户端伪造的内部密钥与转发头。响应暂用 private,no-store 便于验收。

安装前验证原站 TLS 与公开 API；备份原配置；nginx -t、reload 和固定地址 HTTPS 验收。
自动验收只读取数据及提交必定因缺少身份或来源校验而被拒绝的空写请求，不创建账号、评论或文章。
验证 Cookie/Authorization 路由、未登录拒绝、来源校验、首页、文章 JSON 与入口静态文件字节一致。
失败自动恢复配置；成功日志包含可直接执行的回滚命令。

## 仍须人工验收
用 scripts/Open-USGatewayPreview.ps1 启动独立 Edge/Chrome 配置目录，仅此浏览器将 mooncci.site 指向美国。
不修改系统 hosts、公共 DNS 或原浏览器资料。浏览器仍验证正式证书。
检查首页/文章/图片，再实际登录、刷新会话、查看自己的电量等私有页面、退出登录。
用户选择一次可撤销的业务写入验证；自动脚本不会代为创建生产内容。

这是定向验收，不等于全量上线。未验证真实 OAuth、业务写入、海外终端完整加载速度。
先部署 install-cn-ip.py：只在国内主站 server 块信任美国固定 IP 107.174.123.42，转发给应用的 X-Forwarded-For 覆盖为验证后的 remote_addr。
美国安装器前后验证可信代理 IP 及两个测试 IP 的独立 API 限流计数，不改 PM2 或数据库。
诊断路径 /_mooncci_gateway_ip_check 仅允许真实 TCP 来源为美国节点或本机回环；其他来源返回 404。
动态数据只来自国内同一数据库；静态文件来自既有 reader 发布目录，缺失时回源。
新版本仍应同步离线静态资源，不能承诺美国目录自动更新。

## 验证依据
本地真实 Nginx + 模拟 TLS 原站测试凭证/请求体、单次写入、跳转、Cookie、故障回退和静态资源回退。
另有安装事务成功、健康失败恢复、语法失败恢复、并发修改拒绝和站点范围测试。
https://nginx.org/en/docs/http/ngx_http_core_module.html#error_page
https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_verify
