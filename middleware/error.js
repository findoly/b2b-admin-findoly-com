function notFound(req, res) {
  if (req.originalUrl.startsWith("/api/")) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Resource not found" });
  return res.status(404).render("error", { title: "Not found", message: "The requested page was not found." });
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number(error.status || 500);
  const expose = status < 500 || error.expose;
  const message = expose ? error.message : "Something went wrong";
  if (status >= 500) console.error(`[${req.requestId || "no-request-id"}]`, error);
  if (req.originalUrl.startsWith("/api/")) return res.status(status).json({ success: false, code: error.code || "REQUEST_FAILED", message, requestId: req.requestId });
  return res.status(status).render("error", { title: status === 403 ? "Access denied" : "Error", message });
}
module.exports = { notFound, errorHandler };
