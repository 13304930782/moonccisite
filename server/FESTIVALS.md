# 节日服务端配置

`src/lib/festivals.js` 是声明式目录和日历规则入口；`src/routes/festivals.js` 复用现有 `authRequired` / `adminOnly`，由 settings router 挂载。没有新增数据库表或迁移：配置 JSON 存在现有 `site_settings` 的 `festivals` 键中，不会改写其他设置。缺省使用当前万圣节 10 月 25 日至 11 月 1 日（上海时间）的效果。

## 接口

- `GET /api/settings/festivals/active`：公开的精简生效状态，`Cache-Control: no-store`；不读取 URL 预览参数。数据库或配置失败时只停用装饰。`nextCheckAt` 是下一个边界或最多 60 秒后的复查时间，`serverTime` 可用于校正客户端时间偏差。
- `GET /api/settings/festivals`：仅 owner/admin，返回 `{config,catalog,state}`。
- `PUT /api/settings/festivals`：仅 owner/admin，严格字段白名单校验后保存完整配置，返回 `{config,catalog,state}`。没有服务端进程内配置缓存，因此其他进程下一次读取即更新。
- `POST /api/settings/festivals/preview`：仅 owner/admin，输入 `{at,festivalId?,config?}`，返回模拟状态；不保存、不更改公开状态、响应不缓存。时间必须含明确时区。`festivalId` 可省略以检查模拟日期的自动选择，指定则临时预览已实现模块。草稿配置同样严格校验。

## 日期口径

所有边界是上海 00:00，开始包含、结束不包含。跨年使用绝对时间加减天数；服务运行时区不参与计算。公历固定规则支持闰日；年度例外用年份键对应 `YYYY-MM-DD`，`null` 表示该年度不启用。浮动规则 `easter` 是西方公历复活节（Meeus/Jones/Butcher），`thanksgiving-us` 是美国 11 月第四个星期四；不混用东正教或加拿大日期。

农历使用项目要求的 Node 24 ICU `Intl` Chinese calendar，显式只支持农历年 2025–2035，排除闰月。按 `relatedYear` 匹配农历年，农历十二月允许落入下一公历年。清明使用同样覆盖年份的年度日期表，超出覆盖不会猜测；管理员可显式填写年度例外。后续扩展覆盖年份须同步核对日历及测试。

核对资料：[香港天文台公农历对照表](https://www.hko.gov.hk/tc/gts/time/conversion.htm)，[2025](https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2025.pdf)、[2026](https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf)。清明年度表 2025–2035 对应 4 月的日期为 `4,5,5,4,4,5,5,4,4,5,5`；同目录年度 PDF 可核查。

全关优先；未到期的手动指定临时覆盖日历和模块开关，到期自动恢复自动选择。自动只考虑已实现且启用的主题；优先级降序，相同优先级按 ID 升序稳定选择。配置不能添加目录外 ID、资源路径、HTML、CSS 或脚本。建党节、建军节不注册，因此导入配置也不能启用。

## 回退与新增

回退前备份 `SELECT setting_value FROM site_settings WHERE setting_key='festivals'` 的结果。通过后台保存全部关闭即可停用。代码回退不需回退 SQL；旧代码不会使用此键。删除本键会恢复默认自动设置，而不是关闭，不能把删除当停用操作。

新增已实现主题：在目录增加 ID、中文名称、默认规则、等级、优先级和可用布尔选项，并在前端注册相同 ID 的按需加载模块；效果依赖由该模块管理。设置 `implemented:true` 之前补日期、冲突、选项、卸载恢复及浏览器视觉测试。公共调度无需为具体节日加分支。禁止注册建党节或建军节。

检查：`node --test server/test/festivals.test.js server/test/festivalsRoutes.test.js`；接口测试使用本机回环 HTTP，需允许本地网络权限。
