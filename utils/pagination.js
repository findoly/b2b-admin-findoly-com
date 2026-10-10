function pageQuery(query = {}) {
  const boundedInteger = (value, fallback, maximum) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(parsed, maximum)) : fallback;
  };
  const page = boundedInteger(query.page, 1, 100000);
  const limit = boundedInteger(query.limit, 25, 100);
  return { page, limit, skip: (page - 1) * limit };
}
function escapedRegex(value) { return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
module.exports = { pageQuery, escapedRegex };
