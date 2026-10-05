"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const Category=require("../models/Category");const Subcategory=require("../models/Subcategory");const Customer=require("../models/Customer");const MapLocation=require("../models/MapLocation");
const catalog=require("../services/catalog-service");const locations=require("../services/location-service");const insights=require("../services/sales-insights-service");
const id="a".repeat(32),subId="b".repeat(32),otherId="c".repeat(32);
const actor={employeeId:"d".repeat(32),permissions:["customers.view","customers.edit"]};
const address={line1:"12 Test Street",city:"Mumbai",state:"Maharashtra",pincode:"400001"};
function query(value){return{lean:async()=>value,select(){return this;},limit(){return this;}};}

test("taxonomy prevents wrong-parent assignments and allows explicitly clearing an old subcategory",async(t)=>{
 t.mock.method(Category,"findOne",()=>query({categoryId:id,name:"Grocery",active:true}));
 t.mock.method(Subcategory,"findOne",filter=>query(filter.categoryId===id&&filter.subcategoryId===subId?{categoryId:id,subcategoryId:subId,name:"Rice",active:true}:null));
 const current={categoryId:id,subcategoryId:subId,category:"Grocery",subcategory:"Rice"};
 const cleared=await catalog.resolveProduct({categoryId:id,subcategoryId:"",subcategory:"Rice"},current);
 assert.equal(cleared.subcategoryId,"");assert.equal(cleared.subcategory,"");
 await assert.rejects(catalog.resolveProduct({categoryId:id,subcategoryId:otherId}),/does not belong/);
 const valid=await catalog.resolveProduct({categoryId:id,subcategoryId:subId});assert.equal(valid.subcategory,"Rice");
});
test("inactive taxonomy can remain on existing products but cannot be newly assigned",async(t)=>{
 t.mock.method(Category,"findOne",()=>query({categoryId:id,name:"Old category",active:false}));
 await assert.rejects(catalog.resolveProduct({categoryId:id}),/inactive/);
 assert.equal((await catalog.resolveProduct({categoryId:id},{categoryId:id})).categoryId,id);
});
test("old clients preserve unchanged legacy product classifications without implicitly creating categories",async()=>{
 const current={category:"Legacy",subcategory:"Original"};assert.deepEqual(await catalog.resolveProduct({category:"Legacy",subcategory:"Original"},current),{categoryId:"",subcategoryId:"",category:"Legacy",subcategory:"Original"});
});
test("catalogue matching normalizes case and whitespace without merging different spelling",()=>{
 assert.equal(catalog.nameKey("  Food   GRAINS "),catalog.nameKey("food grains"));assert.notEqual(catalog.nameKey("Rice"),catalog.nameKey("Rice flour"));
});
test("known coordinates require both finite values and preserve valid zero coordinates",()=>{
 for(const input of [{latitude:"",longitude:0},{latitude:null,longitude:0},{latitude:true,longitude:0},{latitude:91,longitude:0},{latitude:0,longitude:181},{latitude:"NaN",longitude:0}])assert.throws(()=>locations.coordinates(input));
 assert.deepEqual(locations.coordinates({latitude:"0",longitude:"0"}),{latitude:0,longitude:0});
});
test("location permissions follow source record access",()=>{
 assert.doesNotThrow(()=>locations.access(actor,"customer",true));assert.throws(()=>locations.access(actor,"supplier"),{status:403});assert.throws(()=>locations.access({permissions:["customers.view"]},"customer",true),{status:403});
});
test("address edits invalidate the fingerprint while irrelevant contact changes do not",()=>{
 assert.notEqual(locations.addressHash(address),locations.addressHash({...address,pincode:"400002"}));assert.equal(locations.addressHash(address),locations.addressHash({...address,contactName:"Someone else"}));
});
test("signed location previews reject altered or expired payloads",()=>{
 const signed=locations.signPreview({key:"test",exp:Date.now()+60000});assert.equal(locations.readPreview(signed).key,"test");assert.throws(()=>locations.readPreview(signed+"extra"));assert.throws(()=>locations.readPreview(locations.signPreview({exp:Date.now()-1})),/expired/);
});
test("location saves reject stale addresses and cross-user preview tokens before writing",async(t)=>{
 t.mock.method(Customer,"findOne",()=>query({businessName:"Shop",billingAddress:address}));let writes=0;t.mock.method(MapLocation,"findOneAndUpdate",()=>{writes++;return query({});});
 const input={entityType:"customer",entityId:id,addressSlot:"billing",addressHash:"stale",source:"manual",latitude:19,longitude:73};
 await assert.rejects(locations.save(actor,input),/address changed/);
 const hash=locations.addressHash(address),token=locations.signPreview({employeeId:otherId,key:`customer:${id}:billing`,addressHash:hash,exp:Date.now()+60000,candidates:[{latitude:19,longitude:73}]});
 await assert.rejects(locations.save(actor,{...input,addressHash:hash,source:"google",token,candidateIndex:0}),/different address or user/);assert.equal(writes,0);
});
test("confirmed Google pins receive an expiry and manual coordinates do not",async(t)=>{
 t.mock.method(Customer,"findOne",()=>query({businessName:"Shop",billingAddress:address}));let update;
 t.mock.method(MapLocation,"findOneAndUpdate",(filter,value)=>{update=value.$set;return query({mapLocationId:otherId,...update});});
 const input={entityType:"customer",entityId:id,addressSlot:"billing",addressHash:locations.addressHash(address)};
 const token=locations.signPreview({employeeId:actor.employeeId,key:`customer:${id}:billing`,addressHash:input.addressHash,exp:Date.now()+60000,candidates:[{latitude:19,longitude:73,placeId:"place"}]});
 await locations.save(actor,{...input,source:"google",token,candidateIndex:0});assert.ok(update.expiresAt>Date.now());assert.ok(update.expiresAt-Date.now()<30*86400000);
 await locations.save(actor,{...input,source:"manual",latitude:19,longitude:73});assert.equal(update.expiresAt,null);assert.equal(update.placeId,"");
});
test("Google lookup failures do not write coordinates or overwrite the entered address",async(t)=>{
 t.mock.method(Customer,"findOne",()=>query({businessName:"Shop",billingAddress:address}));let writes=0;t.mock.method(MapLocation,"findOneAndUpdate",()=>{writes++;});
 const before=process.env.GOOGLE_MAPS_GEOCODING_KEY;process.env.GOOGLE_MAPS_GEOCODING_KEY="test-key";t.after(()=>{if(before===undefined)delete process.env.GOOGLE_MAPS_GEOCODING_KEY;else process.env.GOOGLE_MAPS_GEOCODING_KEY=before;});
 t.mock.method(globalThis,"fetch",async()=>({ok:true,json:async()=>({status:"ZERO_RESULTS",results:[]})}));
 const result=await locations.preview(actor,{entityType:"customer",entityId:id,addressSlot:"billing",addressHash:locations.addressHash(address)});assert.deepEqual(result.candidates,[]);assert.equal(writes,0);
});
test("insights use inclusive India-local dates and reject invalid date ranges",()=>{
 const range=insights.dateRange({from:"2026-10-01",to:"2026-10-01"});assert.equal(range.start.toISOString(),"2026-09-30T18:30:00.000Z");assert.equal(range.end.toISOString(),"2026-10-01T18:29:59.999Z");
 for(const query of [{from:"2026-02-30",to:"2026-03-01"},{from:"2026-10-02",to:"2026-10-01"},{from:"2020-01-01",to:"2026-01-01"}])assert.throws(()=>insights.dateRange(query));
});
test("insights reject arbitrary grouping and keep demand/invoice sources separate",()=>{
 assert.throws(()=>insights.pipeline({dimension:"$where"}),/Invalid/);
 const order=insights.pipeline({mode:"orders"}),invoice=insights.pipeline({mode:"invoices"});
 assert.deepEqual(order.stages[0].$match.status,{$nin:["cancelled","draft"]});assert.deepEqual(order.stages[0].$match.orderType,{$ne:"replacement"});assert.equal(invoice.stages[0].$match.status,"issued");
 assert.equal(invoice.stages.find(x=>x.$project).$project.valuePaise,"$lines.taxablePaise");
 // Group by document before category so two product lines in one order count once.
 const groups=order.stages.at(-1).$facet.items;assert.deepEqual(groups[0].$group._id,{group:"$groupKey",document:"$documentId"});assert.deepEqual(groups[1].$group.orderCount,{$sum:1});
});
