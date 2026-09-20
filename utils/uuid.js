const crypto=require("crypto");
function uuid(){return crypto.randomUUID().replace(/-/g,"");}
module.exports=uuid;
