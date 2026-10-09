# 独立邮箱与外发：分阶段上线

本变更依赖邮件客户端配置 PR #62。先合并、部署并核实 #62，再合并本 PR。源码合并不代表生产环境已更新。以下包均不含密钥、依赖、数据库转储，也不会自动安装。不要在生产服务器上从 GitHub 下载或编译前端。

## 本机生成与校验

在干净的本分支工作树执行：

```powershell
npm ci
npm ci --prefix server
npm run check
npm test --prefix server
python scripts/build-offline-release.py
python scripts/build-personal-mail-release.py
```

输出在 `.cache`：分别是前端、后端、邮局代理三个 `tar.gz`，每个都有 `.sha256`。构建程序会逐字节核对归档，并把原有文件的基线 SHA-256 写入后端 `MANIFEST.json`。前端只用 `scripts/deploy-offline-frontend.sh` 发布；不能用它安装后端、迁移或重启 PM2。

Windows PowerShell 上传示例（将文件名替换为实际构建输出）：

```powershell
scp .cache/mooncci-frontend-<revision>.tar.gz* root@<blog-host>:/root/
scp .cache/mooncci-personal-mail-backend-<revision>.tar.gz* root@<blog-host>:/root/
scp .cache/mooncci-personal-mail-agent-<revision>.tar.gz* root@<mail-host>:/root/
```

## 网站服务器：先审查，再分阶段执行

在交互式 SSH 中不要执行 `set -e` 或 `exit`。以下实际操作放进独立脚本，以 `nohup bash /root/<reviewed-script>.sh > /root/<log>.log 2>&1 < /dev/null &` 运行，并用 `tail` 检查日志及子进程退出码。所有脚本、清单和校验文件均须 LF 行尾。

1. `cd /root` 后用 `sha256sum -c <archive>.sha256` 检查每个包；解压到 `mktemp -d` 创建的独立目录，再在解压目录运行 `sha256sum -c SHA256SUMS`。核对 `MANIFEST.json` 的 revision、文件列表、基线散列，和服务器上现有 `server/src/index.js` 的实际散列。若线上文件与基线不符，先逐行审查差异，不直接覆盖。
2. 备份当前 MySQL 数据库、`server/.env`、`server/src/index.js` 和本次要覆盖的后端文件；保留原有 uploads、历史迁移及 SQL。对生产 MySQL 先运行 `node server/scripts/migrate.js --dry-run`，确认待执行列表仅含已审查的迁移；若同时出现其他历史迁移，暂停，不直接执行。只在数据库备份和计划确认后运行迁移。
3. 给现有 `server/.env` 添加四项：两个不同的 64 位十六进制随机密钥 `MAILBOX_SECRET_KEY`、`MAILBOX_PROVISION_KEY`，以及 `MAILBOX_SMTP_HOST`（证书匹配的邮局主机名）、`MAILBOX_SMTP_PORT=465`。不要覆盖其他环境变量或把密钥放进日志。加密密钥须随数据库备份。
4. 安装后端包列出的两个新模块和更新的 `server/src/index.js` 到线上源码，`node --check` 核对后仅重启 `mooncci-api`。确认 `/api/health`、PM2 状态、既有登录和站点通知正常。前端包单独发布和验收，不重启 PM2。
5. 回退应用时恢复备份的这三个后端文件和原 `.env`、重启 API；新增数据库表先保留，避免误删用户邮箱申请或发送记录。若已创建真实邮局账号，回退网页不会自动删除账号。

## 邮局服务器：代理单独上线

先审查归档并确认 `/www/server/panel/plugin/mail_sys/mail_sys_main.py` 与 `add_mailbox` 方法仍是已检查版本、宝塔 Python 可执行、域名目录存在，465 端口可用。将 `agent.py` 与 `create_mailbox.py` 安装到 `/opt/mooncci-mail-agent/`，systemd 单元安装到 `/etc/systemd/system/mooncci-mail-agent.service`。`/etc/mooncci-mail-agent.env` 由 root 持有且权限 `0600`，至少包含：

```dotenv
MAILBOX_PROVISION_KEY=<与网站相同的64位十六进制值>
MOONCCI_SITE_ORIGIN=https://mooncci.site
MOONCCI_MAIL_HOST=<证书匹配的邮局主机名>
```

对两个 Python 文件运行 `/www/server/panel/pyenv/bin/python3 -m py_compile`，确认邮局服务器能验证网站 HTTPS 证书后，`systemctl daemon-reload`、`systemctl enable --now mooncci-mail-agent`。用 `systemctl status` 和 `journalctl -u mooncci-mail-agent` 验证。代理只有出站 HTTPS，不开新管理端口；创建邮箱的插件进程设 60 秒超时，任何未确认状态都要人工核对，不能盲目重试。

首测只批准一个隔离测试账号与新前缀；确认申请→批准→宝塔账号存在→465/TLS 认证→网页额度与发信记录完整。外部邮件测试只发给明确授权的测试收件地址。验证撤销后网站发信立即关闭；邮局账号仍存在，需要在宝塔单独停用。正式开放前还应核对邮箱配额、投递信誉、反滥用投诉和备份恢复流程。
