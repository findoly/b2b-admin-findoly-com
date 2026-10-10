"use strict";
const mongoose=require("mongoose");
const uuid=require("../utils/uuid");
const schema=new mongoose.Schema({
  sessionId:{type:String,default:uuid,required:true,immutable:true,unique:true,index:true,match:/^[a-f0-9]{32}$/},
  employeeId:{type:String,required:true,index:true,match:/^[a-f0-9]{32}$/},
  expiresAt:{type:Date,required:true},
  revokedAt:{type:Date,default:null}
},{collection:"b2badminsessions",timestamps:true,strict:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
schema.index({employeeId:1,revokedAt:1,expiresAt:1});
module.exports=mongoose.model("B2BAdminSession",schema,"b2badminsessions");
