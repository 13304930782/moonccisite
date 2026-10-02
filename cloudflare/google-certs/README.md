# Google 公开证书代理：线上源码快照

来源：用户于 2026-09-20 提供的 Google Worker 代码。仅还原聊天格式中的 Markdown 链接、代码围栏和转义；不改变行为，不代表已重新部署。

固定 GET /google-certs → https://www.googleapis.com/oauth2/v1/certs，公开证书，不含 Client Secret。保留上游 Cache-Control 或默认 300 秒。注意原实现没有显式上游超时、响应大小限制及证书结构校验；原行为允许查询串，并使用默认重定向策略。后续若移到独立服务器需单独设计资源限制和验证，不能把代码快照当作生产 Node 服务。

当前绑定域名 google-certs.mooncci.site；后端 GOOGLE_CERTS_URL 可覆盖。迁移尚未执行，不更改现有 Worker 和域名。
