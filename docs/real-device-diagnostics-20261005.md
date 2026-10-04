# iPhone Safari 实际访问诊断：2026-10-05

来源为用户主动导出的诊断报告（build a0ab85a，私密转送设置由用户选择为开启），以及按 request ID 匹配的生产 `site_diagnostic` 日志。时间范围约为北京时间 02:16–02:18。没有采集邮件正文、密码或 Cookie。

## 已确认的事实

- 53 条实际 API 请求均为 200、US_PROXY。生产 Node 完整处理 p50 2.0 ms，nearest-rank p95 6.7 ms，最大 25.2 ms。
- 手机 API 通常为 350–885 ms；一次 auth/me 为 1074 ms。其余等待不能直接等同于纯网络 RTT，仍包含浏览器排队、私密转送、代理与跨境回源。
- 首页 `/now`、动态、文章、作品并行发起；当 `/now` 无内容时，再串行请求最新近况。首轮最后一个组件 content-ready 距 route 928 ms。
- 两篇文章 API 分别为 390/425 ms，Node 响应头报告 6.5/4.9 ms；内容组件就绪距 route 为 470/492 ms。API 完成至组件就绪约 79/66 ms。
- 这份记录没有 `/api/mailboxes/*`，不能据此评价 IMAP、SMTP 或发信性能。
- 美国本机（127.0.0.1:443，SNI mooncci.site，正常证书验证）ALPN 只协商 http/1.1；curl --http2 也回落到 HTTP/1.1。实际加载的 mooncci.site TLS server 缺少 `http2 on;`。
- 电脑上的直接 IP 探测返回 CN_DIRECT，不能作为美国入口的证据。采用美国服务器本机测试纠正了此前判断。

## 数据局限与修正

- 小资源约按 0.4/0.7/1.1 秒分组完成，符合 HTTP/1.1 并发排队表现，但无法仅凭原报告计算准确排队占比。启用 HTTP/2 后仍需真实设备对照，不能把服务端协议验收当作体验验收。
- 旧 `route` 在路由组件提交后记录，未包含 lazy chunk 等待；新增 `navigation-intent` 在同源页面链接点击时记录。浏览器后退、手输地址不伪造为链接点击。
- Safari 一些条目的 responseStart 为零而 responseEnd 非零，旧计算产生了 duration=0、download=6551ms 等自相矛盾的行。这些条目不参与下载耗时判断；新版本将缺失阶段表示为 null。
- connect_ms 包含 TLS，不应与 tls_ms 相加；ttfb_ms 从资源开始计时，包含排队与连接，不是服务器处理时长。新增 request_wait_ms 从 requestStart 计算。
- content-ready 是组件级事件，不能以首个事件宣布整页完成。

## 可回滚修正

1. 独立前端版本修正诊断计时；只在用户主动开启时采集，不改变业务请求或自动上传数据。
2. `ops/mail-performance/us-http2.py` 仅增加美国网站 TLS server 的 `http2 on;`，原 upstream、TLS、权限、邮件服务不变。校验预览 SHA，备份原文件，nginx -t，通过后 graceful reload。h2 和 h1 GET 健康验证失败则自动恢复；回滚有配置漂移保护。
3. 不宣称此次修正消除所有延迟：美国入口到北京仍然需要回源。下一份实际设备报告应先核对协议、点击至内容就绪，以及 API/Node 差额。
