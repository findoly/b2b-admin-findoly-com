"use strict";
const crypto=require("crypto");
const MutationIdempotency=require("../models/MutationIdempotency");
const SAFE_METHODS=new Set(["GET","HEAD","OPTIONS"]);
const KEY_PATTERN=/^[A-Za-z0-9._:-]{16,128}$/;

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object"){
    return Object.keys(value).sort().reduce((out,key)=>{out[key]=canonical(value[key]);return out;},{});
  }
  return value;
}
function signature(req){
  const path=String(req.originalUrl||req.url||"").split("?")[0];
  const payload=JSON.stringify({method:req.method,path,body:canonical(req.body||{})});
  return crypto.createHash("sha256").update(payload).digest("hex");
}
function errorResponse(res,status,code,message){
  return res.status(status).json({success:false,code,message});
}
async function reserve(actorEmployeeId,idempotencyKey,requestSignature){
  const expiresAt=new Date(Date.now()+24*60*60*1000);
  try{
    const created=await MutationIdempotency.create({actorEmployeeId,idempotencyKey,requestSignature,status:"pending",expiresAt});
    return {record:created.toObject(),owner:true};
  }catch(error){
    if(error?.code!==11000)throw error;
  }
  let existing=await MutationIdempotency.findOne({actorEmployeeId,idempotencyKey}).lean();
  if(!existing)throw Object.assign(new Error("Idempotency state is unavailable"),{status:503,code:"IDEMPOTENCY_UNAVAILABLE"});
  if(existing.requestSignature!==requestSignature){
    throw Object.assign(new Error("Idempotency key was already used for a different request"),{status:409,code:"IDEMPOTENCY_KEY_REUSED"});
  }
  if(existing.status==="completed")return {record:existing,owner:false,replay:true};
  if(existing.status==="pending")return {record:existing,owner:false,pending:true};
  existing=await MutationIdempotency.findOneAndUpdate(
    {mutationIdempotencyId:existing.mutationIdempotencyId,status:"failed",requestSignature},
    {$set:{status:"pending",responseStatus:0,responseBody:null,failureCode:"",expiresAt}},
    {new:true}
  ).lean();
  if(!existing)return {record:null,owner:false,pending:true};
  return {record:existing,owner:true};
}
async function complete(id,body,status){
  await MutationIdempotency.updateOne(
    {mutationIdempotencyId:id,status:"pending"},
    {$set:{status:"completed",responseStatus:status,responseBody:body,failureCode:""}}
  );
}
async function fail(id,body,status){
  await MutationIdempotency.updateOne(
    {mutationIdempotencyId:id,status:"pending"},
    {$set:{status:"failed",responseStatus:status,responseBody:null,failureCode:String(body?.code||"REQUEST_FAILED").slice(0,120)}}
  );
}
async function requireMutationIdempotency(req,res,next){
  if(SAFE_METHODS.has(req.method)||!req.admin)return next();
  const requestPath=String(req.originalUrl||req.url||"").split("?")[0];
  if(/\/(?:upload-url|download-url)$/.test(requestPath)||requestPath==="/api/map/geocode")return next();
  const key=String(req.get("idempotency-key")||"").trim();
  if(!key)return next();
  if(!KEY_PATTERN.test(key))return errorResponse(res,400,"IDEMPOTENCY_KEY_INVALID","Idempotency-Key must be 16 to 128 letters, numbers, dots, colons, underscores or hyphens.");
  try{
    const requestSignature=signature(req);
    const state=await reserve(req.admin.employeeId,key,requestSignature);
    if(state.replay)return res.status(Number(state.record.responseStatus||200)).json(state.record.responseBody);
    if(state.pending)return errorResponse(res,409,"IDEMPOTENCY_IN_PROGRESS","An identical mutation is already being processed. Wait for the original request result.");
    req.mutationIdempotencyId=state.record.mutationIdempotencyId;
    const originalJson=res.json.bind(res);
    let sent=false;
    res.json=function(body){
      if(sent)return res;
      sent=true;
      const status=Number(res.statusCode||200);
      const persist=status<400&&body?.success!==false?complete(req.mutationIdempotencyId,body,status):fail(req.mutationIdempotencyId,body,status);
      Promise.resolve(persist)
        .catch(error=>console.error("Mutation idempotency finalization failed",error))
        .finally(()=>originalJson(body));
      return res;
    };
    return next();
  }catch(error){
    return next(error);
  }
}
module.exports={requireMutationIdempotency,canonical,signature};
