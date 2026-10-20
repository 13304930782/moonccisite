# 节日模块管理

## 本地使用

后台入口 `/admin/festivals`（站点与系统 → 节日管理），沿用 owner/admin 权限。自动模式按上海时间匹配；全部关闭停止装饰；手动指定必须填写失效时间，到期自动恢复排期。日期开始包含、结束不包含。保存后当前窗口立即刷新，其他已打开页面最多 60 秒重新读取；回到可见页面也会刷新。

大型主题保留全部已选效果；局部装饰不显示首页大场景；简单彩蛋仅保留页头和 favicon。选项原值保留，切回大型主题可恢复。万圣节的“其他页面轻装饰”默认关闭以保留迁移基准，可在后台开启。后台、账户和登录表单不增加这类正文装饰。

“仅此窗口预览”使用已保存选项，输入上海模拟时间；先通过管理员接口鉴权，再在当前标签页预览，30 分钟失效。预览参数只放 sessionStorage，每次恢复仍由服务器鉴权，不使用公开 URL 参数、不写正式配置。退出预览恢复正式状态。访客关闭偏好独立保留，万圣节兼容原 `mooncci-halloween` 存储键。

## 实现职责

- `server/src/lib/festivals.js`：目录、默认配置、白名单校验、日期规则、优先级及状态。农历和清明明确覆盖 2025–2035；超范围不猜日期。具体地区口径和来源见 `server/FESTIVALS.md`。
- `server/src/routes/festivals.js`：已有 `site_settings` 持久化、管理员读写/私有预览、公开精简状态；响应不缓存，读取失败停用装饰。
- `src/app/components/Festivals/Entry.tsx`：小型公共入口；SSR 和首次水合均为空，客户端才加载公共运行时。
- `Festivals/Runtime.tsx`：主题注册、配置刷新、冲突结果挂载、访客偏好、预览与错误隔离。
- `Festivals/lifecycle.ts`：模块样式、class、favicon 备份/恢复、运动偏好与可见性订阅。
- `Halloween/Decorations.tsx`、`styles.ts`、`geometry.ts`：当前万圣节视觉及交互。帽子几何、纹理、原场景和讨糖行为作为迁移基准保留。
- `Header`、`SiteFooter`、`HomePage`、`WeatherCompanion`、`App`：只使用统一 `FestivalSlot` 挂载。
- `AdminFestivalsPage.tsx`、`festival-admin.css`：现有后台内的独立管理页面；管理代码懒加载。
- `legacyEditorContent.ts`：为保持原 bundle 上限，旧稿转换复用已经使用的 micromark，保留旧脚注引用语义及原 HTML 安全清洗。

当前唯一完成的视觉主题是万圣节。春节、元宵、清明、端午、七夕、中秋、国庆、元旦、情人节、复活节、美国感恩节和圣诞节仅有管理条目，不参与可用主题竞争。建党节、建军节不在目录，未知 ID 和任意脚本/HTML/CSS/资源路径均拒绝。

## 新增一个已开发主题

1. 在 `components/<Theme>/` 放独立组件、局部样式和内联/按需资源。默认导出接收 `name`、`options`、`environment` 的组件；支持公共 slot 名称 `global/home/logo/hat/page`。导出 `theme` 元数据：`className`、`styles`、可选 `faviconSvg`（静态 SVG 内容） 和 `dispose`。纯装饰不拦截点击，交互至少 44px，支持键盘和减少动态效果。
2. 在服务端目录注册唯一 ID、名称、默认等级/优先级/日期及实际支持的布尔选项。排期、默认值和校验统一由目录产生；未完成时保持 `implemented:false`。不要注册被排除的两个节日。
3. 在 `Festivals/Runtime.tsx` 的 `modules` 注册同 ID 的静态 `import()` 函数；不从配置读取代码路径。使用公共选项键与 slot 对应关系，新的实际能力再显式扩展白名单，不改各页面。
4. 在主题卸载的 `dispose` 和组件 effect cleanup 中释放私有动画/观察器；通过 `environment.observeMotion` 监听可见性及系统/阅读设置。
5. 补排期边界、年份覆盖、冲突、等级/选项、鉴权与恶意配置、SSR、水合、装卸、深浅/手机截图测试；主题开始参与选择前验证完整构建和独立资源预算。不要通过提高现有上限接入。

## 数据与回退

无 SQL 迁移，无新增表。只新增 `site_settings.setting_key='festivals'` 的 JSON 行，首次保存前使用默认值。生产发布需同时包含后端接口与前端；本任务不发布。回退前备份该行，通过后台“全部关闭”即可停止效果；旧版本忽略该键。删除键会恢复默认自动模式，不能当作关闭。其他业务数据及已有工作区改动不清理。

## 检查和证据

命令：`npm run typecheck`、`npm test`、`npm test --prefix server`、`npm run build`、`npm run check:bundle`。项目没有独立 lint 命令。服务器集成测试中原有依赖外部数据库的项目按现有条件跳过，不能把它们说成已执行。

迁移基准是开始任务时的当前工作区构建副本 `.cache/festival-baseline/dist`，不是旧 Git 提交。截图、逐像素报告和交互验收在 `.cache/festival-acceptance/`；本地预览 fixture 使用内存配置，不代表真实 MySQL 重启验收。接口测试验证数据库读写调用与重新读取，但本任务没有连接生产数据库。

### 本次结果（2026-10-20）

| gzip 指标 | 迁移前当前工作区构建 | 最终构建 | 上限 |
| --- | ---: | ---: | ---: |
| 入口 JS | 101,678 B | 100,955 B | 原基准 100,724 B + 1,000 B |
| 普通 JS 合计 | 749,427 B | 748,583 B | 750,000 B |
| 万圣节独立包 | 8,313 B | 7,977 B | 8,000 B |
| 全部 JS（含独立节日包） | 758,694 B | 756,791 B | 普通代码与节日包分别检查 |

通用 `festival-runtime` 是单独的懒加载管理代码，计入普通 JS 总量；非节日不下载万圣节素材或后台管理模块。节日生效相对非节日仅增加一个主题 JS 请求。入口指标指 manifest 的静态依赖入口大小，不冒充页面所有动态请求的总和。

类型检查、320 项前端测试、构建及全部 bundle budget 通过。服务端 407 项中 368 项通过、39 项按既有外部测试数据库条件跳过、0 失败；没有新增跳过或提高预算。接口测试以真实 HTTP 和数据库适配器替身覆盖权限、配置重读、预览不写入与失败恢复；未连接生产 MySQL，也未做真实数据库重启实验。

浏览器完整迁移矩阵 68 组，第一轮 65 组逐像素一致，其余 3 组差异仅在既有图片采样，原样复验后均为 0；最终构建另复验首页 1440/390 亮暗、原差异组、后台设置与预览交互。报告保留初次结果和复验过程，不覆盖失败记录。默认万圣节视觉不变；新增页面点缀单独验证实际绘制且不遮正文。详细 JSON 与 PNG 在 `.cache/festival-acceptance/`。

分支：`codex/festival-management`。本任务只在本地实施，没有推送远端、创建 PR 或部署生产。

最终构建另运行真实动画回归：讨糖彩带、系统/阅读设置减少动态效果、离屏暂停、页面持续打开跨过结束时间自动卸载、帽子与球体共用动画分组均通过。记录在 `.cache/festival-motion/report.json`；执行方式为设置 `QA_MOTION_ONLY=1` 后运行 `node src/app/components/Halloween/tests/browser.cjs`。
