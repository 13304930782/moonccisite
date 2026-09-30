# 国内上传图片校验修复

2026-09-30 生产本机对照：后端 6 次条件请求均 304/0 字节，经 Nginx 6 次均 200/43662 字节。过滤配置显示 http 层 proxy_cache cache_one，/api/uploads/ 未覆盖此设置。

Nginx 开启代理缓存时默认不向上游传递 If-None-Match / If-Modified-Since 等校验头：[官方文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)。本地真实 Nginx 复现了相同现象；只在现有 location ^~ /api/uploads/ 内增加 proxy_cache off 后，校验命中返回 304/0 字节，校验不匹配仍返回 200 和图片内容。

范围：只改国内 /www/server/panel/vhost/nginx/mooncci.site.conf 的现有图片 location。不更改全局配置、其他站点、API 路由、权限、数据库、PM2、DNS、前端或国外 60 秒浏览器缓存。

安装器拒绝重复补丁、重复 location、陌生上游、嵌套块和显式 cache/include。校验离线包、备份、语法检查、reload 后真实循环检查两层两种校验方式，并核对图片字节、Cache-Control、首页与 404。失败自动恢复；配置并发变化时停止避免覆盖。回滚指令在成功日志中输出，回滚前校验哈希。

本地验证：python ops/origin-image-validation/test_validation.py；python ops/origin-image-validation/test_install.py。真实 Nginx 复现/修复与保护条件、安装成功/语法失败恢复/验收失败恢复共 5 项通过。线上部署后才能确认生产恢复；完整站点性能与实机验收仍未完成。
