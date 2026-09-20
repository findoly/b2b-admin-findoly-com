function requireSameOriginMutation(req, res, next) {
  if (["GET","HEAD","OPTIONS"].includes(req.method)) return next();
  const origin = String(req.get("origin") || "");
  if (!origin) return next();
  try {
    const allowed = new URL(origin).host === req.get("host");
    if (!allowed) return res.status(403).json({ success: false, code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed" });
  } catch (_) { return res.status(403).json({ success: false, code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed" }); }
  return next();
}
module.exports = { requireSameOriginMutation };
