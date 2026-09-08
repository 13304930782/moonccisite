# mooncci 三期实施记录

本轮在现有 React/Vite、Express/MySQL、HttpOnly Cookie 体系内完成三期代码，未执行生产部署，未启用真实 GitHub 同步或向真实读者发邮件。

## 第一期：统一视觉与内容更新

- 统一浅色/深色设计变量、导航、页脚、表单和信息密度；移除 Plasma、装饰画布、跑马灯、硬阴影与卡片倾斜，保留必要的状态色。
- 首页采用介绍/当前近况、最近更新、文章、作品、订阅顺序。近况和更新时间由后台维护；封面为空使用文字布局。
- 文章页统一安全 Markdown、代码块、图片、引用、桌面目录与手机折叠目录。评论、搜索、分类、标签、账户、内测、电费和后台同步改版。
- 短动态支持正文、配图、媒体库、草稿/发布/编辑/撤回。owner/admin 管理，公开详情隐藏草稿；首页最近六条、列表每页二十条。
- 现有文章接口保持数组响应兼容；新的 `/api/activity`、`/api/updates` 响应带分页。普通编辑不会改变最初发布时间。

## 第二期：作品与 GitHub

- `/projects` 和 `/projects/:slug` 展示作品介绍、技术栈、状态、演示/仓库链接及分页版本记录。支持版本深链接。
- 后台草稿/发布/撤回和推荐顺序，首页最多三个推荐作品；不自动生成真实项目介绍。
- owner 配置公开仓库，环境与项目双开关。独立调度、独立任务进程每小时同步正式 Releases、首次最近十个、历史标记、去重、隐藏保留、条件请求、限流退避、手动重试与同步状态。
- 版本进入公开更新流；草稿作品、手动隐藏和成功扫描后已被上游撤回的版本不公开。网络失败保留已有内容。

## 第三期：RSS 与邮件周报

- `/api/feed.xml` 最近五十条公开更新；首页、文章和动态页面含订阅入口。
- 邮箱确认订阅、过期处理、限流和退订；已有账户不会自动加入。令牌仅存哈希，链接预取不会自动确认/退订。
- 周一 09:00 上海时间摘要，三类内容分组；空周不发送、历史导入不发送、发送前重新过滤撤回与隐藏内容。
- 独立后台任务，订阅者/周次唯一，明确失败最多三次重试；不明确投递及发送中断标记待核对，owner 可核对后标记已发送或跳过。后台可暂停。

## 数据和部署

仅新增 `202609050001_create_content_platform.sql`，旧迁移文件保持原样；同步更新完整结构与 `.env.example`。新增空库初始化器，避免完整结构和旧迁移重复执行。详细操作见 [CONTENT-DEPLOY.md](CONTENT-DEPLOY.md) 与 [DEPLOY.md](DEPLOY.md)。

## 本轮验证

2026-09-05，本机专用 MySQL 8（独立端口/测试数据库）与 Chrome 自动化验证；测试内容只存在隔离库。

- 前端依赖安装、Vite 生产构建通过；TypeScript 无输出检查通过。
- 后端共 48 个测试全部通过，包含原有电费、邮件模板、内测校验及新增单元和 MySQL 集成测试。
- 新增集成覆盖 Cookie 权限、发布/编辑/撤回、公开草稿隔离、仓库配置权限、初始十个版本与后续历史边界、重复同步、隐藏保留、429 退避、确认过期/单次使用和退订。
- 周报集成覆盖上海周界、09:00 前不发、成功去重、退订抑制、空内容、暂停、最多三次重试、网络超时待核对和发送进程中断恢复。
- 空库初始化 → 校验通过；旧结构与已有迁移记录 → 只执行新迁移 → 再次预览无待执行项；非空库初始化被正确拒绝。
- 浏览器真实操作覆盖登录、后台短动态发布与公开详情、撤回 404、评论、图片上传/读取、导航搜索、手机菜单/Escape、减少动态效果以及 API 503 错误重试。
- 390/768/1280 或 1440 像素覆盖手机/平板/桌面：首页、文章、更新、作品、账户、内测、电费与新增后台页面无横向溢出；浅深主题截图人工检查。未观察到浏览器未捕获异常。

