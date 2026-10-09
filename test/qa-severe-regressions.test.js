"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const otp=require("../services/access/otp-client");
const procurement=require("../services/procurement-service");
const reports=require("../services/report-service");
const dashboard=require("../services/dashboard-service");
const Product=require("../models/Product");
const InventoryBalance=require("../models/InventoryBalance");

test("OTP requires explicit verification, even if the service returns generic success",()=>{
 assert.equal(otp.isSuccess({success:true}),false);
 assert.equal(otp.isSuccess({status:"success"}),false);
 assert.equal(otp.isSuccess({data:{verified:true}}),true);
 assert.equal(otp.isSuccess({verified:true,success:false}),false);
 assert.equal(otp.isSuccess({success:true,data:{verified:false},verified:true}),false);
 assert.equal(otp.isSuccess(null),false);
});

test("report boundaries use IST and reject malformed dates",()=>{
 const {from,to}=reports.range({from:"2026-10-09",to:"2026-10-09"});
 assert.equal(from.toISOString(),"2026-10-08T18:30:00.000Z");
 assert.equal(to.toISOString(),"2026-10-09T18:29:59.999Z");
 assert.ok(new Date("2026-10-08T20:00:00Z")>=from);
 assert.ok(new Date("2026-10-09T20:00:00Z")>to);
 for(const day of ["2026-02-30","not-a-date","2026-10-9","2026-13-01"])
  assert.throws(()=>reports.range({from:day,to:"2026-10-09"}),error=>error.status===400);
});

test("supplier key canonicalization and totals are consistent and safe",()=>{
 const id="a".repeat(32);
 assert.equal(procurement.supplierInvoiceKey(id," INV  009 "),procurement.supplierInvoiceKey(id,"inv 009"));
 assert.deepEqual(procurement.validateInvoiceAmounts({taxablePaise:10000,cgstPaise:900,sgstPaise:900,totalInvoicePaise:11800}),{
  taxablePaise:10000,cgstPaise:900,sgstPaise:900,igstPaise:0,cessPaise:0,totalInvoicePaise:11800
 });
 assert.throws(()=>procurement.validateInvoiceAmounts({taxablePaise:10000,cgstPaise:900,sgstPaise:900,totalInvoicePaise:1}),error=>error.code==="INVOICE_TOTAL_MISMATCH");
 assert.throws(()=>procurement.validateInvoiceAmounts({taxablePaise:9007199254740992,totalInvoicePaise:9007199254740992}),error=>error.code==="INVALID_INVOICE_TOTAL");
 assert.equal(procurement.validateInvoiceAmounts({}).totalInvoicePaise,0);
});

test("dashboard low-stock aggregation processes bounded batches and only holds top ten",async()=>{
 const products=Array.from({length:431},(_,i)=>({productId:"p"+String(i).padStart(4,"0"),name:"Product "+i,sku:"SKU"+i,reorderLevel:(i%17)+1}));
 const oldFind=Product.find,oldAggregate=InventoryBalance.aggregate;
 const batchSizes=[];
 Product.find=function(){
  return {select(){return this;},sort(){return this;},lean(){return this;},cursor({batchSize}){assert.equal(batchSize,200);return (async function*(){for(const p of products)yield p;})();}};
 };
 InventoryBalance.aggregate=function(stages){
  const ids=stages[0].$match.productId.$in;
  batchSizes.push(ids.length);
  assert.ok(ids.length<=200);
  return {option(){return Promise.resolve(ids.map(id=>{
   const index=Number(id.slice(1));return{_id:id,availableQty:index%5===0?0:20};
  }));}};
 };
 try{
  const result=await dashboard.lowStock();
  const expected=products.filter((p,i)=>i%5===0).map(p=>({...p,availableQty:0}))
    .sort((a,b)=>-a.reorderLevel+b.reorderLevel||a.productId.localeCompare(b.productId)).slice(0,10);
  assert.equal(result.count,87);
  assert.deepEqual(result.items,expected);
  assert.deepEqual(batchSizes,[200,200,31]);
 }finally{Product.find=oldFind;InventoryBalance.aggregate=oldAggregate;}
});
