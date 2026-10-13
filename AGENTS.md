# Codex instructions for mooncci blog

## Project goal
Turn the current personal blog source into a full-stack blog system with authentication, user management, admin management, and synchronized article publishing.

## Preferred stack
- Frontend: React + Vite, keep the existing visual design as much as possible.
- Backend: Node.js + Express.
- Database: MySQL, compatible with BT/BaoTa panel MySQL.
- Auth: JWT.
- Passwords: bcrypt hash only, never store plaintext passwords.
- Deployment: Nginx static frontend + PM2-managed Node backend + `/api` reverse proxy.

## Development rules
- Do not remove the existing homepage design unless necessary.
- Do not hard-code article data in the frontend after backend integration.
- Keep API requests relative, such as `/api/posts`, so the site works behind Nginx reverse proxy.
- Add `.env.example` for the backend.
- Add `server/database/schema.sql`.
- Add or update `DEPLOY.md` for BaoTa deployment.
- Ensure `npm install` and `npm run build` work for the frontend.
- Provide clear startup commands for both frontend and backend.

## Release workflow (user preference)
- After GitHub push/merge, build and verify a local deployment archive and provide Windows PowerShell upload commands plus server offline deployment/log commands. Do not make the production server download GitHub or build frontend dependencies by default.
- Write all shell scripts, checksum sidecars and manifests as LF bytes, including on Windows. Verify archived files and checksum contents before handing off.
- Run deployment in a child shell with nohup; never put set -e or exit in the interactive SSH shell. Preserve historical SQL, .env and uploads. Frontend-only releases must not restart PM2 or execute migrations. Backend/dependency/migration releases require a separately reviewed scoped package; never claim the frontend packer deploys them.

## 前端设计与文章时效提示

- 所有前端设计沿用现有网站主题、字体、配色、间距、圆角和控件，遵循 [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)。优先改进信息层级、清晰标签、就近反馈、键盘操作和可访问性；适配深浅主题与手机布局，不另起一套视觉风格。
- 新增主要交互控件提供至少 44px 的点击区域、可见焦点和清晰的加载、错误、禁用状态；尊重减少动态效果的系统偏好。
- “最后更新/内容可能过时”的提醒属于系统根据文章时效性自动显示的独立提示。沿用既有六个月判断规则，不放入文章简介、AI 总结、SEO 描述或可编辑的简介设置，也不要求作者手写提醒。
