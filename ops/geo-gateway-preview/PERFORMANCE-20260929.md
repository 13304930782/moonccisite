# 海外网关性能与图片缓存修正（2026-09-29）

实测来源：用户在国外 root@mail 运行只读脚本后提供的 mooncci-gateway-matrix.json；240 次 GET 全部 200，另有两次条件 GET 均为 200。TLS 校验开启，固定地址连接，不经过环境代理。此处 DNS 时间不代表公共 DNS 性能。测试按组顺序执行，非并发 A/B；没有测用户到国外节点的最后一段网络。

| 路径 | 资源 | 连接模式 | 成功 | 中位秒 | P95 秒 |
|---|---|---|---|---|---|
| origin | 首页 HTML | fresh | 30/30 | 1.110 | 2.861 |
| origin | 首页 HTML | reuse | 30/30 | 0.177 | 0.643 |
| origin | 43,662 字节 WebP | fresh | 30/30 | 1.610 | 2.851 |
| origin | 43,662 字节 WebP | reuse | 30/30 | 0.174 | 0.931 |
| gateway-loopback | 首页 HTML | fresh | 30/30 | 0.259 | 1.026 |
| gateway-loopback | 首页 HTML | reuse | 30/30 | 0.184 | 0.567 |
| gateway-loopback | 43,662 字节 WebP | fresh | 30/30 | 0.236 | 0.606 |
| gateway-loopback | 43,662 字节 WebP | reuse | 30/30 | 0.171 | 0.547 |

fresh 为每次启动 curl；reuse 为同一 curl 连续请求，每组观察到 29 次复用。网关组描述客户端到网关连接；不能仅凭这个标记判断网关内部上游连接是否复用。源站复用测试说明跨境连接建立开销明显，网关现有连接池配置与当前较低耗时一致，不能把已存在的连接池当作本轮新增改进。

源站公开图片 Cache-Control: public, max-age=0；网关改成 private, no-store。源站和网关 If-None-Match 请求仍各下载 43,662 字节；原因尚未定位，不能声称 304 已修复。首页 HTML 只有 1310 字节，不能代表整个网页加载或 LCP。

## 本轮修改

只允许无 Cookie、Authorization、Proxy-Authorization、Range 的 GET/HEAD；路径限定 /api/uploads/ 下普通栅格图片文件名；响应必须为 200、图片 MIME、无 Set-Cookie，且源站明确 public,max-age=0。合格响应改为 private,max-age=60,must-revalidate。没有共享缓存，也没有 Nginx 磁盘缓存。其他响应继续 private,no-store。

选择 60 秒是为了兼容媒体库原地址重新压缩/删除。已经缓存的浏览器最多 60 秒仍可能显示旧图；到期后必须请求服务器。首次下载和登录用户请求没有加速承诺。

## 已验证与待验证

本地真实 Nginx：合格 GET/HEAD、查询参数、凭据绕过、Range、POST、非图片路径、嵌套路径、304/404/500、错误 MIME、源站禁止缓存、Set-Cookie。既有 TLS 网关登录/写入/跳转/故障回退/连接池回归通过。安装成功、语法失败恢复、验收失败恢复通过模拟事务测试。

初版已由用户提供成功日志：图片字节、Cookie 请求、首页与缺失图片检查通过。Edge 本地测试确认 60 秒内复访使用浏览器缓存、过期后重新请求。2026-09-30 国内条件请求修复由用户报告部署成功；海外端到端 304 尚待实测。iPhone Safari、读屏、真实授权订阅邮件等原计划项目仍未完成。

## 2026-09-30 凭据缓存分区修复（待部署）

初版仅在服务器收到请求后检查凭据，匿名缓存仍可能被随后带 Cookie 的浏览器请求复用。新增 Vary: Cookie, Authorization, Proxy-Authorization, Range，并保留上游已有 Vary，使请求凭据变化时重新访问服务器。真实 Edge HTTP 缓存测试覆盖匿名重复命中、随后增加 Cookie / Authorization / Range 必须访问服务器。支持从已部署初版原位升级；重复安装或不符合已知配置时停止。安装器检查 Vary，失败恢复原配置。

## 干净仓库重建

需要 Python 3.7+、Node.js、项目 npm 依赖和 Nginx。设置 NGINX_TEST_BINARY 为已安装 nginx/nginx.exe 的绝对路径。Windows 使用已安装 Edge；Linux 先运行 npx playwright install chromium。Nginx 测试运行独立临时实例。

```powershell
python ops/geo-gateway-preview/test_image_cache.py
python ops/geo-gateway-preview/test_install_image_cache.py
python scripts/build-nginx-release.py gateway-image-cache --output outputs/mooncci-gateway-image-cache.tar.gz
scp outputs/mooncci-gateway-image-cache.tar.gz outputs/mooncci-gateway-image-cache.tar.gz.sha256 root@107.174.123.42:/root/
```

打包器生成并验证 LF 的 SHA256SUMS、RELEASE.json 与外部校验文件；从对应提交的干净检出打包。只运行归档内安装器，不直接运行源码目录安装器。

国外服务器执行：

```bash
nohup bash -c 'set -eu; cd /root; sha256sum -c mooncci-gateway-image-cache.tar.gz.sha256; release=$(mktemp -d /root/mooncci-image-cache.XXXXXX); tar -xzf mooncci-gateway-image-cache.tar.gz -C "$release"; python3 "$release/install-image-cache.py"' > /root/mooncci-image-cache-install.log 2>&1 < /dev/null &
```

日志：tail -n 40 /root/mooncci-image-cache-install.log。回滚使用成功日志中的 ROLLBACK 命令（包含本次备份目录和安装器绝对路径）。此次只修改国外 vhost 并检查、重载 Nginx，不改 PM2、数据库、DNS 或图片文件。
