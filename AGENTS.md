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