GitHub 和 SMTP 使用受控响应测试；生产网络、真实仓库授权、真实邮箱投递及宝塔上线后的冒烟仍需按部署文档执行。现有业务的学校接口和真实内测邮件未在本轮对外调用。

本轮未提交或推送 Git，保留用户已有 `pnpm-workspace.yaml` 改动。本地测试工具、数据库与截图存放于被忽略的 `.cache`，不进入发布包。


## 在原三期计划中补充并落实的约束

本次继续已有实现，不更换技术栈、不另建业务。视觉定位统一为“安静的个人技术手记”。所有品牌展示均为 **mooncci**；展示名称统一不涉及数据库、接口、环境变量及原有部署路径重命名。

### 第一期补充：二级页面与动效

- 首页缩短介绍区，最近动态只展示短动态与项目版本；文章由“最近写了什么”单独展示。完整更新页仍汇总三类，筛选切换回第一页：文章跳原 `/article/:id`，短动态跳 `/updates/:id`，版本跳 `/projects/:slug?release=:id#release-:id`。
- 移除“探索”及其二级菜单。主导航保留文章、近况、作品，直接加入“宿舍电量监控”和“Early Access”；分类和标签旧地址继续可用。
- 账户系列使用单栏表单与公共导航/页脚；内测页改为简短介绍与申请表单；电费页去除描边大字、巨型数字和宣传式首屏，保留原采集、图表和业务逻辑。
- 文章、分类、标签、搜索、动态采用列表与细线；作品保留真实图片入口。后台重做导航框架和概览，旧表格/表单统一字体、标题与控件密度。长文正文独立维持 17px / 1.8，控件 14–15px / 1.5。
- 页面进入采用 180ms、6px 的淡入位移；菜单/搜索展开为 150ms，交互反馈约 150ms。无循环装饰动画、滚动视差和卡片倾斜；减少动态效果设置下停止这些动画。

### 第二、三期补充：可见性、任务与通知

- 版本公开条件集中在 `server/src/lib/publicContent.js`：作品公开、当前绑定仓库匹配、版本未手动隐藏且来源仍可见。详情、更新流、RSS 和周报复用；作品撤回后关联版本同步退出所有公开入口。
- 文章与短动态的 `published_at` 只在首次发布时产生；编辑仅更新 `updated_at`。撤回保留首次时间，重新发布按原时间恢复，不重新置顶。旧版本曾在撤回时清空文章发布时间的历史记录无法凭空恢复，本次不回填虚构时间。
- GitHub 版本首次导入采用上游发布时间，同一 Release ID 后续编辑/转回正式版保留原记录发布时间；首次历史导入不进入周报。手动隐藏不会被同步清除。
- Web 入口只启动 HTTP 服务；`server/src/worker.js` 独立启动任务。PM2 新增单实例 `mooncci-worker`，以独立 MySQL 连接持有进程级任务锁。版本同步和周报保留各自任务锁及唯一约束。电费仅迁移定时任务启动位置，手动采集与计算逻辑不变。
- 完整版本列表扫描成功后，缺失版本还要按 Release ID 单独核实。只有版本详情明确 404 或明确变为草稿/预发布才撤出；列表漏项但详情仍正式则保留；任何分页失败、限流、断网均不被当成删除。
- 新增写接口通过真实 Express 中间件验证 Cookie 权限和 CSRF：缺请求头或不受信任来源返回 403。浏览器 API 继续使用相对地址，RSS/邮件绝对地址统一来自 `SITE_URL`。
- RSS GUID 使用 `urn:mooncci:{type}:{id}`，不随标题、编辑或站点域名改变。
- 周报准备完成后、调用 SMTP 前再次读订阅状态与内容可见性；发送结果不明确仍进入待核对，不自动重发。

### SEO 检查与当前架构内的最小方案

