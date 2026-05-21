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
