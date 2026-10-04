# mooncci 邮局开箱代理

仅在邮局服务器上运行。代理主动访问 `https://mooncci.site/api/mailboxes/agent/*` 领取已批准任务，调用本机安装的宝塔邮局 `mail_sys_main.add_mailbox`。用户改密任务调用 `update_mailbox`，保留原账号的容量、启用状态、姓名和管理员标记。博客服务器不持有宝塔面板密钥，邮局服务器不对外新增管理端口。

## 上线前核对

1. 当前邮局插件存在 `/www/server/panel/plugin/mail_sys/mail_sys_main.py`，其 `add_mailbox` 接收 `username`、`password`、`full_name`、`quota`、`is_admin`、`active`。本机实例必须先用隔离测试域名/邮箱验证一次，不用真实用户申请做首测。
2. 测试插件的返回 `status`、邮箱表记录与 SMTP 认证。插件代码有数据库插入错误时循环重试的路径，代理对子进程设 60 秒上限；超时后必须人工核对是否已创建，不能自动重试。
3. 网站端先完成迁移 `202610020001_mailbox_access.sql`，配置 `MAILBOX_SECRET_KEY`、`MAILBOX_PROVISION_KEY`、`MAILBOX_SMTP_HOST` 和 TLS 端口 465。密钥均是独立随机 32 字节十六进制，不能放进前端或日志。加密密钥与数据库一起备份；丢失后无法解密用户 SMTP 密码。
4. 网站与邮局代理使用同一 `MAILBOX_PROVISION_KEY`。邮局服务器 `/etc/mooncci-mail-agent.env` 权限为 root 0600，写入 `MAILBOX_PROVISION_KEY=<hex>`、`MOONCCI_SITE_ORIGIN=https://mooncci.site` 和 `MOONCCI_MAIL_HOST=<邮局证书对应的主机名>`。代理创建后会在 465 端口用新账号进行 SMTP TLS 登录验证，不发送测试邮件。
5. 代理文件安装到 `/opt/mooncci-mail-agent/`，由 systemd 运行；先验证脚本语法和公网 HTTPS，再启动代理。上线和回滚时保留宝塔的数据库、邮箱目录与现有邮局配置。

## 状态与恢复

- “待审核”：网站尚未提交开箱任务。
- “开通结果待核对”：站长已批准，但代理尚未确认；可能处于排队、已领取、超时或部分创建状态。不要重复点击或手动创建同名邮箱。
- “已开通”：代理收到插件成功结果，再次查到邮箱记录，且新账号通过 SMTP TLS 登录验证。
- 代理领取后若崩溃，任务不会自动重领，以防重复创建或重设密码。核对 `journalctl -u mooncci-mail-agent`、宝塔邮局邮箱列表和 `/www/vmail/mooncci.site/<localpart>` 后，再按单独审查的恢复操作处理。
- 网页“撤销”仅立即关闭网站发信入口；因为代理没有收到删除任务，邮局邮箱仍保留。不要把它描述为删除邮箱。

## 用户查看与修改邮箱密码

已开通的用户在网站邮箱页通过登录邮箱中的一次性验证码查看、复制现有邮箱密码，或提交新密码。验证码与当前登录会话绑定，10 分钟有效，最多尝试 5 次；密码不会写入日志、前端持久存储或客户端配置文件。若密码曾在截图中出现，应让用户改密。

先迁移 `202610040001_mailbox_password_changes.sql`，再更新网站 API，最后安装新版 `agent.py` 与 `update_mailbox.py` 并重启 `mooncci-mail-agent`。改密任务由代理单独领取；网站保留旧 SMTP 凭据，直到宝塔插件修改密码并通过 465/TLS 登录验证才切换。任务处理中网页暂时禁止收发信；若插件结果不明确，状态为 `review`，不要自动重复提交或把旧密码显示给用户，应由站长核对邮局状态后按独立恢复流程处理。已有邮箱目录、邮件和其他设置不受改密流程影响。

发送日志仅保留发件账号、收件地址、标题和状态；不记录正文或 SMTP 密码。SMTP 接受仅表示邮件已交给邮局，不代表到达收件箱。
