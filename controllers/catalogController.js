const catalog=require("../services/catalog-service");
const audit=require("../services/audit-service");
exports.list=async(req,res,next)=>{try{res.json({success:true,data:await catalog.list(req.params.kind,req.query)});}catch(e){next(e);}};
exports.save=async(req,res,next)=>{try{const before=req.params.id?await catalog.get(req.params.kind,req.params.id):null;const data=await catalog.save(req.params.kind,req.params.id,req.body,req.admin.employeeId);await audit.record(req,{action:"catalog.save",entityType:req.params.kind,entityId:data.subcategoryId||data.categoryId,before,after:data});res.status(before?200:201).json({success:true,data});}catch(e){next(e);}};
