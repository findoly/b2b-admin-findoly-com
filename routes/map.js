const r=require("express").Router();const c=require("../controllers/mapController");const{requireAnyPermission}=require("../middleware/auth");const{rateLimit}=require("express-rate-limit");
r.use(requireAnyPermission("customers.view","inventory.view","suppliers.view"));
r.get("/config",c.config);r.get("/locations",c.list);
const geocodeLimiter=rateLimit({windowMs:60000,limit:10,keyGenerator:req=>req.admin.employeeId,standardHeaders:"draft-8",legacyHeaders:false,handler:(req,res)=>res.status(429).json({success:false,message:"Please wait before looking up more addresses."})});
r.post("/geocode",geocodeLimiter,c.preview);r.put("/location",c.save);
module.exports=r;
