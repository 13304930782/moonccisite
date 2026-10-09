# Codex task: add login/register, backend admin, and synchronized article publishing

Please turn the current personal blog into a full-stack blog system.

## Important
The visual design of the existing blog should be preserved as much as possible. The goal is not to redesign the site, but to add authentication, backend APIs, database persistence, admin management, and article synchronization.

## Target architecture

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL, compatible with BaoTa/BT panel MySQL
- Authentication: JWT
- Password hashing: bcrypt
- Backend port: 3001
- API base path: `/api`
- Deployment: Nginx serves frontend static files and reverse proxies `/api` to `http://127.0.0.1:3001`

## Required features

### 1. User system

Implement:

- Register
- Login
- Logout on frontend
- Get current user
- JWT auth middleware
- Password hashing with bcrypt
- User roles: `admin` and `user`
- User status: `active` and `disabled`

Rules:

- `admin` can manage all users and all posts.
- `user` can only manage their own posts.
- Disabled users cannot log in.

### 2. Article system

Move articles from frontend hard-coded data to MySQL.

Implement:

- Public article list from database
- Public article detail from database
- Create post
- Edit post
- Delete post
- Draft/published status
- Admin can manage all posts
- Normal users can only manage their own posts

Post fields:

- id
- title
- slug
- summary
- content
- cover_image
- category
- tags
- status: `draft` / `published`
- author_id
- created_at
- updated_at
- published_at

### 3. Admin pages

Add:

- `/login`
- `/register`
- `/admin`
- `/admin/posts`
- `/admin/write`
- `/admin/posts/:id/edit`
- `/admin/users`

Admin features:

- Post list
- Create post
- Edit post
- Delete post
- Switch draft/published
- User list
- Change user role
- Disable user
- Delete user

Only admin users can access `/admin/users`.

### 4. Backend API

Implement these endpoints:

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

Posts:

- `GET /api/posts`
- `GET /api/posts/:id`
- `POST /api/posts`
- `PUT /api/posts/:id`
- `DELETE /api/posts/:id`

Admin:

- `GET /api/admin/users`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`
- `GET /api/admin/posts`

### 5. Database

Create:

- `server/database/schema.sql`
- `server/.env.example`

The SQL should include at least:

- `users` table
- `posts` table

Make sure it works in BaoTa MySQL.

### 6. Deployment docs

Create or update `DEPLOY.md` with BaoTa deployment steps:

1. Import MySQL schema.
2. Configure backend `.env`.
3. Install backend dependencies.
4. Start backend with PM2.
5. Build frontend.
6. Upload frontend `dist` files.
7. Add Nginx reverse proxy for `/api`.
8. Provide a complete Nginx config snippet.

### 7. Quality requirements

- Keep current UI style as much as possible.
- Add React Router if needed.
- Frontend should use relative API requests like `/api/posts`.
- Do not store passwords in plaintext.
- Do not expose database credentials in the repository.
- Ensure frontend `npm install` and `npm run build` work.
- Ensure backend has clear startup commands.
- Update `README.md` with new run instructions.

## Expected output

After completing the task, summarize:

- What files were changed
- How to start frontend locally
- How to start backend locally
- How to deploy on BaoTa
- Any environment variables required
