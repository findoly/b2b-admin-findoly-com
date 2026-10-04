const mongoose=require("mongoose");
const uuid=require("../utils/uuid");
const schema=new mongoose.Schema({
  otpRateLimitId:{type:String,default:uuid,unique:true,index:true,immutable:true,match:/^[a-f0-9]{32}$/},
  bucketKey:{type:String,required:true,unique:true,index:true,maxlength:128},
  count:{type:Number,required:true,default:0,min:0},
  expiresAt:{type:Date,required:true,index:true}
},{collection:"b2botpratelimits",timestamps:true,strict:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model("B2BOtpRateLimit",schema,"b2botpratelimits");
