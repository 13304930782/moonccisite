# Mooncci Database Migrations

这个目录只放数据库结构变更 SQL。不要在这里放真实数据、密码、Token、邮箱列表或线上导出的完整数据。

## 命名规则

文件名按时间顺序递增：

```text
YYYYMMDDHHMM_short_description.sql
```

示例：

```text
202605210001_create_media_assets.sql
202605210002_add_user_login_lock.sql
```

## 执行方式

先预览待执行迁移：

```bash
cd /www/wwwroot/mooncci-source/server
node scripts/migrate.js --dry-run
```

确认无误后执行：

```bash
cd /www/wwwroot/mooncci-source/server
node scripts/migrate.js
```

## 规则

- 已执行过的 migration 会记录到 `schema_migrations` 表。
- 已执行过的 SQL 文件不要再改，后续变更要新建 migration。
- 执行前先备份数据库。
- schema 变更后同步更新 `server/database/schema.sql`。
- 只有后端代码依赖新字段时，才需要部署代码并重启 PM2。
