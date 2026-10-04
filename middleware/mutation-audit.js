const AuditLog=require("../models/AuditLog");
const SAFE_METHODS=new Set(["GET","HEAD","OPTIONS"]);
async function requireMutationAudit(req,res,next){
  if((process.env.NODE_ENV==="test"&&process.env.SKIP_DB==="true")||SAFE_METHODS.has(req.method)||!req.admin)return next();
  try{
    await AuditLog.create({
      actorEmployeeId:req.admin.employeeId,
      action:"mutation.intent",
      entityType:"http_request",
      entityId:String(req.requestId||"").slice(0,64),
      summary:`${req.method} ${String(req.originalUrl||req.url||"").slice(0,900)}`,
      before:null,
      after:{method:req.method,path:String(req.path||"").slice(0,500)},
      requestId:String(req.requestId||"").slice(0,64),
    });
    return next();
  }catch(error){
    console.error("Mutation audit intent write failed",error);
    return next(Object.assign(new Error("Audit trail is unavailable; mutation was not applied"),{status:503,code:"AUDIT_UNAVAILABLE"}));
  }
}
module.exports={requireMutationAudit};
