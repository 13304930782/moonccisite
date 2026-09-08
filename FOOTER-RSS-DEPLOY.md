# mooncci 页脚与 RSS 入口修复

- 页脚移除“注册账号”“编辑申请”，保留文章、作品、最近更新、RSS 订阅和全部版权备案内容。
- 访客从右上角“登录 / 注册”进入账户页面；手机导航保留登录与注册，移除访客编辑申请入口。
- 站长、管理员、编辑的账户菜单显示控制台，普通用户才显示编辑申请。
- 已登录用户访问 `/register` 自动返回首页，等待登录状态确认期间不显示注册表单。不更改注册和登录 API。
- 新增 `/rss` 说明页，提供用途说明、规范订阅地址、复制按钮和手动复制提示。
- 网站中的 RSS 入口改为说明页，`/api/feed.xml` 原地址、数据格式、稳定标识保持不变。说明页从 XML 中读取服务端 SITE_URL 生成的规范地址，浏览器 API 请求保持相对路径。
- 手机及桌面宽度、浅深主题与页脚警徽均保留。

## Windows PowerShell：上传

```powershell
scp "C:\Users\Administrator\Documents\mooncci site\.cache\mooncci-footer-rss-20260905.tar.gz" root@182.92.179.81:/root/
```

## 服务器 SSH：部署

```bash
mkdir -p /root/mooncci-footer-rss &&
tar -xzf /root/mooncci-footer-rss-20260905.tar.gz -C /root/mooncci-footer-rss &&
bash /root/mooncci-footer-rss/deploy-footer-rss.sh
```

本次只更新前端。脚本先备份网页入口与对应源码，再同步已经构建的 dist。无需重启 PM2、安装依赖或迁移数据库，不覆盖后端邮件代码、.env 或上传文件。部署后在浏览器按 Ctrl + Shift + R 刷新。

如果前面的站点设置更新包尚未部署，先部署该包，再部署本次前端包，以保持最新前端版本。

## 回退：服务器 SSH

将下面备份目录改为脚本实际打印的路径：

```bash
backup="/www/backup/mooncci-footer-rss-实际日期时间"
test -s "$backup/index.html" && test -s "$backup/code-before.tar.gz" &&
tar -xzf "$backup/code-before.tar.gz" -C /www/wwwroot/mooncci-source &&
cp -p "$backup/index.html" /www/wwwroot/mooncci.site/index.html
```

## 本机验证

TypeScript 检查、生产构建通过。Chrome 验证访客注册路径、owner/admin/editor/user 四类登录身份、页脚入口移除、RSS 复制及复制失败提示、接口失败重试、XML 格式错误、原始 RSS 地址可读和稳定标识。1440/768/390/320px × 浅深主题无横向溢出。结果 `.cache/footer-rss-checks.json`，截图 `.cache/rss-*.png`。
