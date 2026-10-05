const r=require("express").Router();const c=require("../controllers/catalogController");const{requirePermission}=require("../middleware/auth");
r.get("/:kind",requirePermission("products.view"),c.list);
r.post("/:kind",requirePermission("categories.manage"),c.save);
r.put("/:kind/:id",requirePermission("categories.manage"),c.save);
module.exports=r;
