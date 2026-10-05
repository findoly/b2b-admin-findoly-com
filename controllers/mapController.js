const service=require("../services/location-service");const audit=require("../services/audit-service");
exports.config=(req,res)=>res.json({success:true,data:service.publicConfig(req.admin)});
exports.list=async(req,res,next)=>{try{res.json({success:true,data:await service.list(req.admin,req.query)});}catch(e){next(e);}};
exports.preview=async(req,res,next)=>{try{const data=await service.preview(req.admin,req.body);await audit.record(req,{action:"map.geocode",entityType:"map_location",entityId:req.body.entityId,after:{resultCount:data.candidates.length}});res.json({success:true,data});}catch(e){next(e);}};
exports.save=async(req,res,next)=>{try{const data=await service.save(req.admin,req.body);await audit.record(req,{action:"map.pin_save",entityType:"map_location",entityId:data.mapLocationId,after:{source:data.location.source,addressHash:req.body.addressHash}});res.json({success:true,data});}catch(e){next(e);}};
