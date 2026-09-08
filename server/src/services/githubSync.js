const db = require('../platformDb');
const { releaseRecords, sqlDate, fail } = require('../lib/contentPlatform');
async function github(path, etag) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'mooncci-public-releases',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  if (etag) headers['If-None-Match'] = etag;
  const response = await fetch(`https://api.github.com${path}`, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 304) return { unchanged: true };
  if (!response.ok) {
    const retry = Math.max(
      60,
      Number(response.headers.get('retry-after')) || 0,
      (Number(response.headers.get('x-ratelimit-reset')) || 0) - Date.now() / 1000,
    );
    throw Object.assign(new Error(`GitHub HTTP ${response.status}`), {
      httpStatus: response.status,
      retrySeconds: [403, 429].includes(response.status) ? retry : 3600,
    });
  }
  return { body: await response.json(), etag: response.headers.get('etag') };
}
async function syncProject(id, manual = false) {
  if (process.env.GITHUB_SYNC_ENABLED !== 'true')
    return { skipped: true, message: '服务端尚未开启 GitHub 同步' };
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?,0) acquired', [
      `mooncci-github-${id}`,
    ]);
    locked = Boolean(lock.acquired);
    if (!locked) return { skipped: true, message: '同步正在进行' };
    const [[project]] = await db.query('SELECT * FROM projects WHERE id=?', [id]);
    if (!project) throw fail('作品不存在', 404);
    if (!project.repo || !project.sync_enabled)
      return { skipped: true, message: '请先配置并开启同步' };
    let [[state]] = await db.query('SELECT * FROM github_sync_state WHERE project_id=?', [id]);
    if (!state || state.repo !== project.repo) {
      await db.query(
        'INSERT INTO github_sync_state (project_id,repo) VALUES (?,?) ON DUPLICATE KEY UPDATE repo=VALUES(repo),etag=NULL,initialized=0,baseline_at=NULL,last_success_at=NULL,next_attempt_at=NULL,error=NULL',
        [id, project.repo],
      );
      state = { initialized: 0 };
    }
    const [[due]] = await db.query(
      'SELECT next_attempt_at IS NULL OR next_attempt_at<=UTC_TIMESTAMP() AS due FROM github_sync_state WHERE project_id=?',
      [id],
    );
    if (!due.due) return { skipped: true, message: '尚在同步冷却期，请稍后重试' };
    const repo = await github(`/repos/${project.repo}`);
    if (repo.body.private) {
      await db.query('UPDATE project_releases SET source_visible=0 WHERE project_id=?', [id]);
      await db.query('UPDATE github_sync_state SET etag=NULL WHERE project_id=?', [id]);
      throw new Error('仅允许同步公开仓库');
    }
    let page = 1,
      records = [],
      firstEtag = null,
      unchanged = false;
    do {
      const result = await github(
        `/repos/${project.repo}/releases?per_page=100&page=${page}`,
        page === 1 && new Date().getUTCHours() !== 0 ? state.etag : null,
      );
      if (result.unchanged) {
        unchanged = true;
        break;
      }
      if (!Array.isArray(result.body)) throw new Error('GitHub 返回格式不正确');
      if (page === 1) firstEtag = result.etag;
      records.push(
        ...releaseRecords(result.body, !state.initialized).map((r) => ({
          ...r,
          historical:
            !state.initialized ||
            (state.baseline_at && r.published_at <= sqlDate(state.baseline_at))
              ? 1
              : 0,
        })),
      );
      if (result.body.length < 100) break;
      page++;
      if (page > 100) throw new Error('版本过多，请缩小同步仓库范围');
    } while (true);
    records.sort((a, b) => b.published_at.localeCompare(a.published_at));
    if (!state.initialized) records = records.slice(0, 10);
    else {
      // Refresh imported versions, but do not progressively import the repository's entire past.
      const [existing] = await db.query(
        'SELECT github_id FROM project_releases WHERE project_id=? AND repo=?',
        [id, project.repo],
      );
      const known = new Set(existing.map((r) => String(r.github_id)));
      records = records.filter((r) => !r.historical || known.has(String(r.github_id)));
    }
    // A missing item in a list is only a candidate. Confirm its state by stable Release ID.
    const removedIds = [];
    if (!unchanged && state.initialized) {
      const [existing] = await db.query(
        'SELECT github_id,historical FROM project_releases WHERE project_id=? AND repo=?',
        [id, project.repo],
      );
      const seen = new Set(records.map((r) => String(r.github_id)));
      for (const previous of existing) {
        if (seen.has(String(previous.github_id))) continue;
        try {
          const single = await github(`/repos/${project.repo}/releases/${previous.github_id}`);
          if (!single.body || String(single.body.id) !== String(previous.github_id))
            throw new Error('GitHub release identity mismatch');
          if (single.body.draft || single.body.prerelease) removedIds.push(previous.github_id);
          else {
            const formal = releaseRecords([single.body], Boolean(previous.historical));
            if (!formal.length) throw new Error('GitHub release state is incomplete');
            records.push(...formal);
          }
        } catch (error) {
          if (error.httpStatus === 404) removedIds.push(previous.github_id);
          else throw error; // Network, rate limit and partial scans preserve every previous record.
        }
      }
    }
    await connection.beginTransaction();
    const [[current]] = await connection.query(
      'SELECT repo,sync_enabled FROM projects WHERE id=? FOR UPDATE',
      [id],
    );
    if (current.repo !== project.repo || !current.sync_enabled) {
      await connection.rollback();
      return { skipped: true, message: '配置已变化，下次重新同步' };
    }
    for (const githubId of removedIds)
      await connection.query(
        'UPDATE project_releases SET source_visible=0 WHERE project_id=? AND repo=? AND github_id=?',
        [id, project.repo, githubId],
      );
    for (const r of records)
      await connection.query(
        'INSERT INTO project_releases (project_id,repo,github_id,title,content,url,published_at,historical) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE source_visible=1,title=VALUES(title),content=VALUES(content),url=VALUES(url)',
        [
          id,
          project.repo,
          r.github_id,
          r.title,
          r.content,
          r.url,
          r.published_at,
          r.historical,
        ],
      );
    await connection.query(
      'UPDATE github_sync_state SET etag=COALESCE(?,etag),baseline_at=COALESCE(baseline_at,UTC_TIMESTAMP()),initialized=1,last_success_at=UTC_TIMESTAMP(),next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),error=NULL WHERE project_id=?',
      [firstEtag, manual ? 15 : 60, id],
    );
    await connection.commit();
    return { ok: true, count: records.length, unchanged };
  } catch (error) {
    await connection.rollback();
    if (locked)
      await db.query(
        'UPDATE github_sync_state SET error=?,next_attempt_at=? WHERE project_id=?',
        [
          String(error.message).slice(0, 255),
          sqlDate(Date.now() + Math.max(60, error.retrySeconds || 3600) * 1000),
          id,
        ],
      );
    throw error;
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [`mooncci-github-${id}`]);
    } finally {
      connection.release();
    }
  }
}
async function syncAll() {
  const [projects] = await db.query('SELECT id FROM projects WHERE sync_enabled=1');
  for (const p of projects) {
    try {
      await syncProject(p.id);
    } catch (error) {
      console.error('[github-sync]', p.id, error.code || error.message);
    }
  }
}
module.exports = { syncProject, syncAll };
