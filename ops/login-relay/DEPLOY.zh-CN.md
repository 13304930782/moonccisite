# 美国登录中继部署

当前是待部署版本。已通过本地测试；尚未证明国内到美国的真实链路稳定。监控保持开启。
仅提供 Google 公钥和 GitHub 令牌/用户资料中继，不托管第三方账号系统。
浏览器仍需要访问 Google/GitHub 官方授权页面；这个包解决后端访问链路。
不会修改国内应用配置，不会重启国内 PM2，也不会改变邮箱或网站数据。

## 1. DNS
在 cuegroveapp.com 的 Cloudflare DNS 添加：
- 类型 A
- 名称 auth-origin
- IPv4 107.174.123.42
- 代理状态：仅 DNS（灰云）
- 不添加 AAAA

若该名称已有用途，停止使用此包的固定名称，先调整配置。
部署前安装程序会确认解析只返回上述美国 IP，并确认 3103 端口未占用。

## 2. Windows PowerShell 上传代码
~~~powershell
$pack = 'C:\Users\Administrator\Documents\mooncci site\outputs\login-relay'
scp "$pack\mooncci-login-relay.tar.gz" "$pack\mooncci-login-relay.tar.gz.sha256" root@107.174.123.42:/root/
scp 'C:\Users\Administrator\Documents\mooncci site\ops\login-relay\export-key.cjs' 'C:\Users\Administrator\Documents\mooncci site\ops\login-relay\probe-cn.py' root@182.92.179.81:/root/
~~~

## 3. 国内服务器导出当前中继密钥
此命令只导出已有中继密钥，不导出其他 .env 内容，不在终端显示密钥。
~~~bash
/opt/mooncci-node-v24.20.0/bin/node /root/export-key.cjs
~~~
然后在国内服务器直接安全复制到美国（按 SSH 提示认证）：
~~~bash
scp /root/mooncci-login-relay.env root@107.174.123.42:/root/mooncci-login-relay.env
~~~
如果两台服务器之间无法使用 SSH，可通过自己的安全文件传输工具中转该文件；不要把密钥贴到聊天中。

## 4. 美国服务器安装
使用现有 Node 22、Nginx 和 Certbot，不下载 npm 依赖。
新建独立 systemd 服务和独立虚拟主机；已有同名文件则拒绝覆盖。
HTTP 开放 ACME 验证；HTTPS 中继仅允许国内服务器、美国本机访问。
~~~bash
chmod 600 /root/mooncci-login-relay.env
nohup bash -c '
set -eu
cd /root
sha256sum -c mooncci-login-relay.tar.gz.sha256
release=$(mktemp -d /root/mooncci-login-relay.XXXXXX)
tar -xzf mooncci-login-relay.tar.gz -C "$release"
exec python3 "$release/mooncci-login-relay/install.py"
' > /root/mooncci-login-relay-install.log 2>&1 < /dev/null &
~~~
查看结果：
~~~bash
tail -n 60 /root/mooncci-login-relay-install.log
systemctl status mooncci-login-relay --no-pager
~~~
只有出现 PASS: US relay and HTTPS public-key request 才进入下一步。
安装失败会移除本次新建服务和站点配置，保留可能已签发的证书。

## 5. 国内连续检查，暂不切换正式登录
~~~bash
nohup python3 -u /root/probe-cn.py > /root/mooncci-login-relay-probe.log 2>&1 < /dev/null &
tail -n 65 /root/mooncci-login-relay-probe.log
~~~
共 30 轮、60 次请求。Google 需获得证书结构，GitHub 必须获得上游无效测试令牌的 401 及正确协议头。
403 或任意 401 都不算通过。不使用真实用户令牌。
这只是连接性采样，不代替真实登录，也不保证未来永不超时。

## 6. 切换验收
取得国内采样结果后，再备份国内 .env 和 PM2 的现有 URL 设置，更新：
- GOOGLE_CERTS_URL=https://auth-origin.cuegroveapp.com/google-certs
- GITHUB_OAUTH_PROXY_URL=https://auth-origin.cuegroveapp.com

密钥沿用原值。必须同步更新 PM2 进程环境；只修改 .env 不一定生效。
仅重启 mooncci-api，保留旧 Cloudflare 代理用于回滚。
实际完成 Google 登录、GitHub 授权/回调/用户资料读取，并观察原健康监控。
微软和此前 DNS 查询失败仍须单独排查；此包没有声称已修复它们。

## 运维
证书由现有 Certbot 定时器续期，专用部署钩子仅在本域名证书更新时检查并重载 Nginx。
应用不记录凭据或请求体。查看进程状态：journalctl -u mooncci-login-relay -n 40 --no-pager。
若切换后恶化，应恢复国内两项旧 URL 及 PM2 环境，重启 mooncci-api；无需删除美国服务。
