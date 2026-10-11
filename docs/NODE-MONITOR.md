# 节点监控与匿名首页缓存

- 监控入口：`/node-monitor`（独立网站页面，页脚入口）；站长连接设置：`/admin/node-monitor`。用户授权统一在 `/admin/users/:id/settings` 的“节点监控权限”中管理，连接设置页提供用户管理快捷入口。
- 仅站长与 `site_settings.node_monitor_private_v1` 中显式授权的用户可读取；管理员不继承权限。每次请求重新检查授权，撤销后缓存也不可读取。
- Komari 服务固定为 `https://komari.mooncci.site:8443`。仅访问节点及最近报告接口，无任意 URL 代理、远程执行或管理操作。
- API 密钥使用现有 `MAILBOX_SECRET_KEY`（64 位十六进制）进行 AES-256-GCM 加密，使用独立 AAD；接口不返回密钥。设置新密钥前验证节点列表读取权限。备份和恢复数据库时保留该加密主密钥。
- 最近状态最多缓存 10 秒，前台每 15 秒刷新，支持暂停，隐藏页面不轮询。90 秒未上报显示离线，读取失败显示状态未知。
- 匿名首页只缓存精确 `/` 的完整成功 HTML，最长 15 秒。Cookie、认证头、范围、预览或诊断请求绕过；带查询参数请求绕过；不缓存错误页与 Set-Cookie 响应。海外 reader 按源站 Age 扣减剩余寿命，浏览器仍遵守网关 private/no-store。
- 发布范围：前端独立离线包；后端仅新增监控路由、入口注册、SEO 缓存模块与构建好的 SSR runtime；海外 reader 单独备份更新。无需依赖安装或数据库迁移，仅重启 mooncci-api 和 mooncci-reader。
- 验证：`node --test server/test/nodeMonitor.test.js server/test/anonymousHomeCache.test.js server/test/seo.test.js test/home-reader-cache.test.cjs test/read-router.test.cjs`；`npm run typecheck`、`npm run build`、`npm run check:bundle`。
- 视觉沿用主题灰阶、圆角、字号及间距；新增操作区使用至少 44 CSS px 控件、可见键盘焦点、关联标签、文字状态、可暂停更新；无新增位移动画。参照 Apple HIG Buttons / Accessibility，Web 侧对应 WCAG 2.2 的键盘操作、焦点可见、非纯色提示、自动更新控制要求。最终验收需真实浏览器桌面、窄屏与深浅主题。

- 匿名专用源站 `origin-cn.mooncci.site` 的精确首页代理使用 `edge/reader/origin-home-cache.conf`，避免宝塔通用代理追加 `no-cache` 而令 reader 无法缓存；其余源站路径不变。
- Komari 兼容扁平 Record 与 1.5 版嵌套报告（`updated_at`、`cpu.usage`、`ram.used`、`network.down/up`）；缺少有效上报时间显示状态未知。
