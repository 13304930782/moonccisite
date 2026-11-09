# 服务令牌

先备份数据库，在隔离环境验证迁移；部署时按现有迁移流程执行：

```bash
cd /www/wwwroot/mooncci-source/server
node scripts/migrate.js --dry-run
node scripts/migrate.js
```

使用已登录的 owner 会话调用 `POST /api/admin/service-tokens`，请求 JSON：

```json
{"name":"grok-bot","scopes":["comments:read","comments:moderate","publishing:read","runtime:read"]}
```

使用现有网站会话时，写请求需带 `X-Requested-With: XMLHttpRequest`。响应 `token` 只返回一次，放入 bot 的秘密存储，不要写入仓库、日志或 URL。令牌清单为 `GET /api/admin/service-tokens`，吊销为 `POST /api/admin/service-tokens/:id/revoke`，均仅 owner 可用。

bot 每次请求带 `X-Service-Token` 头：

- `GET /api/admin/comments?status=pending`：待读评论。
- `PUT /api/admin/comments/:id`，JSON 为 `{"status":"visible"}` 或 `{"status":"rejected"}`：审核待审评论。
- `GET /api/publishing/queue?state=submitted`：投稿队列；未启用投稿工作流时返回 404。
- `GET /api/admin/runtime`：运行状态。

每项操作需要对应 scope。服务令牌只允许读取待审评论；审核写入与审计记录在同一事务中完成。业务通知沿用原有评论审核逻辑。数据库只保存令牌哈希；令牌泄露后应立即吊销并重新创建。
