"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {pageQuery}=require("../utils/pagination");
const {encodeSession,decodeSession}=require("../middleware/auth");
const AdminSession=require("../models/AdminSession");
const Mapping=require("../models/CustomerProductMapping");
const mappingService=require("../services/customer-product-mapping-service");

test("pagination rejects fractional, NaN and infinite offsets while bounding valid values",()=>{
  for(const page of ["2.5","Infinity","nan",-1,null])assert.equal(pageQuery({page}).page,1);
  assert.deepEqual(pageQuery({page:"3",limit:"10"}),{page:3,limit:10,skip:20});
  assert.deepEqual(pageQuery({page:"999999",limit:"1000"}),{page:100000,limit:100,skip:9999900});
  assert.equal(pageQuery({limit:"0"}).limit,1);
});

test("admin session model uses a unique per-device ID and expires server-side",()=>{
  assert.ok(AdminSession.schema.path("sessionId").options.unique);
  assert.ok(AdminSession.schema.indexes().some(([fields,options])=>fields.expiresAt===1&&options.expireAfterSeconds===0));
  const payload={v:1,employeeId:"a".repeat(32),sessionId:"b".repeat(32),iat:100,exp:1000};
  assert.equal(decodeSession(encodeSession(payload)).sessionId,payload.sessionId);
});

test("customer-product mapping accepts explicit false from JSON and forms",async()=>{
  const oldUpdate=Mapping.findOneAndUpdate;let patch;
  Mapping.findOneAndUpdate=async(_filter,update)=>{patch=update.$set;return {toObject:()=>patch};};
  try{
    const id="a".repeat(32),mappingId="b".repeat(32);
    await mappingService.update(id,mappingId,{active:"false"},"employee");
    assert.equal(patch.active,false);
    await mappingService.update(id,mappingId,{active:false},"employee");
    assert.equal(patch.active,false);
  }finally{Mapping.findOneAndUpdate=oldUpdate;}
});
