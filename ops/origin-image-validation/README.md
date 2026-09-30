# 国内上传图片校验修复

2026-09-30 生产本机对照：后端 6 次条件请求均 304/0 字节，经 Nginx 6 次均 200/43662 字节。过滤配置显示 http 层 proxy_cache cache_one，/api/uploads/ 未覆盖此设置。

Nginx 开启代理缓存时默认不向上游传递 If-None-Match / If-Modified-Since 等校验头：[官方文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)。本地真实 Nginx 复现了相同现象；只在现有 location ^~ /api/uploads/ 内增加 proxy_cache off 后，校验命中返回 304/0 字节，校验不匹配仍返回 200 和图片内容。

范围：只改国内 /www/server/panel/vhost/nginx/mooncci.site.conf 的现有图片 location。不更改全局配置、其他站点、API 路由、权限、数据库、PM2、DNS、前端或国外 60 秒浏览器缓存。

安装器拒绝重复补丁、重复 location、陌生上游、陌生嵌套块和显式 cache/include；现有 if/return 块、注释、引号内花括号和 ${变量} 原样保留。校验离线包、备份、语法检查、reload 后真实循环检查两层两种校验方式，并核对图片字节、Cache-Control、首页与 404。失败自动恢复；配置并发变化时停止避免覆盖。回滚指令在成功日志中输出，回滚前校验哈希。

本地验证：python ops/origin-image-validation/test_validation.py；python ops/origin-image-validation/test_install.py。真实 Nginx 复现/修复与保护条件、安装成功/语法失败恢复/验收失败恢复共 6 项通过。线上部署后才能确认生产恢复；完整站点性能与实机验收仍未完成。

2026-09-30 v2：首次安装在写配置前因嵌套结构保护检查退出，无生产修改。改为按引号、注释与变量规则匹配完整配置块，只插入 location 层指令，既有 OPTIONS/if/return 保持不变。真实 Nginx 覆盖 OPTIONS 204、校验请求 304、未命中 200，以及安装事务恢复。
