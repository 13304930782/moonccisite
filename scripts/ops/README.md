# 运维工具（配置后启用）

当前交付是工具，未在生产服务器安装定时器，也未验证异地存储。

## 备份

需要 Linux Python 3.9+、mysqldump、restic。配置文件、数据库凭据及 restic 密码使用独立的 /etc/mooncci-backup 目录、目录 700、文件 600；密码另存离线副本，丢失无法解密。备份工具不读取网站账号密码，不自动创建或购买远端服务。

1. 将 backup.py 放到 /opt/mooncci-ops/，按 backup.example.json 创建 /etc/mooncci-backup/config.json。
2. 数据库账号仅有备份所需权限，mysql.cnf 使用 [client]、host、user、password；不将密码放入命令行。app_env 路径必须指向已存在的后端 .env，工具不会改它。
3. restic 密码文件配置好后手动初始化专用仓库：RESTIC_REPOSITORY=/var/lib/mooncci-backup/repository RESTIC_PASSWORD_FILE=/etc/mooncci-backup/restic-password restic init。
4. 先运行 python3 /opt/mooncci-ops/backup.py --config /etc/mooncci-backup/config.json，检查退出码和恢复验证，再安装 service/timer 到 /etc/systemd/system 并启用 timer。
5. journalctl -u mooncci-backup.service -n 100 --no-pager 查看日志；systemctl list-timers mooncci-backup.timer 检查调度。

7 日／4 周／6 月保留规则按日历区间合并，不保证正好 17 份。非零 restic 退出码（包括部分文件未读到）均失败，不发送成功心跳。数据库为事务快照；上传文件是活文件复制，并非与数据库同一瞬间的原子快照。首次启用前在停止发布、附件删除和后台写入的维护窗口完成恢复演练；不能仅凭归档校验声称满足 24 小时 RPO / 4 小时 RTO。

异地目标配置成独立备份账号的 SFTP 仓库，目录放在非网站目录，预先校验 SSH 主机指纹；不可复用网站部署 root 密钥。当前配置仅本地仓库，尚无异地保障。配置心跳时，在 Better Stack 创建每日 heartbeat，允许备份运行时长和随机延迟；只将 URL 写入受限配置文件，不提交 Git。漏报成功心跳由 Better Stack 通知失败。

## 恢复演练

每月在独立虚拟机或容器运行，不能使用生产 MySQL。restic restore 指定快照 --target 指定全新目录，然后运行 verify-restore.py 指向包含 MANIFEST.json 的目录。验证成功仅说明文件校验通过。

随后使用隔离 MySQL，创建 mooncci_restore_日期 数据库并导入 database.sql。禁用邮件、OAuth、后台任务和所有出站集成，以最小权限启动隔离 API；抽查文章、上传附件、私有数据权限。记录开始结束时间、快照 ID、文章/账号/评论行数、丢失附件数和访问检查。演练配置不得复制生产 JWT、OAuth 和邮件凭据到可联网的测试服务。

未提供隔离环境前不安装自动恢复任务；不执行任何生产数据库覆盖。恢复生产属于单独故障操作，必须验证数据库和文件后切换，保留旧实例。

## 日志与磁盘

mooncci-logrotate.conf 是模板；先用 getent passwd mooncci 确认实际 home，修正路径，再 logrotate -d 配置文件检查。copytruncate 有并发写入丢失少量日志的可能。运行信息页显示应用所在磁盘剩余空间，低于 15% 提醒；独立备份分区应另配磁盘监控，页面提醒并非自动告警。

参考：https://restic.readthedocs.io/en/stable/060_forget.html


磁盘自动告警可配置 disk_paths、disk_free_fraction 和 disk_heartbeat，再安装 mooncci-disk.service/timer。Better Stack 将该心跳设为每 5 分钟一次、至少 10 分钟宽限；空间不足或检查失败时停止发成功心跳，由平台通知。备份和磁盘必须使用不同的 heartbeat URL。

## 版本核对

在主站运行 `/opt/mooncci-node-v24.20.0/bin/node audit-live.cjs /www/wwwroot/mooncci-source/server`，输出只含代码 SHA256 与迁移文件名。不打印 .env、密钥或账号信息。文件存在或迁移存在单独都不能证明全部功能可用，还需要接口验收。旧版本没有部署元数据时，后台显示未知是预期行为。
