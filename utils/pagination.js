function pageQuery(query = {}) {
  const page = Math.max(1, Math.min(Number(query.page) || 1, 100000));
  const limit = Math.max(1, Math.min(Number(query.limit) || 25, 100));
  return { page, limit, skip: (page - 1) * limit };
}
function escapedRegex(value) { return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
module.exports = { pageQuery, escapedRegex };
