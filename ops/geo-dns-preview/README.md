# mooncci 地区 DNS 验证包：第一关

这不是生产切换包。只测试独立域名 route-test.mooncci.site，不变更 mooncci.site 的注册商 NS，不重启服务、不动邮件/Tunnel/现有网站。

## 阿里云

在云解析 DNS 添加独立子域 route-test.mooncci.site，使用免费版。记录实际分配的 DNS 服务器名称，不猜测、不直接使用示例 NS。如果要求付费或无法独立托管，先停止并核对账号能力。

添加两条 A 记录：主机记录 @，默认线路 182.92.179.81；主机记录 @，境外线路 107.174.123.42。TTL 使用 600 秒或控制台允许的最小值。records.csv 是配置对照表，不保证符合控制台批量导入模板。不要对同一默认线路填两个 IP，那是轮询而不是地区分流。不要增加 AAAA。

## Cloudflare（仅子域授权）

先检查 route-test 名下不存在 A/AAAA/CNAME/旧 NS。若已存在记录，先核对用途，不覆盖。

只添加 route-test 的 NS 记录，值分别为阿里云实际分配给这个独立子域的服务器名称。保留主域注册商中 meg.ns.cloudflare.com / rory.ns.cloudflare.com 不变。不要把这两条新的 NS 写到阿里云域名注册管理的“修改 DNS 服务器”里。

此子域仅做 DNS 测试；此时浏览器打开它出现默认站点或证书错误不能靠关闭 TLS 校验解决，HTTPS 虚拟主机尚未配置，不能开展登录测试。

## 验证

国内电脑（关闭海外 VPN 和特殊 DNS 覆盖）：python verify-geo-dns.py --region CN
美国服务器：python3 verify-geo-dns.py --region US

预期测试域名：国内 182.92.179.81，美国 107.174.123.42。主域名两地都仍为 182.92.179.81。脚本仅访问系统 DNS，不请求网页、不发送密钥、不读取 .env。

DNS PASS 不等于速度 PASS。后续第二关独立 HTTPS 入口、第三关公开阅读/静态资源与认证/写入代理、第四关真实登录与性能、第五关邮件/Tunnel迁移，全部验收后才形成生产 NS 切换包。当前不启用自动海外生产分流。

## 回退

删除本次新建的 route-test NS 委派和阿里云测试子域即可；只删除本次测试记录，不删除主域 NS。缓存可能维持至 TTL 过期，原主站不会因测试域名撤销而被修改。

## 依据

https://help.aliyun.com/zh/dns/pubz-subdomain-management
https://help.aliyun.com/zh/dns/pubz-instance-upgrade-unbind-replace-downgrade

境外线路免费不代表免费海外权威 DNS 节点、自动健康检查或流量故障切换。真实地区解析以实测为准。
