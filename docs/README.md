# 项目文档

部署专题、维护说明和历史验收记录统一存放在本目录。文中的命令默认从**仓库根目录**执行；带日期或版本号的记录反映当时状态，不代表最新线上状态。

## 主要入口

- [项目介绍与开发启动](../README.md)
- [总部署指南](../DEPLOY.md)
- [部署与运维速查](MOONCCI_DEPLOY_RUNBOOK.md)
- [工程质量门槛](QUALITY-GATES.md)
- [安全政策](../SECURITY.md)
- [第三方声明](../ATTRIBUTIONS.md)

## 内容与后台

- [内容平台上线与运维](CONTENT-DEPLOY.md)
- [站点设置与文章编辑](SETTINGS-EDITOR-DEPLOY.md)
- [审核与账号权限通知](ADMIN-NOTIFICATIONS.md)
- [页脚与 RSS 入口](FOOTER-RSS-DEPLOY.md)
- [刷新时默认文案闪回修复](SITE-SETTINGS-RUNTIME-FIX.md)

## 邮件服务

- [邮件客户端设置部署](MAIL-SETUP-DEPLOY.md)
- [邮件客户端设置验证记录](MAIL-SETUP-TESTS.md)
- [统一邮件样式](MAIL-THEME-DEPLOY.md)
- [独立邮箱与外发](PERSONAL-MAIL-DEPLOY.md)

## 电量与天气

- [日用电与零点预测](ELECTRICITY-DAILY-USAGE.md)
- [历史同步与电量管理](ELECTRICITY-HISTORY-SYNC.md)
- [多宿舍电量管理](ELECTRICITY-ROOMS.md)
- [宿舍电量私密 RSS](ELECTRICITY-RSS.md)
- [天气小球](WEATHER-COMPANION.md)

## 设计、审计与历史记录

- [公开页面布局对齐](layout-alignment.md)
- [近况评论与加载体验 · 2026-09-09](UPDATES-UX-2026-09-09.md)
- [视觉统一与流程验收 · 2026-09-29](ux-unification-20260929.md)
- [版本统一与性能收尾 · 2026-09-29](version-unification-20260929.md)
- [iPhone Safari 实际访问诊断 · 2026-10-05](real-device-diagnostics-20261005.md)
- [全站审计与修复 · 2026-09-09](AUDIT-2026-09-09.md)
- [审计修复部署包](AUDIT-DEPLOY.md)
- [后台列表与媒体库容量修复](CAPACITY-2026-09-09.md)
- [安全告警复核 · 2026-09-09](SECURITY-TRIAGE-2026-09-09.md)
- [三期实施记录](IMPLEMENTATION.md)
- [早期项目任务说明](CODEX_TASK.md)

## 文档存放约定

新的项目级说明放在 `docs/` 并补充此索引。根目录保留 README、AGENTS、安全政策、第三方声明和总部署指南；模块自己的 README、第三方许可证与来源声明随模块保存。历史记录保留，失效的临时截图不作为当前验收证据。
