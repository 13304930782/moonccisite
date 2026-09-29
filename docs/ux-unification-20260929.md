# mooncci 视觉统一与流程验收 · 2026-09-29

本轮保留首页、黑白主题、品牌、字体、路由和权限。后端 API、数据库和 PM2 配置没有修改。现有五套设计板继续保留，未加入主题切换。

## 统一规范

设计方式：保留现有设计并补齐状态。视觉变化 2/10、动效 2/10、信息密度 5/10、素材依赖 2/10、品牌保留 10/10。前台以阅读为主，后台以完成任务为主；手机纵向组织操作，桌面在同组内并列。

- UI 正文 16px，阅读正文 18px，辅助文字 14px；沿用品牌字重与现有字体栈。
- 间距采用 4/8/12/16/24/32/48/64px；控件圆角 10px，面板 16px。
- 同组主要操作用实心按钮，次要操作保留边界；导航和状态文字分开。
- 手机主要点击区域至少 44px；键盘焦点使用可见轮廓。
- 右上轻提示成功 3 秒、失败 6 秒，暂停、去重、外部点击逻辑保持；持续问题留在页面上。
- 加载、失败和空结果分别呈现；筛选无结果提供清除入口。
- Apple 参考：[按钮](https://developer.apple.com/design/human-interface-guidelines/buttons)、[反馈](https://developer.apple.com/design/human-interface-guidelines/feedback)。这是对网页的应用，不宣称 Apple 认证。

## 已解决的问题

| 优先级 | 问题与影响 | 实现及验收 |
|---|---|---|
| 高 | 媒体刷新失败清空已加载图片，用户误以为图片丢失 | 保留同一查询已加载图片，显示持续错误和重新加载按钮；切换查询仍清空旧结果，防止串页 |
| 高 | 订阅申请结果只在轻提示短暂出现 | 增加持续结果区域；明确仍需邮件确认；返回修改时保留邮箱，提交失败保留输入 |
| 高 | 失效订阅链接缺少直接恢复入口 | 提供重新申请、联系支持；站内锚点定位等待异步页面，真正到达订阅表单；退订错误保留支持入口 |
| 中 | 媒体正常文件与回收站选中样式相同 | 实心选中、描边未选中，同时提供 aria-pressed；单页隐藏分页 |
| 中 | 媒体搜索空结果误称无文件 | 分开搜索无结果、回收站为空和未上传；搜索无结果可清除搜索 |
| 中 | 通知首次加载失败仍显示加载中，分类为空缺少恢复 | 加载失败终止加载文案，显示重试；空分类可返回全部通知；标记已读有按钮边界 |
| 中 | 版本管理空白且修改期间可重复操作 | 空版本说明、失败原位重试、保存期间禁用操作和按钮进度，确认成功后轻提示 |
| 中 | 共用刷新提示及分页操作辨识不足 | 持续反馈独立区域，恢复动作使用描边按钮；分页页码读屏播报，取消加载按钮可见 |
| 中 | 运营统计刷新缺少过程说明、结束日期可早于开始日期 | 刷新时说明暂用上次结果，失败提供明确重试；结束日期增加原生最小日期约束 |

前后截图：[媒体刷新前](before-media-refresh-error-390.png) / [后](media-refresh-error-390.png)，[通知筛选前](before-notification-filter-390.png) / [后](notification-filter-390.png)，[失效订阅前](before-subscription-invalid-1440.png) / [后](subscription-invalid-1440.png)。新增结果：[订阅申请](subscription-submitted-390.png)、[空版本](release-empty-390.png)。

## 验收证据与边界

- `routes/report.json`：62 路由，五种角色，1440px/390px/深色主题，共 930 视图；0 横向溢出、0 页面脚本异常、0 测试 API 5xx。使用独立本地数据库；天气服务明确模拟不可用，外部请求被阻止。
- `route-state-matrix.csv`：每个路由、角色的正常入口检查和状态适用性清单。路由扫描只证明记录的页面状态；隐藏操作的依据见下列交互测试。
- `error-routes/report.json` 与 `empty-routes/report.json`：各 62 个手机页面，通过读取失败和空集合注入补测；0 溢出、0 页面脚本异常。认证、站点设置及功能开关保留正常响应；表单无列表时空集合状态不适用。其他角色的入口权限由前述五角色检查覆盖。
- 新增 `test-ux-unification.cjs`：媒体失败保留、搜索恢复、通知错误/筛选恢复、版本失败→重试→空、订阅失败→重试→持续反馈及原邮箱保留；320/390/768/1440px 截图。
- `test-experience-browser.cjs`：Chrome、Edge、WebKit 的轻提示计时、悬停/焦点/页面隐藏暂停、重复合并最多两条、外部点击正常生效、取消默认焦点、焦点返回、下拉稳定和减少动态模式通过。
- `flows.json`：投稿/审核/排期、账号验证/恢复、阅读→登录→评论、收藏和历史、导入/修订历史/发送结果不明等七套回归通过。另完成写作发布、版本冲突、订阅确认退订、业务邮箱和运营/会话测试。
- 前端 26 项单元测试、类型检查、生产构建及包体预算通过。最终入口 gzip 约 95.7KB，总 JS gzip 约 729KB。
- 全路由扫描后新增的锚点定位和细节修正，使用最终包对受影响路由补测；见 `final-routes/report.json`。200% 使用 720 CSS px 的等效布局检查，真实浏览器缩放仍应手工抽查。
- 本地操作使用模拟 API，不发送真实邮件，不发布真实文章。读屏仅检查语义和 live region，未使用真实读屏软件逐句验收。iPhone Safari、真实邮件和线上业务结果仍待部署后实机验证。

## GitHub 范围

当前 origin 为 `https://github.com/13304930782/moonccisite.git`。主分支缺少部分此前已部署的前端源码。对照已成功部署的 `mooncci-security-20260929.tar.gz` 中 SOURCE_FILES.json，107 个待补齐文件逐一匹配；不包含未发布的启动恢复入口、环境变量、邮箱密码、上传文件或后端实现。

本次产品代码另有 8 个文件修改，见 `changed-files.json`。用户已明确授权上传；基线提交为 `1ababcc1be68c513c29355683b46a05a28b8cdb2`，体验修正单独提交。后端历史差异不包含在此次前端上传中。

## 部署

包：`outputs/mooncci-ux-unification-20260929.tar.gz` 及 `.sha256`。上传后重新构建校验，线上验收仍待部署后完成。只替换前端，不重启 PM2，不迁移数据库，不改 .env 或上传文件。

Windows PowerShell：

```powershell
cd "C:\Users\Administrator\Documents\mooncci site"
scp .\outputs\mooncci-ux-unification-20260929.tar.gz .\outputs\mooncci-ux-unification-20260929.tar.gz.sha256 root@182.92.179.81:/root/
```

国内服务器：

```bash
nohup bash -c '
set -eu
cd /root
sha256sum -c mooncci-ux-unification-20260929.tar.gz.sha256
release=$(mktemp -d /root/mooncci-ux-unification-20260929.XXXXXX)
tar -xzf mooncci-ux-unification-20260929.tar.gz -C "$release"
printf "%s\n" "$release" > /root/mooncci-ux-unification-20260929.path
bash "$release/deploy.sh"
' > /root/mooncci-ux-unification-20260929-install.log 2>&1 < /dev/null &
```

查看结果：

```bash
tail -n 100 /root/mooncci-ux-unification-20260929-install.log
```

成功应显示“前端部署完成”和“部署退出码：0”，记录日志中的备份目录。

回滚：将下方备份路径替换为这次日志打印的实际目录，再运行。保留旧哈希资源，因此恢复入口即可恢复旧前端。

```bash
nohup bash -c '
set -eu
release=$(cat /root/mooncci-ux-unification-20260929.path)
bash "$release/rollback.sh" /www/backup/mooncci-offline.替换为实际目录
' > /root/mooncci-ux-unification-20260929-rollback.log 2>&1 < /dev/null &
```

部署后抽查：首页→失效订阅链接→重新申请、媒体刷新失败恢复、写作→检查→发布结果、手机下拉与右上提示。真实发布与发信需使用明确的测试内容和收件人，不能把模拟通过记为生产投递完成。
