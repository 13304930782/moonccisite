# mooncci 站点设置与文章编辑更新

## 本次交付

站点设置按“站点标识、首页介绍、当前近况、页脚与备案”分区，每区独立保存。

- 站点标识：浏览器默认标题、导航 Logo、网页 favicon；保留上传、地址输入、预览、清除。
- 首页介绍：顶部说明、完整标题、介绍正文、两组入口文字与地址；入口文字为空时隐藏。
- 当前近况：复用 `/api/admin/now` 和现有 `site_now` 数据。动态管理页改为指向此处，独立短动态仍在原页面发布。
- 页脚与备案：版权文字、ICP备案号及链接、公安备案号及链接、警徽上传及地址。备案文字留空可隐藏；警徽留空继续使用现有 `/beian.png`。
- 删除设置界面中已不用的个人资料卡、头像、社交链接、旧三段式高亮标题、运维命令说明。历史数据保留兼容，不删除数据表或旧地址。
- 所有品牌展示均为 mooncci；后台保存时统一品牌文字，样式不强制转换大小写。

首页字段通过运行时 API 读取，保存后刷新公开页面即可看到，无需每次重新打包。浏览器默认标题、favicon 和后台 Logo 在保存后同步刷新。初始静态 HTML 的 SEO 仍沿用原架构；此项没有改造成服务端渲染。

文章使用 TOAST UI Editor，支持可视化、Markdown 源码、阅读预览。标题、列表、任务列表、表格、代码块、引用、图片和链接仍保存为 Markdown；已有文章默认使用源码模式。仅切换模式不改写原文。复杂 HTML、自定义扩展语法建议在源码模式维护，可视化编辑会按标准 Markdown 规范化格式。阅读预览和公开页共用安全的 CommonMark/GFM 渲染，不执行原始 HTML；编辑器统计上报关闭，图片复用原上传接口和清晰度配置。

本包同时包含此前的电量开关、评论布局及中文 IP 省份显示修复。

## 1. Windows PowerShell：上传更新包

在 Windows 的 PowerShell 中执行这一行（不要粘贴到服务器）：

```powershell
scp "C:\Users\Administrator\Documents\mooncci site\.cache\mooncci-settings-editor-20260905.tar.gz" root@182.92.179.81:/root/
```

## 2. 服务器 SSH：部署

使用现有 root SSH 登录服务器，在服务器终端执行：

```bash
mkdir -p /root/mooncci-settings-editor &&
tar -xzf /root/mooncci-settings-editor-20260905.tar.gz -C /root/mooncci-settings-editor &&
bash /root/mooncci-settings-editor/deploy-settings-editor.sh
```

脚本在子 Bash 中执行，出错会停止脚本，不会因为 `set -e` 关闭交互 SSH。

脚本检查后备份旧文件和网页入口，更新 `/www/wwwroot/mooncci-source` 中的指定文件，重载 mooncci-api，等待健康检查成功后同步已构建的 dist 到 `/www/wwwroot/mooncci.site`。不覆盖 `.env`、已有上传文件或 PM2 配置，不重启 worker。本次无数据库迁移、无后端依赖变更，服务器无需执行 npm install。

成功时输出备份目录 `/www/backup/mooncci-settings-editor-日期时间`。不要在其他服务器路径直接执行此脚本。

## 3. 服务器 SSH：检查

```bash
curl -fsS https://mooncci.site/api/health
su -s /bin/bash mooncci -c 'pm2 ls'
```

然后在浏览器强制刷新后台，进入站点设置，确认四个区域及三个上传入口。修改首页介绍并保存，刷新首页检查；修改版权、备案文字和链接，检查页脚。写一篇草稿，测试可视化、源码和阅读预览。

## 回退（服务器 SSH）

将第一行的目录替换为部署脚本实际打印的备份目录。仅在需要回退时执行：

```bash
backup="/www/backup/mooncci-settings-editor-实际日期时间"
test -s "$backup/code-before.tar.gz" && test -s "$backup/index.html" &&
tar -xzf "$backup/code-before.tar.gz" -C /www/wwwroot/mooncci-source &&
cp -p "$backup/index.html" /www/wwwroot/mooncci.site/index.html &&
su -s /bin/bash mooncci -c 'pm2 reload mooncci-api'
```

旧的哈希资源文件会保留，回退网页入口后可继续使用。后台已保存的新文字不会随代码回退自动删除。

## 开发与验证

Windows PowerShell，项目根目录：

```powershell
npm install
npm run build
npm run dev
```

后端在另一个 PowerShell 窗口：

```powershell
cd server
npm ci
npm test
npm run dev
```

本次本机验证包括：48 项既有后端测试；新增站点设置集成测试在隔离 mooncci_qa 数据库通过；TypeScript 检查；生产构建；Chrome 1440/768/390/320px × 浅深主题的设置及编辑器布局；保存与公开读回、三处上传交互、清空备案、管理员权限、CSRF、旧文章源码保留、GFM 阅读及目录、可视化加粗写回 Markdown、草稿实际保存、失败后保留输入并重试。

测试截图和结果位于 `.cache/settings-*.png`、`.cache/editor-*.png`、`.cache/settings-editor-checks.json`。集成测试为 `server/test/siteSettings.integration.test.js`，默认跳过，仅在显式设置 `SITE_SETTINGS_INTEGRATION=true` 且 DB_NAME 为隔离 mooncci_qa 数据库时运行。测试会恢复原设置并删除本次临时数据，禁止用于生产库。
