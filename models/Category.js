"use strict";
const mongoose=require("mongoose");
const uuid=require("../utils/uuid");
const schema=new mongoose.Schema({
 categoryId:{type:String,default:uuid,unique:true,index:true,immutable:true,match:/^[a-f0-9]{32}$/},
 
 name:{type:String,required:true,trim:true,maxlength:120},
 nameKey:{type:String,required:true},
 description:{type:String,default:"",maxlength:2000},
 displayOrder:{type:Number,default:0,min:0,max:100000},
 active:{type:Boolean,default:true,index:true},
 createdBy:{type:String,default:"system"},updatedBy:{type:String,default:"system"}
},{collection:"b2bcategories",timestamps:true,strict:true});
schema.index({nameKey:1},{unique:true});
schema.index({active:1,displayOrder:1,name:1});
module.exports=mongoose.model("B2BCategory",schema,"b2bcategories");
