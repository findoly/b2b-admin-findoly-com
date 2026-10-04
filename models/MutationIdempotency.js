const mongoose=require("mongoose");
const uuid=require("../utils/uuid");
const schema=new mongoose.Schema({
  mutationIdempotencyId:{type:String,default:uuid,unique:true,index:true,immutable:true,match:/^[a-f0-9]{32}$/},
  actorEmployeeId:{type:String,required:true,index:true},
  idempotencyKey:{type:String,required:true,trim:true,maxlength:128},
  requestSignature:{type:String,required:true,maxlength:64},
  status:{type:String,enum:["pending","completed","failed"],default:"pending",index:true},
  responseStatus:{type:Number,default:0},
  responseBody:{type:mongoose.Schema.Types.Mixed,default:null},
  failureCode:{type:String,default:""},
  expiresAt:{type:Date,required:true,index:true}
},{collection:"b2bmutationidempotency",timestamps:true,strict:true});
schema.index({actorEmployeeId:1,idempotencyKey:1},{unique:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model("B2BMutationIdempotency",schema,"b2bmutationidempotency");