检查结果：当前 Vite 首页/公开文章初始响应仍是通用 HTML 壳，正文由浏览器获取；`SiteMeta` 使用站点级标题，没有文章独立 description/canonical/Open Graph 元信息。`/sitemap.xml` 尚无 XML 实现，SPA 回退可能返回 HTML 200。这些缺项没有通过改浏览器标题冒充已解决。

建议作为原第一期的下一项最小改动：现有 Express 根据公开文章查询生成初始文章 HTML、独立 title/description/canonical、Open Graph/Twitter Card 与 Article 结构化数据，复用现有安全 Markdown 展示规则；Nginx 仅将 `/article/:id` 和 `/sitemap.xml` 交给对应 Express 处理，其余保持 Vite 静态部署与 React 交互。站点绝对 URL 只从 `SITE_URL` 生成；真实封面作为分享图，无封面则省略图片；草稿/撤回返回真实 404 且不进入 sitemap；保留旧 `/article/:id`，不引入新框架。验收以禁用 JS 后仍有正文、逐篇独立元信息、有效 XML、撤回不可见及分享抓取结果为准。本轮先提供方案，未实施 SEO 渲染改造。

### 增补视觉验收清单

- [x] 所有品牌展示均为 mooncci；品牌元素不受 uppercase/capitalize 影响。
- [x] 首页、长文章、后台典型表格/表单及二级页面在真实 Chrome 检查。
- [x] 1440px 桌面、390px 手机，浅色/深色结果；55 组页面检查无横向溢出、无未捕获异常、无可见品牌大小写错误。
- [x] 克制的进入和操作反馈动画；系统减少动态效果时不运行。
- [x] 保留旧路由、登录提交/权限判断、电费计算与监控业务。
- [x] 新增集成检查覆盖真实 CSRF、首次发布时间、撤回版本可见性、独占任务锁、GitHub 缺页/删除/预发布，以及发送前退订。

本轮实际浏览器结果存于 `.cache/revision-results.json`，桌面与手机、浅深主题截图采用 `.cache/revision-*` 命名；均为本机隔离预览，不属于生产数据。


实际浏览器截图（隔离验收环境）：

| 页面 | 桌面浅色 | 手机浅色 | 桌面深色 | 手机深色 |
|---|---|---|---|---|
| 首页 | [查看](.cache/revision-1440-light--.png) | [查看](.cache/revision-390-light--.png) | [查看](.cache/revision-1440-dark--.png) | [查看](.cache/revision-390-dark--.png) |
| 长文章 | [查看](.cache/revision-1440-light--article-6.png) | [查看](.cache/revision-390-light--article-6.png) | [查看](.cache/revision-1440-dark--article-6.png) | [查看](.cache/revision-390-dark--article-6.png) |
| 内测申请 | [查看](.cache/revision-1440-light--early-access.png) | [查看](.cache/revision-390-light--early-access.png) | [查看](.cache/revision-1440-dark--early-access.png) | [查看](.cache/revision-390-dark--early-access.png) |
| 登录 | [查看](.cache/revision-1440-light--login.png) | [查看](.cache/revision-390-light--login.png) | [查看](.cache/revision-1440-dark--login.png) | [查看](.cache/revision-390-dark--login.png) |
| 后台表格 | [查看](.cache/revision-1440-light--admin-posts.png) | [查看](.cache/revision-390-light--admin-posts.png) | [查看](.cache/revision-1440-dark--admin-posts.png) | [查看](.cache/revision-390-dark--admin-posts.png) |
| 后台表单 | [查看](.cache/revision-1440-light--admin-write.png) | [查看](.cache/revision-390-light--admin-write.png) | [查看](.cache/revision-1440-dark--admin-write.png) | [查看](.cache/revision-390-dark--admin-write.png) |

交互验收结果：`.cache/revision-actions.json`。有数据的电费图表截图使用仅浏览器内的测试响应，未写入站点数据库：[查看](.cache/revision-electricity-populated-fixture.png)。

最终补充在真实 Express 中间件下复核 16 组视图，长文使用十节、长代码行的仅浏览器测试响应，目录跳转与横向滚动检查通过；记录为 `.cache/final-review.json`。初始 HTML / sitemap 的响应证据为 `.cache/seo-audit.json`。


