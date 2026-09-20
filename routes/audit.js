const r=require("express").Router();
const c=require("../controllers/auditController");
const {requirePermission}=require("../middleware/auth");
r.get("/",requirePermission("audit.view"),c.list);
module.exports=r;
