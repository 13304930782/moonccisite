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

尚未部署。线上部署脚本将验证图片字节未变、缓存头、Cookie 绕过、首页与缺失图片；生产实际结果待回传。真实浏览器同一图片 60 秒内复访、到期更新与首次加载对比仍需验收。iPhone Safari、读屏、真实授权订阅邮件等原计划项目仍未完成。
