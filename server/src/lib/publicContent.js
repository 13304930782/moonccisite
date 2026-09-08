// Use the same predicate for detail pages, the activity stream, RSS and weekly delivery.
function publicRelease(alias = 'r') {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid internal SQL alias');
  return `${alias}.hidden=0 AND ${alias}.source_visible=1 AND EXISTS (SELECT 1 FROM projects visible_project WHERE visible_project.id=${alias}.project_id AND visible_project.repo=${alias}.repo AND visible_project.status='published')`;
}
module.exports = { publicRelease };
