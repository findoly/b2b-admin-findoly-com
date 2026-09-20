const audit=require("../services/audit-service");
async function list(req,res,next){try{return res.json({success:true,data:await audit.list(req.query)});}catch(error){return next(error);}}
module.exports={list};
