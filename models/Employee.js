const mongoose = require("mongoose");
const uuid = require("../utils/uuid");
const schema = new mongoose.Schema({
  employeeId: { type:String, default:uuid, unique:true, index:true, immutable:true, match:/^[a-f0-9]{32}$/ },
  name:{type:String,required:true,trim:true,maxlength:120}, mobile:{type:String,required:true,trim:true,match:/^[6-9]\d{9}$/}, normalizedMobile:{type:String,required:true,unique:true,index:true,match:/^[6-9]\d{9}$/},
  email:{type:String,default:"",trim:true,lowercase:true,maxlength:254}, employeeCode:{type:String,default:"",trim:true,uppercase:true,maxlength:40,index:true}, designation:{type:String,default:"",trim:true,maxlength:120}, department:{type:String,default:"",trim:true,maxlength:120,index:true},
  roleId:{type:String,required:true,index:true,match:/^[a-f0-9]{32}$/}, warehouseIds:{type:[String],default:[],validate:{validator:v=>Array.isArray(v)&&v.every(x=>/^[a-f0-9]{32}$/.test(String(x))),message:"Invalid warehouse assignment"}}, deliveryEligible:{type:Boolean,default:true,index:true}, status:{type:String,enum:["active","inactive","suspended"],default:"active",index:true}, notes:{type:String,default:"",maxlength:5000}, lastLoginAt:{type:Date,default:null}, createdBy:{type:String,default:"system"}, updatedBy:{type:String,default:"system"}
},{collection:"b2bemployees",timestamps:true,strict:true});
schema.index({status:1,roleId:1,createdAt:-1});
schema.index({status:1,deliveryEligible:1,name:1});
schema.index({warehouseIds:1,status:1});
module.exports = mongoose.model("B2BEmployee", schema, "b2bemployees");
