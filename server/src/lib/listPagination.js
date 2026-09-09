function listPagination(query, defaultSize = 50) {
  function integer(value, fallback, max) {
    const text = String(value ?? '');
    if (!/^\d{1,8}$/.test(text)) return fallback;
    return Math.min(max, Math.max(1, Number(text)));
  }
  return {
    page: integer(query.page, 1, 1000000),
    pageSize: integer(query.pageSize, defaultSize, 100),
  };
}
module.exports = { listPagination };
