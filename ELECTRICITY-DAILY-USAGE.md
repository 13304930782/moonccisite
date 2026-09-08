# mooncci 完整日用电与零点预测

本次延续现有电量 RSS，不改变博客 RSS、登录权限及早晚投递时段。

## 数据口径

- Asia/Shanghai：新增 00:00 采集，保留 07:00、12:00、21:00；已有自定义非零采集时段继续保留。零点不发邮件，不产生 RSS 条目，不触发额外低电量通知。
- 零点请求实时余额，再使用学校页面的 `gettimeusedetail` 查询前 7 个已结束自然日的 `dayuselist`（`date` / `use`）。正常早午晚不额外查询历史。
- 学校前端接口依据：`https://xqh5.17wanxiao.com/userwaterelecmini/static/js/pages-consumer-detail-consumer-detail.17d44136.js`。本地已核实该页面命令和字段；私有账户的真实请求仍需服务器联调，不能由截图证明成功。
- 学校按日期返回的每日用电优先；若某日缺失，仅在相邻零点都有真实累计读数且电表、字段来源一致时使用读数差。不再使用余额差或早晚的今日用电估算完整日用量。
- 周总量、当日用量、剩余余额均不是累计电表读数。`cumulative_reading`（DECIMAL(18,6)）未读到时为 NULL，绝不伪造历史累计数。
- 预测为当日零点总余量 ÷ 前 7 个已结束自然日有效用量的平均值；至少 3 个有效日，零用电日保留。结果和基准一起存储，当天早中晚余额变化不会重新计算该结果。
- 零点允许 5 分钟内启动补采。过时不把白天采样伪装成零点，等待次日。累计读数回退、换表、缺失或重复日明细冲突均排除。学校日明细失败仍保存有效的零点余额，并记录安全错误码。
- 数据库独立任务进程和原有 MySQL worker 锁继续生效；零点表按宿舍范围和日期唯一，事务内写入日明细及预测。API/RSS 请求只读已有数据。
- 不生成历史 RSS 报告。已经持久化的旧早晚报告不改写，仍明确注明历史计算口径；新报告、邮件与面板共用零点预测。

## 页面

电量页面按当前电量、趋势图、学校历史用电、RSS 排列。历史列表只展示学校接口的日期和用量，移除实时采集记录及重复预测说明。图表悬停（手机点按）保留总余量、余额采集时间和学校日用电；无数据与 0 分开显示。手机概览采用两列布局。

## 部署

新增迁移 `server/database/migrations/202609070001_create_electricity_daily_usage.sql`。必须先迁移再重启后端。原已执行迁移不修改。

可选环境变量 `ELECTRICITY_CUMULATIVE_READING_FIELD` 默认为空，确认实际累计电表读数字段且单位为 kWh 后才能填写 `record.<实际字段>` 或 `body.<实际字段>`。截图中的周总量不可填写到这个映射。每日明细同步不依赖此配置。

本地 Windows PowerShell：

```powershell
Set-Location 'C:\Users\Administrator\Documents\mooncci site'
npm run build
python scripts/build-electricity-daily-package.py
scp .cache/mooncci-electricity-daily-20260907.tar.gz root@182.92.179.81:/root/
```

生产在宝塔先备份当前数据库，然后在服务器 SSH 执行（脚本在子 bash 内运行，不会因失败关闭 SSH）：

```bash
mkdir -p /root/mooncci-electricity-daily-20260907
tar -xzf /root/mooncci-electricity-daily-20260907.tar.gz -C /root/mooncci-electricity-daily-20260907
bash /root/mooncci-electricity-daily-20260907/deploy-electricity-daily.sh --preview
```

预览无错误后，仍在服务器 SSH：

```bash
bash /root/mooncci-electricity-daily-20260907/deploy-electricity-daily.sh
su -s /bin/bash mooncci -c 'cd /www/wwwroot/mooncci-source/server && /opt/mooncci-node-v24.20.0/bin/node scripts/check-electricity-daily-source.js'
curl -fsS http://127.0.0.1:3001/api/health
su -s /bin/bash mooncci -c 'pm2 logs mooncci-worker --lines 20 --nostream'
```

检查脚本仅请求学校日明细并打印日期、用量和状态，不写入数据库、不发邮件、不打印凭据。若失败或空数组，请保留错误码/结果继续核实学校接口，不要制造零值。数据从下一个正常零点任务进入网站。Nginx 私密 RSS 路由配置沿用原版。

部署脚本备份覆盖的源码和前端 index，原哈希静态资源不删除。回退：停 worker，解压备份 source.tar.gz 到原源码目录、恢复 index.html，重启原 API/worker；保留新增数据表，勿直接删除历史。具体备份路径以脚本输出为准。

## 验证

- 后端常规测试和显式本地 MySQL 集成测试覆盖：真实日明细解析、零用电、缺失/冲突、读数回退/换表、零点独立调度、幂等及并发保存、预测全天稳定、上游失败、RSS 权限与 SMTP 失败不丢报告。
- 前端 TypeScript / Vite 构建及桌面、手机浅深主题浏览器交互检查。浏览器使用独立模拟数据，不发布示例到生产。
- 未使用生产学校账号或真实邮件投递；未实测 iOS 原生阅读器。学校私有接口的实际数据以服务器检查结果为准。
