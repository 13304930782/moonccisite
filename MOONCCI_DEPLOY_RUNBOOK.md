# Mooncci.site 部署与运维速查

## 常用路径

- 源码目录：`/www/wwwroot/mooncci-source`
- 后端目录：`/www/wwwroot/mooncci-source/server`
- 静态站点目录：`/www/wwwroot/mooncci.site`
- 后端 PM2 应用：`mooncci-api`
- PM2 运行用户：`mooncci`
- 后端监听：`127.0.0.1:3001`

## 后端重启

修改后端代码或 `.env` 后执行：

```bash
su -s /bin/bash mooncci -c "cd /www/wwwroot/mooncci-source/server && pm2 startOrReload ecosystem.config.cjs --update-env"

