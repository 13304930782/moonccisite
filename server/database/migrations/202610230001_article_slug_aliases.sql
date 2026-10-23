-- Reserve current and historical article URLs; deleted articles leave a 404 reservation.
CREATE TABLE IF NOT EXISTS article_slug_aliases (
  slug VARCHAR(255) NOT NULL,
  post_id INT NULL,
  PRIMARY KEY (slug),
  KEY idx_article_slug_post (post_id),
  CONSTRAINT fk_article_slug_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

START TRANSACTION;
-- Re-running skips identical ownership; conflicting ownership raises a duplicate-key error.
INSERT INTO article_slug_aliases(slug,post_id)
SELECT p.slug,p.id FROM posts p WHERE p.slug<>'' AND NOT EXISTS (
 SELECT 1 FROM article_slug_aliases a WHERE a.slug=p.slug COLLATE utf8mb4_general_ci AND a.post_id=p.id
);
-- Only this explicitly selected public article changes its legacy slug.
INSERT INTO article_slug_aliases(slug,post_id)
SELECT 'cities-skylines-2-basic-mods',p.id FROM posts p
WHERE p.id=20 AND BINARY p.slug='cities:skylinesii-basic-mod'
 AND BINARY p.title='Cities: Skylines II 都市天际线2 基础Mod推荐' AND p.status='published'
 AND NOT EXISTS (SELECT 1 FROM article_slug_aliases a WHERE a.slug='cities-skylines-2-basic-mods' AND a.post_id=p.id);
UPDATE posts SET slug='cities-skylines-2-basic-mods',version=version+1,updated_at=updated_at
WHERE id=20 AND BINARY slug='cities:skylinesii-basic-mod'
 AND BINARY title='Cities: Skylines II 都市天际线2 基础Mod推荐' AND status='published';
-- Draft payloads and revisions remain intact; their old base_version prevents stale publication.
COMMIT;
