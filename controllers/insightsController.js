const service=require("../services/sales-insights-service");
exports.summary=async(req,res,next)=>{try{res.json({success:true,data:await service.summary(req.query)});}catch(e){next(e);}};
