const mongoose=require("mongoose"); const uuid=require("../utils/uuid");
const schema=new mongoose.Schema({
  customerProductMappingId:{type:String,default:uuid,unique:true,index:true,immutable:true,match:/^[a-f0-9]{32}$/},
  customerId:{type:String,required:true,index:true},
  productId:{type:String,required:true,index:true},
  active:{type:Boolean,default:true,index:true},
  notes:{type:String,default:"",maxlength:2000},
  createdBy:{type:String,required:true},
  updatedBy:{type:String,required:true}
},{collection:"b2bcustomerproductmappings",timestamps:true,strict:true});
schema.index({customerId:1,productId:1},{unique:true});
schema.index({customerId:1,active:1,createdAt:-1});
schema.index({productId:1,active:1,createdAt:-1});
module.exports=mongoose.model("B2BCustomerProductMapping",schema,"b2bcustomerproductmappings");
