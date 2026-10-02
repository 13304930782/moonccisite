# 第二关：独立 HTTPS 测试入口（未部署）

域名固定 route-test.mooncci.site，主站 NS/DNS 不变。CN 为 182.92.179.81，US 为 107.174.123.42。两端必须分别配置覆盖同一测试域名的有效证书；优先 DNS-01 验证，在阿里云测试子域添加 _acme-challenge TXT，不在 Cloudflare 主域误添同名记录。两端可各自签发，避免复制私钥；先后完成，注意同名验证 TXT 可能有多值，不覆盖另一次仍在用的记录。不要用 HTTP 验证绕过地区解析的不确定性，不关闭 TLS 校验。

render.py 只生成配置草稿，拒绝覆盖任何既有输出文件，不安装、不 reload。US 密钥从本机 /etc/mooncci-reader.env 读取，写入 600 权限配置，不输出。该配置不可截图或发聊天。

示例（替换为实际证书路径）：
python3 render.py --region US --cert /absolute/fullchain.pem --private-key /absolute/privkey.pem --output /root/mooncci-geo-preview.conf
国内使用 --region CN。

生成的是完整独立 server 配置，不能直接追加到已有 server 块内。只安装到新测试虚拟主机；不得覆盖 mooncci.site、reader-origin、cuegroveapp.com 或邮件站点。须先检查是否已有 route-test 虚拟主机以及实际 Nginx 配置目录、可执行路径，备份该测试配置，执行 nginx -t；失败恢复备份且不 reload。两端证书路径与 Nginx 基线检查已由用户输出确认。install.py 固定只操作 route-test 配置；执行前检查原配置域名和证书路径，部署后通过本机 curl --resolve 保持 TLS 主机名校验。

该入口为只读性能实验：拒绝写入、Cookie/Authorization、Upgrade/Range，不提供登录和私人数据。US 复用现有 reader 的完整读取白名单，CN 仅开放首页、哈希静态资源和公开文章 API。CN 复用已知 frontend 根目录及 3001 端口。标记 X-Mooncci-Node=CN/US；noindex，避免实验域被收录。TLS 与 Nginx 真机配置检查未完成，不宣称已可访问。

验收：两地各请求 https://route-test.mooncci.site/api/posts?format=paged&page=1&pageSize=1，证书校验成功、JSON 200，X-Mooncci-Node 分别为 CN/US；再读取首页、JS/CSS并比较 SHA-256。私人/写请求应拒绝。与同地 mooncci.site 交替多轮测量 DNS/TCP/TLS/首字节/总耗时。此为公开路径效果验收，不代表后续同域名认证代理、邮件和Tunnel迁移已完成。

回退仅停用/移除本次测试虚拟主机，nginx -t 后 reload；保留证书、配置备份和阅读节点。不得重启已有 PM2 或执行 SQL。

## 已确认环境的专用安装器

install.py --region CN|US 只允许主机名 moooncci.cn / mail.cuegroveapp.com。固定证书位置 /www/server/panel/vhost/cert/route-test.mooncci.site/{fullchain.pem,privkey.pem}。备份在 /www/backup/mooncci-geo-https-REGION-时间-PID，含原配置和状态摘要。配置为 600；不要分享美国新配置，其中含节点密钥。

包内 SHA256SUMS 逐文件校验；不允许额外文件、符号链接或未知目标配置。仅 Nginx reload，不执行 SQL、PM2 操作、DNS 修改或服务安装。全局 nginx -t 会校验所有站点，但只替换测试虚拟主机。模拟事务测试不代替真机 Nginx 验证。

用户应通过 scripts/Upload-GeoHttps.ps1 -Region CN 和 -Region US 分别上传并执行其输出的后台安装命令。日志路径 /www/backup/mooncci-geo-CN.log 和 mooncci-geo-US.log。成功打印 Deployment complete: test vhost only；失败会自动恢复原测试站点并重载，若检测到并发修改则停止并保留备份。手动回滚使用成功日志中打印的 python3 install.py --rollback 绝对备份路径；拒绝覆盖部署后未知修改。
