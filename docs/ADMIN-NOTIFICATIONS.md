# mooncci 审核与账号权限通知

## 行为

- 评论通过或驳回已有作者邮件通知，要求后台邮件功能开启、SMTP 配置完整且作者有邮箱。本次修正为根据实际发送结果提示，SMTP 接受后显示“通知邮件已提交发送”，不代表对方已收件或已阅读。
- 角色、启用/停用状态、普通用户评论开关变化后，将变更前后值发送给被修改账号；编辑申请通过后的角色授予同样通知。拒绝编辑申请不属于权限变更，不新增该类邮件。
- 主题为 `[mooncci] 账号权限已更新`，统一小写发件名、mooncci 黑白邮件样式；操作链接为按钮，每个按钮下有完整备用链接，同时提供纯文本内容。
- 写入成功后才发送。相同设置、相同评论状态不重复发信；并发更新使用原值条件避免同一修改重复通知。编辑申请审核和角色更新在事务内提交，失败一起回滚。
- SMTP 失败不回滚已保存的权限/审核，后台显示失败；邮件未开启、无邮箱也分别提示。无后台自动重试队列，避免在不确定是否投递时重复发送。
- 邮件失败日志不包含 SMTP 原始错误、收件人或凭据。复用现有站长/管理员权限，不改变授权规则。无需迁移或新增邮件开关。

## 部署

Windows PowerShell：

```powershell
Set-Location 'C:\Users\Administrator\Documents\mooncci site'
scp .cache/mooncci-admin-notifications-20260908.tar.gz root@182.92.179.81:/root/
```

服务器 SSH：

```bash
mkdir -p /root/mooncci-admin-notifications-20260908
tar -xzf /root/mooncci-admin-notifications-20260908.tar.gz -C /root/mooncci-admin-notifications-20260908
bash /root/mooncci-admin-notifications-20260908/deploy-admin-notifications.sh
```

脚本先校验包和 API 工作目录，备份并更新源码及静态资源，重启 mooncci-api，健康检查失败自动回滚。不修改 `.env` 或数据库，不主动发真实邮件。邮件配置沿用后台“邮件设置”。

## 验证

`node --test server/test/adminNotifications.test.js server/test/mailDelivery.test.js` 覆盖实际 Express 路由、权限拒绝、收件人、主题与按钮、无变化不重发、SMTP 失败/关闭/无邮箱、条件更新冲突，以及编辑申请事务提交和回滚。测试中的数据库/SMTP 使用隔离模拟，未发送真实邮件。完整数据库生产集成需上线后按真实操作确认。
