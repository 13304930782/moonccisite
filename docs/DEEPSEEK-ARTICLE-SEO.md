# DeepSeek 文章简介与已确认 SEO 修复

站长入口：`/admin/ai-settings`。填写 DeepSeek API Key，启用自动总结并保存。默认模型为 `deepseek-flash`，也支持 `deepseek-v4-pro`；使用非思考模式和 JSON 输出。接入依据为 [DeepSeek Chat Completions 文档](https://api-docs.deepseek.com/api/create-chat-completion/)。

## 发布行为

- 新文章简介留空时，启用 AI 后将在预览、提交审核或直接发布前生成。普通保存和自动保存草稿不会调用模型。
- 已填写的简介保留。手动编辑简介会切换为手写；勾选自动总结或点击生成按钮可重新启用。
- AI 根据标题、分类、标签及完整正文（保留代码）总结，目标 80–140 字，服务端检查 25–160 字。正文超过 6 万字或少于 25 字时使用手写简介；不通过虚构内容填充短文章。
- 生成结果用 HMAC 与标题、正文、分类、标签和摘要绑定。相关内容变化后，发布前重新生成。生成过程中修改稿件会丢弃旧响应。
- 手写简介无需模型调用。模型失败会提示密钥、余额、请求限制或连接问题；不静默采用旧 AI 简介。作者可重试或明确切换手写。
- 审核快照包含已生成简介及签名。定时发布复用该快照，不在后台定时任务中重新生成另一份描述。
- 相同用户、同一正文的并发请求合并，每用户每分钟最多三次；不自动重试付费调用。

## 密钥与权限

密钥仅站长可配置，AES-256-GCM 加密后存入既有 `site_settings`。后台只返回是否已配置，不返回原值。可用 `ARTICLE_AI_SECRET_KEY`（64 位十六进制）作为独立加密密钥；未设置时从至少 32 字符的 `JWT_SECRET` 派生独立用途密钥。轮换加密密钥或 JWT 密钥后，请重新填写 DeepSeek 密钥并重新生成旧 AI 草稿的简介。备份数据库时同时保管对应服务端加密密钥。

用户点击生成、预览或提交时，服务端将稿件的标题、分类、标签、正文发给 DeepSeek，产生 API 费用。账号身份、作者邮箱和站点登录凭证不加入模型请求。不要将密钥写到 `VITE_*` 或前端代码中。

## 第 16 篇文章修复证据

2026-10-13 已根据实际公开正文修复 `https://mooncci.site/article/16` 的简介：原简介是旧站更新提醒，去掉提醒与代码后，页面描述仅 15 字；修复后为 103 字，描述数组声明、循环输入、比较交换和冒泡排序示例。正文 SHA256 为 `c23b7c991e9f6663c5d79664bda6ae4bd2211789a9a7d0370fb2c2138c95ac9f`，保持不变。文章版本由 2 更新为 3，原修订已保存。

公开 HTML 返回 200、103 字描述及对应 canonical。Bing Live URL 14:17 显示可索引，原描述过短错误消失，只剩图片 alt 提示。索引中的历史“Discovered but not crawled”需等 Bing 后续处理，实时成功不等于已收录。

首页未收录仍待 Bing 官方专项工单处理；该摘要功能不改变抓取速度，也不以历史 Limited crawl capacity 告警代替当前故障证据。

## 验证与部署

运行：前端 `npm ci && npm run check`；后端 `npm ci --prefix server`、`node --test server/test/articleSummary.test.js`。本地临时 MySQL 的完整集成验证设置 `SUMMARY_INTEGRATION=true` 后运行 `server/test/articleSummary.integration.test.js`，只使用测试密钥和模拟模型，不产生真实费用。

本次范围限定包包含前端、SSR runtime 和十个后端 JS 文件，无依赖变更，无数据库迁移，不替换 `.env`、上传文件、历史 SQL 或其他后端模块。部署前对线上文件校验基线；发生不同于已审核版本的改动即停止。只重启 API 与使用发布逻辑的 worker。

后端、前端与快照必须一起部署。执行 `scripts/build-article-summary-release.py` 构建已验证离线包，详见生成的 `.cache/summary-release.json`。服务器只解包、校验、复制和重启，不下载 GitHub、不安装前端依赖、不在服务器编译。

在 Windows PowerShell 上传（路径及归档名称以构建结果为准）：

```powershell
$release = Get-Content .cache/summary-release.json -Raw | ConvertFrom-Json
scp -i C:/Users/Administrator/.ssh/id_ed25519_mooncci_codex $release.archive ($release.archive + '.sha256') root@182.92.179.81:/tmp/
```

SSH 中运行以下命令，将版本目录替换为清单中的归档名。部署脚本始终在子 shell 内运行：

```bash
cd /tmp
sha256sum -c mooncci-article-summary.tar.gz.sha256
mkdir -p /www/backup/mooncci-article-summary-release
tar -xzf mooncci-article-summary.tar.gz -C /www/backup/mooncci-article-summary-release
nohup bash /www/backup/mooncci-article-summary-release/deploy.sh > /tmp/mooncci-article-summary.log 2>&1 < /dev/null &
tail -n 30 /tmp/mooncci-article-summary.log
```

备份目录在日志中输出。部署失败时自动恢复对应后端、SSR runtime 和旧入口，保留用户数据库、密钥配置与上传文件；人工回退使用备份目录中的 `rollback.sh`。

真实 DeepSeek 联通与摘要质量验收需要站长在后台输入有效密钥后，用一篇实际稿件生成并预览。测试响应不能替代这一步。

读取节点资源：运行 `scripts/build-summary-reader-assets.py`，把生成的前端包及校验文件上传至 `root@107.174.123.42:/tmp/`，校验、解包后同样在 `nohup bash deploy.sh` 子 shell 中执行。该包只同步 `/opt/mooncci-reader/current/dist`，保留旧资源，不改读取节点配置，不重启服务。
