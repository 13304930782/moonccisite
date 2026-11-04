# 双语实现与隔离验证记录

本报告记录已完成的工作区实现与隔离验证，不代表已推送或已上线；尚未验证的部署与实体设备项目单列说明。

## 基线与工作区

- 基线提交：`3078588`。
- 隔离目录：`C:/Users/Administrator/Documents/mooncci site/bilingual-worktree`。
- 工作分支：`codex/full-site-bilingual`。
- 保留原有工作区和已有修改。本轮不推送、合并、发布，不访问或迁移生产数据库，不覆盖生产配置。

## 实现范围与主要文件

| 范围 | 主要文件 | 行为 |
| --- | --- | --- |
| 全站界面文案 | `src/app/i18n/`、各页面和组件、`scripts/check-i18n.cjs` | 中文源词典与英文词典；插值检查、可见文本及属性扫描；语言偏好与业务内容分离 |
| 语言、历史与表单 | `LocaleContext.tsx`、`LocaleLink.tsx`、`RoutePosition.tsx`、`NavigationProtection.tsx` | 语言切换替换当前记录；历史遍历使用当前偏好；不阻止返回外站；同页语言变化保留编辑状态 |
| 文章双语 | `articleTranslations.js`、`articleDrafts.js`、`articlePublishing.js`、`AdminWritePage.tsx`、`useArticleDraft.ts` | 同一文章 ID；独立语言草稿、版本与修订；共享关联数据；英文发布快照独立于草稿 |
| 其他可编辑内容 | `contentTranslations.js`、`ContentTranslationEditor.tsx`、对应项目/近况/专栏/设置接口 | 原记录上的翻译草稿与发布快照；乐观并发；字段白名单；失败保留输入；禁止把部分译文标成完整英文 |
| 数据迁移 | `server/database/migrations/20261104000*_*.sql`、`server/scripts/migrate-bilingual.js` | 增量结构和 locale 唯一索引；本轮只在隔离数据库验证 |
| SSR / SEO | `server/render/entry.tsx`、`server/src/lib/publicDocument.js`、`server/src/lib/seo.js`、`server/src/routes/seo.js` | 请求级语言资源；无 JS 正文；真实语言 canonical/hreflang；缺译 404/noindex；本地化失败文档 |
| reader / 缓存 | `edge/shared/public-policy.mjs`、`edge/reader/server.mjs`、公开读取资源模块 | 严格匿名白名单；私有请求拒绝；语言资源隔离；限定同源同语言文章规范化跳转 |
| sitemap / IndexNow / RSS | `scripts/refresh-sitemap.py`、`scripts/indexnow.py`、`newsletter.js`、`RssPage.tsx` | 真实发布地址；RSS 使用发布译文且标记中文回退；不产生第二个文章身份或重复通知 |
| CI 与证据 | `.github/workflows/ci.yml`、`package.json`、`test/helpers/i18n.cjs` | 接入词典、SSR、浏览器与 MySQL 检查；原有测试使用真实词典；保存明确范围的浏览器结果 |

以上组件文件位于 `src/app/components/`，上下文位于 `src/app/context/`，后端路由及库位于 `server/src/routes/` 和 `server/src/lib/`；准确交付文件以最终 `git diff --name-only` 为准；文件级清单见 [bilingual-changed-files.json](reports/bilingual-changed-files.json)，最终收尾时更新。

## 覆盖清单（需结合最终结果阅读）

- 前台：导航、首页、文章、归档、分类、标签、搜索、专栏、作品、动态、关于、友链及 RSS。
- 后台：内容管理、编辑发布、用户互动、邮件订阅、站点设置、系统及监控模块。
- 个人中心及认证：登录/注册、账户、投稿、收藏、阅读及相关状态。
- 交互文案：弹窗、加载、空状态、错误、按钮、标签、placeholder、aria-label、原生表单校验。
- 文章业务正文与用户自行填写的内容不自动伪造译文；语言缺失采用明确来源回退或真实 404。
- 扫描零遗漏仅表示扫描规则覆盖的文本通过，不能代替实际页面和交互检查。

## 已执行检查快照

以下为各阶段实际执行结果，后续代码变化后须由最终检查覆盖：

| 检查 | 阶段结果 | 证据 / 限定 |
| --- | --- | --- |
| 前端完整单元回归 | 390 / 390 通过，无跳过 | `.cache/bilingual-final-check.log` |
| 后端完整单元回归 | 411 通过 / 42 跳过 / 0 失败，共 453 | `.cache/bilingual-server-delivery-final.log`；跳过项为需要显式隔离数据库的测试 |
| 双语 MySQL 与既有中文集成 | 2 / 2 与 15 / 15 通过 | 后端独立验证，已包含第三个 source_hash 迁移；不涉及生产数据库 |
| 全站词典扫描 | 330 文件 / 3460 引用，0 违规 | `.cache/bilingual-final-i18n.log`；3552 英文条目、2741 中文源条目 |
| SSR / reader / 翻译权限 / 表单专项 | 14 / 14 通过 | `.cache/bilingual-delivery-final.log` |
| 新增翻译编辑失败、重试、迟到请求与保存源快照 | 3 / 3 通过 | `content-translation-editor.test.cjs` 与 `contentTranslations.test.js` |
| 类型检查 | 通过 | `.cache/bilingual-final-check.log` |
| 生产构建 | 通过 | `.cache/bilingual-final-check.log` |
| 包体预算 | 通过，阈值未改 | 入口 JS 317900 / gzip 104871；总 JS 2351409 / gzip 780401；最大块 386241；入口 CSS 150945 / gzip 27221 |
| 无 JS 双语 SSR | 阶段通过 | `scripts/test-bilingual-document.mjs`：正文、身份、资源键、语言入口、分享链接、中文回退 |
| 既有 SSR 回归 | 阶段通过 | `scripts/test-document.mjs`：Markdown、安全、分页、首页、封面、作品 |

