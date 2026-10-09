# 审计修复部署包

本包用于目前已有的宝塔站点：源码 `/www/wwwroot/mooncci-source`，前端 `/www/wwwroot/mooncci.site`，Node `/opt/mooncci-node-v24.20.0/bin/node`，PM2 用户 `mooncci`、进程 `mooncci-api` / `mooncci-worker`。脚本先检查这些条件，不符合时不会尝试猜测其他站点目录。

上传 `mooncci-audit-20260909.tar.gz` 到 `/www/backup/`，在宝塔 **root 终端**执行：

```bash
mkdir -p /www/backup/mooncci-audit-20260909
tar -xzf /www/backup/mooncci-audit-20260909.tar.gz -C /www/backup/mooncci-audit-20260909
cd /www/backup/mooncci-audit-20260909
bash deploy-audit.sh
```

脚本会校验全部文件 SHA-256、安装 Linux 后端依赖，再备份源代码、前端入口和 `.env`；停止 API/worker 后完整备份 MySQL，执行增量迁移，发布新后端与 dist，重启并检查健康、匿名权限和退出接口。此过程会有短暂 API 维护时间。不会修改 Nginx，不会覆盖 `.env`、上传目录或现有 PM2 ecosystem 配置，不会删除旧 hash 静态资源。

需要可用的 `mysqldump`、`rsync`、Node 24+ 和 npm 网络。数据库账号需有备份 routines/events 的权限；缺少权限会停止升级并保留备份，不能把空/失败导出当作备份。新 API 要求非示例且至少 32 字符的 JWT_SECRET，缺少时脚本在停站前退出。

迁移必须包含 `202609090002_auth_revocation.sql`。**不要使用旧的 logout 单功能包或只替换 dist**。不要向已有库导入完整 `schema.sql`。迁移校验和不匹配或重复列时不要手改 `schema_migrations` 绕过检查，应先核对实际数据库结构与此前部署记录。

失败时 API/worker 会保持停止，避免混合版本暴露数据。终端会打印备份目录；保留错误日志再处理，不能直接盲目重启旧版本。`node_modules.previous`、数据库导出、原 `.env` 和源码备份均在该 root-only 目录。自动回退到旧认证代码会失去 JWT 撤销保护，因此脚本不会自动执行这种回退。

完成后在正式 HTTPS 网站验证：登录后刷新、退出后刷新、另一标签页同步退出、密码重置后旧登录失效、普通编辑不能改共享媒体、匿名不能读取草稿评论。宝塔/CDN 必须保留 `/api` 的 Cookie 和 private/no-store 响应头。

包的制作和验证：先 `npm run build`，再 `python scripts/build-audit-package.py`。包内有 `RELEASE.json`（源码提交）、`SOURCE-FILES.txt`、`SHA256SUMS`。SQL 与源码保持工作区原始字节，避免已执行迁移校验和变化；部署脚本和清单固定 LF。发布包不含数据库数据、真实密码、上传文件或 node_modules。
