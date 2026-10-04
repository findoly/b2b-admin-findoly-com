const AuditLog=require("../models/AuditLog");
function notFound(req, res) {
  if (req.originalUrl.startsWith("/api/")) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Resource not found" });
  return res.status(404).render("error", { title: "Not found", message: "The requested page was not found." });
}
function normalizedError(error) {
  if (Number(error?.status)) return { status:Number(error.status), code:error.code||"REQUEST_FAILED", message:error.message, expose:Number(error.status)<500||error.expose };
  const labels=Array.isArray(error?.errorLabels)?error.errorLabels:[];
  const retryable=Number(error?.code)===112||labels.includes("TransientTransactionError")||labels.includes("UnknownTransactionCommitResult")||/WriteConflict/i.test(String(error?.message||""));
  if(retryable)return {status:409,code:"RETRYABLE_CONFLICT",message:"The record changed while this action was being processed. Retry the action.",expose:true};
  if (error?.name === "ValidationError" || error?.name === "CastError") return { status:400, code:"VALIDATION_ERROR", message:"Request data is invalid", expose:true };
  if (error?.code === 11000) return { status:409, code:"DUPLICATE_RESOURCE", message:"A record with the same unique value already exists", expose:true };
  return { status:500, code:error?.code||"REQUEST_FAILED", message:"Something went wrong", expose:false };
}
async function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const normalized=normalizedError(error),status=normalized.status;
  if(req.mutationAuditLogId){try{await AuditLog.findOneAndUpdate({auditLogId:req.mutationAuditLogId,outcome:"intent"},{$set:{outcome:"failed",completedAt:new Date(),summary:`HTTP ${status} ${normalized.code}`}});}catch(auditError){console.error("Mutation failure audit update failed",auditError);}}
  const message=normalized.expose ? normalized.message : "Something went wrong";
  if (status >= 500) console.error(`[${req.requestId || "no-request-id"}]`, error);
  if (req.originalUrl.startsWith("/api/")) return res.status(status).json({ success: false, code: normalized.code, message, requestId: req.requestId });
  return res.status(status).render("error", { title: status === 403 ? "Access denied" : "Error", message });
}
module.exports = { notFound, errorHandler, normalizedError };
