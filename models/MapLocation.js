"use strict";
const mongoose=require("mongoose");const uuid=require("../utils/uuid");
const schema=new mongoose.Schema({
 mapLocationId:{type:String,default:uuid,unique:true,index:true,immutable:true,match:/^[a-f0-9]{32}$/},
 entityType:{type:String,enum:["customer","warehouse","supplier"],required:true},
 entityId:{type:String,required:true,match:/^[a-f0-9]{32}$/},
 addressSlot:{type:String,required:true,maxlength:100},
 addressHash:{type:String,required:true,maxlength:64},
 latitude:{type:Number,required:true,min:-90,max:90},longitude:{type:Number,required:true,min:-180,max:180},
 source:{type:String,enum:["google","manual"],required:true},
 placeId:{type:String,default:"",maxlength:512},
 confirmedAt:{type:Date,required:true},expiresAt:{type:Date,default:null},
 updatedBy:{type:String,required:true}
},{collection:"b2bmaplocations",timestamps:true,strict:true});
schema.index({entityType:1,entityId:1,addressSlot:1},{unique:true});
// Expired Google coordinates are removed; reads also exclude them immediately.
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model("B2BMapLocation",schema,"b2bmaplocations");
