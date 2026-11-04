# 双语发布与回滚（本轮未执行）

本轮仅本地实现及隔离测试，没有推送、部署、生产迁移、Nginx 重载或 PM2 重启。

## 发布前检查

- 核对生产现有版本、数据库备份、Node 版本与可信 `SITE_URL`；公开域名保持 `moooncci.cn`，目录仍可为 `mooncci.site`。
- 本功能含后端与增量数据库结构，不能使用仅前端发布包。离线包需包含审核后的后端代码、运行依赖、SSR runtime、前端 assets/index 和独立迁移命令；本地构建、校验 SHA256 和 LF，不在生产拉 GitHub 或安装前端依赖。
- 检查真实生效的 Nginx server/include。仓库 `scripts/nginx-blog-seo.conf` 包含 `/en` 及 `/en/...` SSR 入口；保留 `/api`、上传、OAuth、私有路由和现有认证规则。
- 检查 `/opt/mooncci-sitemap/refresh-sitemap.py` 与 systemd timer 实际部署版本；仓库 `scripts/refresh-sitemap.py` 验证公开中英文路径，仍从本机 `/sitemap.xml` 原子生成 `sitemap-pages.xml`。部署其新版本后再更新 IndexNow 脚本，否则旧校验器可能拒绝新英文地址。
- reader/Worker 仍只接收无 Cookie/Authorization 的白名单读取。共享缓存只保留原有中文首页；英文响应不复用这个缓存。语言偏好不使用 Cookie。
- 项目、近况、专栏译文必须单独发布；草稿保存不改变公开快照。原记录 ID、URL、可见性、关联数据不复制。

本次增量迁移包含 `202611040001_article_translations.sql`、`202611040002_content_translations.sql` 和 `202611040003_translation_draft_source.sql`（实际文件名以迁移目录为准）；使用 `server/scripts/migrate-bilingual.js` 的幂等检查，第三项保留英文草稿校对依据，普通保存/发布不会自动确认原文变化。

## 建议顺序（须后续单独授权）

1. 备份数据库及当前后端、SSR、前端、Nginx/reader 配置，保存校验清单。
2. 在维护窗口运行已验证的增量迁移；禁止执行 schema.sql 重建。确认新旧数据保留，重复运行安全。
3. 部署配套后端与 SSR runtime，按既有 PM2 用户重启对应应用；执行中文原有路径、英文已发布/未发布、越权草稿校验。
4. 部署匹配的前端静态资源，保留上一版 hashed assets 和 index。
5. 审查并应用 Nginx 的英文 SSR 路径；先 nginx -t 再 reload。
6. 若海外 reader 仍停用，只准备其包与配置，不擅自开启；启用前同步 reader 和 Worker 白名单并测试同源、同语言、最多两次文章规范化跳转，以及外部 Location/私有响应拒绝。
7. 更新静态 sitemap 刷新器与 IndexNow 校验器，先执行不发送的校验。确认只含真实发布译文、真实 lastmod，不含后台、草稿、缺译地址。沿用既有队列，不额外给历史文章发新文章通知。
8. 验证直接访问两种语言 HTML（关闭 JS）、canonical/hreflang/html lang、404/noindex、匿名缓存隔离及浏览器 Back/Forward。

## 回滚

- 优先回滚前端/SSR，并保留已经迁移的双语后端与数据；同步恢复兼容的 Nginx/reader 与静态 sitemap 配置。需要回滚后端时必须先满足下述写作隔离条件，只重启本次实际更改的服务。
- **保留新增翻译表、locale 列及全部译文数据，不执行 DROP/TRUNCATE 或逆向清空。** 再次上线后可继续编辑。旧后端未按 locale 过滤草稿和修订，不能直接恢复写作权限：回滚时必须使用保留中文草稿/修订过滤的兼容后端，或暂时关闭所有编辑、发布、审核与定时发布入口，直到重新部署双语后端。避免把英文草稿作为中文正文发布。草稿与修订的唯一索引已包含 locale，存在双语行后不能直接恢复旧唯一索引；不要执行逆向索引迁移或删除英文行来强行回退。
- 如果回滚版本不再支持英文地址，应在 Nginx 明确返回 404 并附加 noindex，避免旧 SPA fallback 返回 200；不能把英文 URL 301 到中文伪装为已翻译；sitemap 不再输出不可用英文版本，既有 IndexNow 队列据真实状态处理撤下。
- `.env`、uploads、历史 SQL、已有文章 ID、评论、收藏和原始发布时间均不覆盖。

## 尚需部署前实测

本文描述仓库实现与操作顺序，不代表已检查当前线上 Nginx include、systemd 定时器、海外路由开关或生产数据库。以上必须在单独发布授权后核验。
