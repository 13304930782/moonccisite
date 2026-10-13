# Bing SEO 元信息补丁（2026-10-13）

基于 main `76398991a4c834a6a7e2fa82bc99a751f4913722`。默认包替换后端 `src/lib/seo.js` 和 `src/routes/seo.js`；`--with-frontend` 完整包另含详情页侧栏修复的前端资源和匹配服务端渲染 runtime，重启 `mooncci-api`。不改 Nginx、环境变量、数据库、依赖、上传目录、worker 或邮件服务。此次交付使用完整包。

## 改动与验证

- 公共列表页采用各自明确的主题标题与描述。
- 短文章/作品摘要结合真实正文生成最多 160 字的描述；不为短内容凭空补字。
- 近况类型筛选与分页采用不同标题、描述，保留对应 canonical。
- robots.txt 仅允许已支持的图片扩展名和响应式图片路径，明确禁止 `/api/uploads/releases/`，安装包及其他非图片仍受 `/api/` 屏蔽规则保护。
- 详情页侧栏由 React 统一管理展开状态，避免原生延迟 toggle 事件覆盖窄屏折叠结果；鼠标、Enter/Space 与 1099/1100px 切换回归通过。
- 8 项 SEO 专项测试通过。完整后端测试 270 通过、33 项需要 MySQL 的集成测试跳过；本地解压仓库提供的 DB-IP 数据库后测试无失败。前端 npm run check（类型、测试、构建与体积预算）通过。

2026-10-13 线上首页、文章列表可读到服务端渲染正文，robots.txt 与 sitemap.xml 可访问。观察到原列表描述短、图片路径未被允许。当前访问环境对旧域名返回连接失败，不能据此断言生产 301 失效。仍需核对旧文章逐页跳转、Bing 抓取详情、受影响 URL。IndexNow 未在这次补丁中接入；补丁不承诺告警立即消失或排名提升。

## 离线上传（Windows PowerShell）

从修复分支下载部署包，在下载目录执行；用实际主 API 服务器替换下面地址。公开美国 reader 是反向代理，补丁应部署到真正运行 mooncci-api 并执行 SEO 渲染的服务器，不能安装到 `/opt/mooncci-reader`。

```powershell
$serverAddress = 'root@你的主API服务器IP'
$pack = Get-ChildItem .\mooncci-seo-recommendations-*.tar.gz | Sort-Object LastWriteTime -Descending | Select-Object -First 1
scp $pack.FullName ($pack.FullName + '.sha256') "${serverAddress}:/tmp/"
```

## 服务端部署

先核对 PM2 的运行用户、名称、脚本路径以及 Node 路径与脚本默认值一致。默认 mooncci 用户、mooncci-api、Node `/opt/mooncci-node-v24.20.0/bin`、API 目录 `/www/wwwroot/mooncci-source/server`。API 源码路径不同可用 `MOONCCI_API_ROOT` 指定；PM2 用户或名称不同需先调整部署脚本并重新打包。不要直接猜测生产目录。

以下在 root SSH 会话中逐行执行，替换部署包名。

```bash
cd /tmp
sha256sum --strict -c mooncci-seo-recommendations-提交号.tar.gz.sha256
mkdir -p /tmp/mooncci-seo-recommendations
 tar -xzf mooncci-seo-recommendations-提交号.tar.gz -C /tmp/mooncci-seo-recommendations
cd /tmp/mooncci-seo-recommendations
nohup bash ./deploy.sh > /tmp/mooncci-seo-recommendations.log 2>&1 < /dev/null &
tail -n 80 /tmp/mooncci-seo-recommendations.log
```

路径不同时将 nohup 那行改为：

```bash
MOONCCI_API_ROOT=/实际项目/server nohup bash ./deploy.sh > /tmp/mooncci-seo-recommendations.log 2>&1 < /dev/null &
```

脚本校验包内 SHA256、线上两个文件是否与 main 基线、上一版 e3fac59 或新版补丁相符，然后备份并安装；完整包会保留旧哈希资源，更新 HTML 入口与匹配 runtime，并保留已有 runtime 依赖。API 健康检查或 SEO/robots 验收失败会恢复两份原文件、旧 HTML 和旧 runtime 并重启 API。日志必须出现 `PASS` 与 `EXIT_CODE=0` 才算成功。若出现 `Production source drift`，应读取当前线上两份源码对比，不要跳过校验。生产若缓存旧 HTML 或 robots，应按已有缓存策略刷新对应路径；本补丁不会自动清缓存。

## 上线后验收

```bash
curl -fsS 'https://mooncci.site/api/seo?path=/articles'
curl -fsS 'https://mooncci.site/robots.txt'
curl -fsS 'https://mooncci.site/sitemap.xml'
curl -sSI 'https://mooncci.cn/某篇文章的原路径'
```

确认 `.site` 标题描述已更新，公开图片路径允许抓取；旧文章返回 301 且 Location 为对应 `.site` 文章。随后在 Bing URL Inspection 检查代表性文章，提交重新抓取并查看抓取受限详情。保留旧域名 HTTPS 和逐页 301。

## 从源码生成完整包

在本地安装仓库锁定依赖后执行 `python3 scripts/build-seo-recommendations-release.py --with-frontend`。此选项运行 npm run check，生成匹配前端和 SSR 后打包。若只运行默认打包器，包内不包含侧栏修复。
