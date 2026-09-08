# mooncci 刷新时默认文案闪回修复

问题原因：首页、导航、页脚和后台导航使用打包时的 `initialSiteSettings`，然后分别异步请求后台设置覆盖。这导致每次刷新先显示旧文案/旧 logo；重新部署本地构建也会覆盖以前在服务器烘焙好的配置。

现在统一使用 `SiteSettingsProvider`。首次配置请求完成前不渲染默认介绍、logo 或备案内容；首页提供加载、错误和重试状态。配置只在本次页面会话的内存中共享，不读取历史 localStorage，不使用编译时的站点配置。后台保存事件会刷新共享配置，已清空的页脚字段保持清空。后台表单也先读取成功再显示。

`initialSiteSettings.ts` 留在源码里用于旧脚本兼容，但运行页面不再引用。首页介绍等可编辑内容以后台「站点设置」保存的数据库配置为准。仅改这个旧文件不会改变后台设置，不需要再运行 `rebuild-site-settings.sh` 来解决闪回。

本次仅涉及前端，无依赖、数据库或后端变更。请先完成电量 RSS v2 部署，再部署本修复，避免之后用旧包覆盖新前端。

Windows PowerShell：

```powershell
scp 'C:\Users\Administrator\Documents\mooncci site\.cache\mooncci-settings-runtime-20260905.tar.gz' root@182.92.179.81:/root/
```

服务器 SSH：

```bash
mkdir -p /root/mooncci-settings-runtime-20260905
tar -xzf /root/mooncci-settings-runtime-20260905.tar.gz -C /root/mooncci-settings-runtime-20260905
bash /root/mooncci-settings-runtime-20260905/deploy-site-settings-runtime.sh
```

脚本校验所有文件后备份本次覆盖的源码和旧 index.html，保留旧 assets，更新前端。不修改 Nginx、数据库、环境变量或 PM2。成功后 Ctrl+Shift+R 刷新浏览器；若使用 CDN 缓存 HTML，需要清理该 HTML 缓存。

验证：TypeScript 检查和 Vite 生产构建通过；Chrome 模拟首次 API 延迟 1 秒、读取失败、重试、错误响应、保存事件、清空页脚、路由切换及重复刷新。1440/390px、浅色/深色无默认文字闪回或横向溢出。测试使用本机接口与模拟站点设置，未修改生产配置。
