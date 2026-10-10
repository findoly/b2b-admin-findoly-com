"use strict";
const mongoose=require("mongoose");
const uuid=require("../utils/uuid");
const schema=new mongoose.Schema({
  paymentAdjustmentId:{type:String,default:uuid,required:true,unique:true,immutable:true,index:true,match:/^[a-f0-9]{32}$/},
  paymentId:{type:String,required:true,index:true,match:/^[a-f0-9]{32}$/},
  action:{type:String,required:true,enum:["allocation","reversal"]},
  documentType:{type:String,required:true,enum:["customer_invoice","supplier_bill"]},
  documentId:{type:String,required:true,index:true},
  amountPaise:{type:Number,required:true,min:1},
  reason:{type:String,required:true,minlength:10,maxlength:1000},
  actorEmployeeId:{type:String,required:true,index:true}
},{collection:"b2bpaymentadjustments",timestamps:true,strict:true});
schema.index({paymentId:1,createdAt:1});
module.exports=mongoose.model("B2BPaymentAdjustment",schema,"b2bpaymentadjustments");
