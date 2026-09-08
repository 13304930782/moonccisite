# mooncci 统一邮件样式更新

所有邮件接入同一套黑白灰 HTML 模板，发件人显示名固定为 mooncci，保留原 SMTP 发件地址。主题标题统一为 `[mooncci] 用途`。每个操作链接显示为按钮，下方附同一完整链接，长确认令牌在手机上换行显示且保留完整内容。

覆盖：订阅确认、每周摘要及退订、密码重置、评论待审和审核结果、PromptDock 申请通知和批准下载、电量早报/晚报/测试日报/低电量及紧急提醒、后台测试邮件和自定义邮件。自定义正文中的 HTTP(S) 链接同样生成按钮和备用地址。无操作的通知不会凭空增加按钮。纯文本邮件部分仍保留完整地址，供不支持 HTML 的客户端使用。

电量数值、定时计划、阈值、收件人、发送去重、周报订阅校验、令牌有效期及发送结果不明的处理均不改变。部署不自动重发历史邮件；已经收到的旧邮件不会改变。

## Windows PowerShell：上传

```powershell
scp "C:\Users\Administrator\Documents\mooncci site\.cache\mooncci-mail-theme-20260905.tar.gz" root@182.92.179.81:/root/
```

## 服务器 SSH：部署

```bash
mkdir -p /root/mooncci-mail-theme &&
tar -xzf /root/mooncci-mail-theme-20260905.tar.gz -C /root/mooncci-mail-theme &&
bash /root/mooncci-mail-theme/deploy-mail-theme.sh
```

脚本先校验、备份，再复制指定文件并重启 mooncci-api 和 mooncci-worker。两者都必须重启，因为订阅确认由 API 发出，定时电量与周报由 worker 发出。不会覆盖 `.env`、SMTP 配置或上传文件，不改变周报开关。不需要数据库迁移、安装依赖或重新构建前端。

如果站点设置更新包也尚未部署，请先部署站点设置包，再部署本邮件包。

## 浏览器：确认

后台“邮件设置”发送一封测试邮件；“水电监控设置”发送一封测试日报，核对发件人 mooncci、统一排版、按钮与备用地址。订阅确认可以使用自己的邮箱走一次新订阅流程验证。不要批量重发旧确认信或周报。

## 服务器 SSH：状态与回退

```bash
curl -fsS http://127.0.0.1:3001/api/health
su -s /bin/bash mooncci -c 'pm2 ls'
```

若需回退，将第一行替换为部署时输出的备份路径：

```bash
backup="/www/backup/mooncci-mail-theme-实际日期时间"
test -s "$backup/code-before.tar.gz" &&
tar -xzf "$backup/code-before.tar.gz" -C /www/wwwroot/mooncci-source/server &&
su -s /bin/bash mooncci -c 'pm2 restart mooncci-api --update-env' &&
su -s /bin/bash mooncci -c 'pm2 restart mooncci-worker --update-env'
```

## 验证记录

- `npm test --prefix server`：50 项通过，5 项数据库集成测试默认跳过。
- `server/test/mailDelivery.test.js`：16 种邮件发送路径，包含实际 Express 订阅确认、密码重置、后台测试与自定义邮件路由；数据库和 SMTP 均被替代，无真实邮件发送。
- 所有按钮都有对应的完整备用链接；地址、参数、片段令牌及大小写保留，正文被安全转义，拒绝危险协议。
- Chrome 375px 手机与 1440px 桌面：18 份预览验证，无横向溢出，按钮可点击区域至少 40px。预览不等同于所有实际邮件客户端兼容性认证；部署后用自己的测试收件箱确认。
- 本机预览在 `.cache/email-previews/`，包括全部 16 类 HTML 与电量/订阅等截图。预览数据均为测试数据。
