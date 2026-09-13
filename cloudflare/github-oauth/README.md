# GitHub 登录服务器代理

只转发 `/token`、`/user`、`/emails` 到固定 GitHub 官方接口。用户浏览器的登录与授权页仍是 github.com。Google 证书代理不变。该 Worker 将处理授权码、Client Secret、短期 Token 和用户资料，请仅部署到你自己的 Cloudflare 账号，保持 Observability/请求内容日志关闭，不设置缓存规则，也不要开启实时请求内容记录。

## Cloudflare 控制台

1. Workers & Pages 中创建独立 Worker `mooncci-github-oauth`，将同目录 `worker.mjs` 全部复制进代码编辑器并部署。
2. 设置 → 变量和机密，新增 **Secret** `GITHUB_OAUTH_PROXY_KEY`。在电脑 PowerShell 执行下面命令生成 64 位随机十六进制字符串，将同一值填入 Worker Secret 和服务器 `.env`，不要发到聊天或放进前端。

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

3. 设置 → 域和路由 → 自定义域，添加 `github-auth.mooncci.site`（需域名在该 Cloudflare 账号内）；等待证书生效。关闭该 Worker 的可观测性日志。通过 CLI 部署可使用同目录 wrangler.jsonc，其中 observability 已禁用。
4. 先部署网站离线补丁，再编辑服务器 `/www/wwwroot/mooncci-source/server/.env`，追加或修改（不要重复定义）：

```dotenv
GITHUB_OAUTH_PROXY_URL=https://github-auth.mooncci.site
GITHUB_OAUTH_PROXY_KEY=与Worker相同的64位随机十六进制密钥
```

URL 只填 HTTPS 域名，不带路径或查询参数。两项都为空时保持原有直连；只填一项会明确报配置错误。

5. 在服务器重新加载 API：

```bash
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'
```

6. 检查域名连通性：`curl -i --max-time 10 https://github-auth.mooncci.site/user`。**未带代理密钥时返回 403 是正常的访问保护**，不证明上游授权已成功。再从网站重新发起 GitHub 登录或绑定，确认回到网站且身份正确；失败时查 `[oauth-failure]` 日志。

## 切回直连

将服务器两项配置都清空，按上面的命令重启 API。无需修改 GitHub 应用回调地址。不要刷新旧的 OAuth callback URL，重新点网站登录/绑定按钮发起新的授权。

Worker 不缓存响应、不存 Token、不转发 Cookie/代理密钥到 GitHub。授权码交换超时后不会自动重放，避免重复消费授权码。CF 线路是否更稳定需在你的服务器上实际测试，不能保证大陆网络必定可达。

官方参考：[Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Fetch 缓存控制](https://developers.cloudflare.com/workers/runtime-apis/fetch/)。
