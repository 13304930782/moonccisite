# IndexNow（仅主站）

独立 Python 3.6+ 标准库脚本，不接入保存/发布接口，不影响已有 sitemap 刷新、PM2、数据库或页面。只在主站安装，海外沿用现有回源，不运行提交器。

## 数据与提交

- 读取现有 `/www/wwwroot/mooncci.site/sitemap-pages.xml`，复用 `/opt/mooncci-sitemap/refresh-sitemap.py` 的 XML 校验，并增加公开路径白名单、真实 lastmod 校验。
- 现有 `mooncci-sitemap.service` 最近成功时间必须在 15 分钟内。XML 内容不变时文件 mtime 不更新，因此不能用文件 mtime 判断是否过期。读取失败、过期或校验失败保留全部状态，不执行提交。
- 首次补提 sitemap 的公开 URL；之后仅新增、真实 lastmod 改变和消失 URL 入队。消失项须匿名 GET 确认 404/410 或 noindex；超时、503、仍公开和重定向都不能当作删除。待提交公开项还会核对 HTML canonical、robots.txt 和 noindex。
- 每批最多 100 个，验证耗时预算 120 秒，HTTP 超时 15 秒。进程文件锁、原子 JSON、发送前持久化队列。异常重启保留待提交项。
- 网络错误、429、5xx 从 10 分钟起指数退避，最长基准 24 小时，尊重更长的 Retry-After。其他 4xx（包括 400/403/422）保留队列并阻断提交，修复日志中原因后人工 `retry`，避免高频死循环。
- 200 是提交成功，202 是已接收、密钥验证待完成，均不代表 Bing 已收录。日志/状态保留最近 20 次结果，不记录 key。
- 没有 lastmod 的页面只自动发现新增/消失，不推测内容更新；需要更新通知时使用下面的手动命令。

```sh
sudo python3 /opt/mooncci-indexnow/indexnow.py status
sudo python3 /opt/mooncci-indexnow/indexnow.py submit https://mooncci.site/about
# 仅在已经修复永久失败原因后解除阻断、重试；不绕过公开 URL 检查。
sudo python3 /opt/mooncci-indexnow/indexnow.py retry
journalctl -u mooncci-indexnow.service -n 30 --no-pager
```

手动 URL 仍必须属于当前或已知的公开 sitemap，不接受参数、草稿、后台、API、IP、其他域名。`retry` 和 `submit` 同样使用锁与持久队列。网络超时无法判断对方是否收到，重试可能重复通知；不会丢弃待提交项。

## 安装与回滚

本地执行 `python -m unittest discover -s scripts -p 'test_indexnow.py' -v`、`python -m unittest discover -s scripts -p 'test_refresh_sitemap.py' -v`，再用 `python scripts/build-indexnow-release.py` 构建离线包。包、manifest、校验文件使用 LF，打包器读回归档逐项验证；不打包 key、状态、前后端构建或环境文件。

上传归档及 `.sha256`，服务器先 `sha256sum -c`，解包后在子 shell 用 `nohup bash deploy.sh >deploy.log 2>&1 </dev/null &` 安装。安装脚本备份受影响代码、systemd 单元、精确路径配置和现有状态，输出具体备份路径及回滚命令。安装不自动启动提交或 timer，先完成下面的 HTTP 验收，再运行一次 service，检查结果后开启 timer。

```sh
sudo systemctl start mooncci-indexnow.service
sudo python3 /opt/mooncci-indexnow/indexnow.py status
sudo systemctl enable --now mooncci-indexnow.timer
```

密钥首次随机生成，权威副本 `/var/lib/mooncci-indexnow/key`（0600）；状态及锁同目录（0700）。公开文本 `/var/lib/mooncci-indexnow-public/{key}.txt`（0644），精确 Nginx location 写在 `/www/server/panel/vhost/nginx/extension/mooncci.site/mooncci-indexnow.conf`，不改变其他 URL 规则。公开文件独立于 dist 和 reader 发布目录，前端重建不会删除。备份配置、`nginx -t` 成功后才 reload，失败恢复本任务文件。回滚不删除持久 key，后续安装复用。

验收：国内、海外固定节点访问同一个 `https://mooncci.site/{key}.txt` 必须 200、UTF-8 纯 key；检查文章和 sitemap。记录真实提交时间、数量、HTTP，再运行无变化轮确认没有全量重复提交，检查 timer/service/state/journal。失败运行本次安装输出的单行回滚命令，禁止回滚前一次前端发布。

官方协议：[IndexNow documentation](https://www.indexnow.org/documentation)。没有新增依赖、后台 UI 或 Bing 收录状态查询。
