// Opt-in tests use an isolated MySQL instance. Never point this at a real site's database.
const test = require("node:test");
const assert = require("node:assert/strict");
const enabled = process.env.CONTENT_INTEGRATION === "true";
test(
  "content lifecycle, cookie permissions, GitHub dedupe and newsletter confirmation",
  { skip: !enabled },
  async () => {
    assert.match(process.env.DB_NAME || "", /^mooncci_qa(?:_|$)/);
    const db = require("../src/platformDb");
    const express = require("express");
    const jwt = require("jsonwebtoken");
    const app = express();
    app.use(express.json());
    const content = require("../src/routes/contentPlatform"),
      subs = require("../src/routes/subscriptions");
    app.use("/api", content.router);
    app.use("/api/admin", content.admin);
    app.use("/api", subs.router);
    app.use("/api/admin", subs.admin);
    app.use((err, _req, res, _next) =>
      res.status(500).json({ message: err.message }),
    );
    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    let role = "owner";
    const cookie = () =>
      `mooncci_token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`;
    async function req(path, method = "GET", body, auth = true) {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Cookie: cookie() } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    }
    const originalFetch = global.fetch;
    try {
      await db.query(
        "INSERT INTO users (id,username,email,password_hash,role,status,can_comment) VALUES (1,'QA owner','qa@example.invalid','test-only-hash','owner','active',1) ON DUPLICATE KEY UPDATE role='owner'",
      );
      assert.equal(
        (
          await req(
            "/admin/updates",
            "POST",
            { content: "Test", status: "draft" },
            false,
          )
        ).status,
        401,
      );
      const update = await req("/admin/updates", "POST", {
        content: "Integration note",
        status: "draft",
      });
      assert.equal(update.status, 201);
      const id = update.data.id;
      assert.equal(
        (await req(`/updates/${id}`, "GET", null, false)).status,
        404,
      );
      assert.equal(
        (
          await req(`/admin/updates/${id}`, "PUT", {
            content: "Integration note",
            status: "published",
          })
        ).status,
        200,
      );
      const published = (await req(`/updates/${id}`)).data.published_at;
      await req(`/admin/updates/${id}`, "PUT", {
        content: "Edited note",
        status: "published",
      });
      assert.equal((await req(`/updates/${id}`)).data.published_at, published);
      assert.ok(
        (await req("/activity")).data.items.some(
          (x) => x.id === id && x.type === "update",
        ),
      );
      await req(`/admin/updates/${id}`, "PUT", {
        content: "Edited note",
        status: "draft",
      });
      assert.equal((await req(`/updates/${id}`)).status, 404);
      assert.ok(
        !(await req("/activity")).data.items.some(
          (x) => x.id === id && x.type === "update",
        ),
      );
      for (role of ["user", "editor"]) {
        await db.query("UPDATE users SET role=? WHERE id=1", [role]);
        assert.equal((await req("/admin/updates")).status, 403);
      }
      await db.query("UPDATE users SET role='admin' WHERE id=1");
      assert.equal((await req("/admin/newsletter")).status, 403);
      assert.equal(
        (
          await req("/admin/projects", "POST", {
            slug: "forbidden",
            name: "Name",
            summary: "Summary",
            status: "draft",
            stage: "building",
            repo: "qa/repo",
          })
        ).status,
        403,
      );
      await db.query("UPDATE users SET role='owner' WHERE id=1");
      const project = await req("/admin/projects", "POST", {
        slug: `qa-${Date.now()}`,
        name: "QA project",
        summary: "Test project",
        status: "published",
        stage: "active",
        repo: "qa/repo",
        featured_rank: 1,
      });
      assert.equal(project.status, 201);
      const pid = project.data.id;
      await req(`/admin/projects/${pid}/sync`, "PUT", { enabled: true });
      let responseMode = "ok";
      let extraReleases = [];
      let calls = 0;
      global.fetch = async (url, options) => {
        if (new URL(String(url)).origin !== "https://api.github.com")
          return originalFetch(url, options);
        calls++;
        if (responseMode === "limited")
          return new Response("{}", {
            status: 429,
            headers: { "retry-after": "3600" },
          });
        if (String(url).includes("/releases?"))
          return new Response(
            JSON.stringify([
              {
                id: 123,
                name: "v1",
                body: "Notes",
                html_url: "https://github.com/qa/repo/releases/tag/v1",
                published_at: "2026-09-01T00:00:00Z",
                draft: false,
                prerelease: false,
              },
              {
                id: 124,
                name: "rc",
                published_at: "2026-09-02T00:00:00Z",
                prerelease: true,
              },
              ...extraReleases,
            ]),
            {
              headers: {
                "content-type": "application/json",
                etag: "test-etag",
              },
            },
          );
        return new Response(JSON.stringify({ private: false }), {
          headers: { "content-type": "application/json" },
        });
      };
      const { syncProject } = require("../src/services/githubSync");
      process.env.GITHUB_SYNC_ENABLED = "false";
      const disabledCalls = calls;
      assert.equal((await syncProject(pid, true)).skipped, true);
      assert.equal(calls, disabledCalls);
      process.env.GITHUB_SYNC_ENABLED = "true";
      await syncProject(pid);
      let [[release]] = await db.query(
        "SELECT * FROM project_releases WHERE project_id=?",
        [pid],
      );
      assert.equal(release.historical, 1);
      await req(`/admin/releases/${release.id}`, "PUT", { hidden: true });
      await db.query(
        "UPDATE github_sync_state SET next_attempt_at=NULL WHERE project_id=?",
        [pid],
      );
      await syncProject(pid);
      const [[count]] = await db.query(
        "SELECT COUNT(*) n,MIN(hidden) hidden FROM project_releases WHERE project_id=?",
        [pid],
      );
      assert.equal(count.n, 1);
      assert.equal(count.hidden, 1);
      extraReleases = Array.from({ length: 12 }, (_, i) => ({
        id: 200 + i,
        name: `old-${i}`,
        body: "Older history",
        html_url: `https://github.com/qa/repo/releases/tag/old-${i}`,
        published_at: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        draft: false,
        prerelease: false,
      }));
      await db.query(
        "UPDATE github_sync_state SET next_attempt_at=NULL WHERE project_id=?",
        [pid],
      );
      await syncProject(pid);
      const [[unchangedHistory]] = await db.query(
        "SELECT COUNT(*) n FROM project_releases WHERE project_id=?",
        [pid],
      );
      assert.equal(
        unchangedHistory.n,
        1,
        "later scans must not import older missing history",
      );
      const second = await req("/admin/projects", "POST", {
        slug: `history-${Date.now()}`,
        name: "History QA",
        summary: "Local test",
        stage: "active",
        status: "draft",
        repo: "qa/repo",
      });
      await req(`/admin/projects/${second.data.id}/sync`, "PUT", {
        enabled: true,
      });
      await syncProject(second.data.id);
      const [[firstTen]] = await db.query(
        "SELECT COUNT(*) n FROM project_releases WHERE project_id=?",
        [second.data.id],
      );
      assert.equal(firstTen.n, 10);
      extraReleases.push({
        id: 500,
        name: "new",
        body: "New release",
        html_url: "https://github.com/qa/repo/releases/tag/new",
        published_at: new Date(Date.now() + 2000).toISOString(),
        draft: false,
        prerelease: false,
      });
      await db.query(
        "UPDATE github_sync_state SET next_attempt_at=NULL WHERE project_id=?",
        [pid],
      );
      await syncProject(pid);
      const [[freshRelease]] = await db.query(
        "SELECT historical FROM project_releases WHERE project_id=? AND github_id=500",
        [pid],
      );
      assert.equal(freshRelease.historical, 0);
      responseMode = "limited";
      await db.query(
        "UPDATE github_sync_state SET next_attempt_at=NULL WHERE project_id=?",
        [pid],
      );
      await assert.rejects(syncProject(pid));
      const [[state]] = await db.query(
        "SELECT error,next_attempt_at FROM github_sync_state WHERE project_id=?",
        [pid],
      );
      assert.match(state.error, /429/);
      assert.ok(state.next_attempt_at);
      const before = calls;
      assert.equal((await syncProject(pid, true)).skipped, true);
      assert.equal(calls, before);
      global.fetch = originalFetch;
      const { token, hash } = require("../src/lib/contentPlatform");
      const confirm = token();
      const email = `qa-${Date.now()}@example.invalid`;
      const [s] = await db.query(
        "INSERT INTO subscribers (email,confirm_hash,confirm_expires) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))",
        [email, hash(confirm)],
      );
      assert.equal(
        (await req("/subscriptions/confirm", "POST", { token: confirm }, false))
          .status,
        200,
      );
      assert.equal(
        (await req("/subscriptions/confirm", "POST", { token: confirm }, false))
          .status,
        400,
      );
      const expired = token();
      await db.query(
        "UPDATE subscribers SET status='pending',confirm_hash=?,confirm_expires=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?",
        [hash(expired), s.insertId],
      );
      assert.equal(
        (await req("/subscriptions/confirm", "POST", { token: expired }, false))
          .status,
        400,
      );
      const unsub = token();
      await db.query(
        "INSERT INTO newsletter_tokens (token_hash,subscriber_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR))",
        [hash(unsub), s.insertId],
      );
      assert.equal(
        (
          await req(
            "/subscriptions/unsubscribe",
            "POST",
            { token: unsub },
            false,
          )
        ).status,
        200,
      );
      const [[subscriber]] = await db.query(
        "SELECT status FROM subscribers WHERE id=?",
        [s.insertId],
      );
      assert.equal(subscriber.status, "unsubscribed");
      const rss = await originalFetch(base + "/feed.xml");
      assert.equal(rss.status, 200);
      assert.match(await rss.text(), /<rss version="2.0"/);
    } finally {
      global.fetch = originalFetch;
      await new Promise((resolve) => server.close(resolve));
      await db.end();
      await require("../src/db").end();
    }
  },
);