### 最终检查

- `npm run check`：完整通过（类型、390 项前端测试、生产构建、包体检查），证据 `.cache/bilingual-final-check.log`。
- 双语 SSR 与既有 SSR 最终重跑通过：`.cache/bilingual-final-ssr.log`。
- Chromium / WebKit 核心历史遍历：已执行 14 条记录，全部通过；含双向切换、多次切换不增加历史、无存储系统语言、存储受限与快速切换。证据 `.cache/locale-history-results.json`。
- 实际 App 公共页面遍历：Chromium 与 WebKit 均通过 A→B→英文→返回/前进、历史长度、正文语言、收藏登录返回地址及 375px 无溢出；API 使用隔离模拟数据；真实登录页还验证懒加载校验已安装并显示英文。证据 `.cache/public-history-results.json`。
- 真实构建 SSR hydration：Chromium 与 WebKit 均通过，无 JS 中英文正文可读、hydration 错误为零、已有英文偏好直开中文分享链接保留中文 URL/正文而界面为英文。证据 `.cache/bilingual-hydration-results.json`；已在最终冻结构建后串行重跑通过。
- 编辑器双语及慢保存、失败保留输入：真实 Chromium 测试通过，包含校对来源确认、中文输入往返保留与不同语言独立写入；未将其记为 WebKit 编辑器验收。证据 `.cache/bilingual-final-public-editor-hydration.log`。
- MySQL 增量迁移、发布隔离、共享身份、权限与修订：隔离双语 2 / 2 和既有中文 15 / 15 通过，包含原文更新后的显式翻译校对与来源哈希保留。
- 真正跨站导航返回：Chromium 实测 `persisted=true`，另一标签改为中文后恢复保持最新中文；WebKit 实测 `persisted=false`，通过文档重载路径恢复。人工触发 `pageshow` 的结果单独记录，不冒充 WebKit 真正 BFCache 命中。

独立词典资源不计入现有 JS 预算：英文 JSON 252011 字节 / gzip(level 6) 85830，中文源 JSON 133697 / gzip 54613；英文界面并行读取两份词典。构建后的 hash 资源已核对与源文件内容一致，这些是压缩计算值，不是实测网络传输量。

IndexNow 校验器本地回归：29 项，28 通过、1 跳过；没有向搜索引擎发送生产提交，证据 `.cache/bilingual-indexnow-final.log`。最终核心历史遍历记录在 `.cache/bilingual-final-browser.log`；该链中新加登录停留检查曾暴露 mock providers 数据形状不完整，修正为真实接口契约后，公共页面、编辑器与 hydration 全部重跑通过，证据 `.cache/bilingual-final-public-editor-hydration.log`。

## 独立审查与已修正风险

- 私有页面 SEO API 显式使用界面语言，canonical 保持原路径且 noindex；英文私有前缀仍 404，公开页面忽略界面 locale 查询参数并遵从内容 URL。已通过实际 HTTP API 覆盖登录、注册、密码、后台、账户、电量及节点监控。
- 原有作者失去文章所有权后仍能读取/列出草稿的问题，现按当前父文章权限校验。
- 未发布英文版撤下导致错误基版本、默认草稿列表重复记录的问题已修正。
- 翻译保存响应丢失原文快照、迟到请求与重复点击风险已加保护和测试。
- 翻译类型使用明确白名单，拒绝继承属性名；URL、身份和公开开关不能被译文修改。
- 非文章发布要求完整的非空文本叶子；新增原文内容缺少译文时不继续声称该记录完整英文。
- 站点及关于译文读取与公开页复用同一份默认配置，避免编辑端看不到必需字段；源内容新增未译文本时，公开页与 sitemap 同时取消英文可用声明。
- 成功保存/发布/撤下译文时清除公开快照；站点翻译同时清除中英文 session 缓存，已失效的迟到请求不能恢复旧值；失败写入不清除当前编辑内容。
- 同一翻译编辑器重复保存、身份切换的迟到 GET、失败后重试与成功响应中的源快照都已验证；未挂载组件忽略迟到写入结果。
- 旧后端不认识 locale 草稿索引，直接恢复旧代码可能误发布英文草稿；回滚必须保留兼容后端或关闭编辑发布入口。

## 部署限制与后续步骤

部署顺序、备份和回滚见 [BILINGUAL-DEPLOYMENT.md](BILINGUAL-DEPLOYMENT.md)。上线需要另行授权。当前未验证生产 Nginx include、systemd timer、真实生产数据和海外路由状态；不启用停用的海外节点。GitHub CI 配置已更新，但本轮未推送，因此不宣称 GitHub CI 已运行或通过。

验证环境说明：首次受限沙箱执行出现 esbuild 父目录读取 `Access denied`，在获准的本机隔离运行后通过，未为此削弱测试。一次 hydration 验证与构建资源替换重叠后超时；停止并行构建后单独重跑两个引擎通过，最终验证必须串行读取同一套构建产物。

最终私有页面浏览器验证使用真实 Express SEO 响应，Chromium 与 WebKit 均确认英文登录 title 与 html.lang 不再被中文元数据覆盖；证据 `.cache/bilingual-private-meta-browser.log`。公开中文分享仍以中文文档语义呈现，界面外层单独标记英文。

隔离 MySQL 已通过 mysqladmin 正常关闭（127.0.0.1:33089，本工作区 `.cache/bilingual-mysql`），测试数据保留；未操作生产实例。