页脚备案补充验收（2026-09-05）：

- 保留 `© 2024–2026 mooncci in LNTU`，ICP备案为 `辽ICP备2024042989号-2`，链接 `https://beian.miit.gov.cn/`。
- 公安备案为 `辽公网安备21041102000446号`，链接 `https://beian.mps.gov.cn/#/query/webSearch?code=21041102000446`；原站 `/api/uploads/beian.png` 警徽原样保存到 `public/beian.png`，随前端构建发布，旧上传地址失效时回退到此文件。
- 兼容旧配置中的空备案字段与旧版权占位文字；保留后台配置字段、原有路由和页面宽度规则。
- 实际 Chrome 检查 320、390、768、1440px 浅深主题共 8 组视图，链接、警徽加载、宽度与无横向溢出通过；记录 `.cache/footer-checks.json`，截图 `.cache/footer-{width}-{theme}.png`。
- 前端生产构建、TypeScript 检查与后端语法检查通过。本次未部署生产环境。


下拉菜单与 logo 审阅补充（2026-09-05）：

- 前台申请表单及后台现有下拉选择统一使用 `ThemeSelect`：沿用黑白灰主题、6px 圆角、灰色高亮、选中勾号和 150ms 进入反馈，支持减少动态效果。
- 原有选项值、后台操作和申请请求字段保持一致；保留原生必填校验并把错误焦点交给可见控件。
- 实际浏览器检查桌面/手机浅深主题、方向键/End/Enter/Escape、必填提示、减少动态效果及后台菜单。申请提交使用浏览器模拟响应，未提交真实申请或发送邮件；记录 `.cache/select-checks.json`。
- 生产构建与 TypeScript 检查通过。logo 以“小写 m + 展开书页”制作独立黑白审阅图，仅用于用户审阅，未接入网站或部署。


电费后台开关修复（2026-09-05）：移除开关继承的普通输入框内边距，使用 44×26px 胶囊轨道、18px 圆形滑块与绝对定位；浅深主题均区分开关状态，保留 150ms 反馈、减少动态效果和键盘焦点。仅修改前端 CSS 与 switch 无障碍语义，原有 checked/onChange 和保存接口不变。Chrome 8 组视图、滑块边界、键盘操作、模拟保存、禁用状态及减少动态效果检查通过，记录 `.cache/switch-checks.json`。生产构建与类型检查通过；独立前端修复包为 `.cache/mooncci-switch-fix-20260905.tar.gz`，无需数据库迁移或重启后端。


评论区与属地修复（2026-09-05）：标题和排序独立一行，身份与规则放在下方；移动端排序占满一行且文字不拆行，评论改用细线分隔。站长/管理员/编辑输入提示与免审核行为一致。GeoIP 同时兼容中国省级字母代码和旧数字代码；公开及后台接口在读取历史 ip_location 时转换，原始 IP 与存储属地不改写，缺少省份时保留国家。省级字母代码参考 Unicode CLDR subdivision 列表：https://raw.githubusercontent.com/unicode-org/cldr/main/common/supplemental/subdivisions.xml 。四项格式化测试及实际 API、排序、游客状态、320/390/768/1440px 浅深主题共八组视图通过；记录 `.cache/comment-checks.json`。截图仅显示本次隔离验收评论，未改生产数据。生产构建与类型检查通过。独立修复包 `.cache/mooncci-comments-fix-20260905.tar.gz` 只更新前端和三个后端文件，重载 API，不迁移数据库、不安装依赖、不重启 worker。


## 2026-09-05：站点设置整理与文章可视化编辑

完成当前版本设置四分区、三处图标上传、首页介绍实际编辑、当前近况入口归并及可清空的页脚备案。保留原数据与接口兼容。文章接入延迟加载的 TOAST UI，可视化 / Markdown / 阅读预览共用 Markdown 数据，公开阅读补齐 GFM。所有品牌展示均为 mooncci，手机端写作区域沿用后台可用宽度。详见 SETTINGS-EDITOR-DEPLOY.md。
