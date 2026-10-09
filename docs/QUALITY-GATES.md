# 工程质量门槛

## 类型检查

`npm run typecheck` 使用锁定版本的 TypeScript 与 React 类型，检查 `src` 全部 TypeScript/TSX，启用 strict 和 noEmit。第三方声明内部跳过检查（skipLibCheck），Toast UI 的 exports 未导出其声明文件，因此通过 tsconfig paths 仅映射到包自带的真实 types/index.d.ts；没有用空 any 声明或关闭 strict 来规避错误。此阶段不把 JavaScript 后端或现有显式 any 宣称为已完成全面静态类型验证。

## 构建体积

`npm run build` 生成 asset-manifest.json；`npm run check:bundle` 遍历入口静态依赖，避免只看入口文件遗漏被拆出的共享包，并遍历 dist 中所有 JS 检查总量。动态包不计入入口静态依赖，但计入总量。gzip 是对每个文件计算后相加，不代表实际网络流量、首次页面下载或加载时间。图片、字体、第三方请求不属于本轮 JS/CSS 预算。

| 指标 | 当前字节 | 上限字节 |
| --- | ---: | ---: |
| 入口及静态依赖 JS | 229694 | 280000 |
| 入口 JS gzip | 74542 | 90000 |
| 入口 CSS | 146864 | 170000 |
| 入口 CSS gzip | 24856 | 32000 |
| 最大 JS 包 | 414070 | 450000 |
| 全部 JS | 1753297 | 2200000 |
| 全部 JS gzip | 559442 | 750000 |

阈值保存在 bundle-budget.json，超限返回非零退出码。修改预算需说明功能收益、实际增长和缓解措施，不能只提高 Vite 告警阈值。测试覆盖循环/共享依赖去重、动态包总量和缺失文件失败。

## 变更回归

统一命令 `npm run check` 顺序运行类型检查、前端单元测试、构建和预算。离线打包器也调用此命令，任何失败都不会输出新发布包。CI 对每个 PR 全量运行，不依赖易漏项的路径过滤：

- 前后端单元测试、认证失败/并发/跨标签页、编辑器净化。
- 浏览器近况评论、文章订阅、移动图表、后台分页和迟到搜索响应。
- 隔离 MySQL 集成：数据可见性、会话撤销、评论与容量、后台任务。
- 离线包 LF 校验、损坏包拒绝、旧资源保留、发布失败回滚。
- npm 依赖审计，以及独立 CodeQL 工作流。

生产 HTTPS、Cookie/CDN 配置、SMTP 和学校数据服务仍需实际环境验收。本文没有把模拟测试当作生产验证，也没有自动变更 GitHub 分支保护设置。需要在仓库设置中将 Site checks 对应 job 配置为 required 才能由 GitHub 强制阻止绕过。

## README

README 的展示结构参考用户指定的 PromptDock README：居中简介/徽章、双语介绍、功能与状态、快速开始、折叠维护说明。内容按 moonccisite 代码和文档重写，没有复制 PromptDock 的平台、授权或隐私承诺。
