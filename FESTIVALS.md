# 节日管理

入口：后台「站点与系统 → 节日管理」，路径 `/admin/festivals`，仅 owner/admin 可访问。配置沿用 `site_settings` 的 `festivals` JSON，不新增表。

页面与主题从已保存的 `edceb7d` 基线恢复。自动排期按上海时间计算；手动模式必须有结束时间；未实现的主题只保留排期条目，不参与实际展示。当前已实现的是万圣节，其他节日不假装已有视觉主题。

本次按用户确认，仅首页挂载运行时、Logo、场景、宠物帽子和访客开关。进入文章、后台或其他页面后卸载样式、favicon 替换、监听、计时器和装饰。其他页面轻装饰选项保留既有字段值，但在界面中禁用并解释当前范围。

「打开预览」经过管理员接口鉴权，仅写当前标签页的 sessionStorage，30 分钟失效，不改变公开配置。访客关闭偏好仍存于原有 localStorage 键。保存失败保留编辑值。

接口源码与生产已部署版本一致，此次补回 Git；实际离线发布仅替换前端和两份按请求读取的展示资源，不覆盖接口、数据库、SSR renderer 或环境配置，不重启 PM2。

回归入口：`node --test test/halloween.test.cjs test/hat-geometry.test.cjs test/fest-v2-model.test.cjs test/fest-v2-scope.test.cjs`、`node --test server/test/festivals.test.js server/test/festivalsRoutes.test.js`、`node scripts/test-festivals-browser.cjs`。浏览器测试使用隔离数据，覆盖权限、保存、失败保留、首页预览及跨路由卸载；不会修改线上节日排期。
