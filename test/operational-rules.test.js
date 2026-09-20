"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const SalesOrder=require("../models/SalesOrder");
const Delivery=require("../models/DeliveryAssignment");
const GoodsReceipt=require("../models/GoodsReceipt");
const Return=require("../models/Return");
const {ALLOWED_TRANSITIONS}=require("../services/delivery-service");

test("sales orders carry cancellation audit metadata",()=>{
  for(const field of["cancellationReason","cancelledBy","cancelledAt"])assert.ok(SalesOrder.schema.path(field),field);
});

test("delivery assignments track per-line delivered and returned quantities",()=>{
  const line=Delivery.schema.path("lines").schema;
  for(const field of["deliveryLineId","salesOrderLineId","productId","quantity","deliveredQty","returnedQty"])assert.ok(line.path(field),field);
});

test("delivery status transitions are explicit and terminal states cannot move",()=>{
  assert.deepEqual(ALLOWED_TRANSITIONS.assigned,["picked_up","cancelled"]);
  assert.deepEqual(ALLOWED_TRANSITIONS.failed,["out_for_delivery","returned"]);
  assert.deepEqual(ALLOWED_TRANSITIONS.delivered,[]);
  assert.deepEqual(ALLOWED_TRANSITIONS.partially_delivered,[]);
  assert.deepEqual(ALLOWED_TRANSITIONS.returned,[]);
  assert.deepEqual(ALLOWED_TRANSITIONS.cancelled,[]);
});

test("GRN lines preserve shortage without adding it to stock",()=>{
  const line=GoodsReceipt.schema.path("lines").schema;
  assert.ok(line.path("shortQty"));
  assert.equal(line.path("shortQty").options.min,0);
  const source=fs.readFileSync(path.join(__dirname,"../services/procurement-service.js"),"utf8");
  assert.match(source,/accepted\+damaged\+rejected!==received/);
  assert.match(source,/received\+shortQty>outstanding/);
  assert.doesNotMatch(source,/availableQty:shortQty/);
});

test("supplier returns identify the inventory source bucket",()=>{
  const line=Return.schema.path("lines").schema;
  assert.deepEqual(line.path("sourceBucket").options.enum,["available","damaged","returned"]);
  const source=fs.readFileSync(path.join(__dirname,"../services/return-service.js"),"utf8");
  assert.match(source,/movementType:"supplier_return"/);
  assert.match(source,/quantityDelta:-line\.quantity/);
});

test("order cancellation and stock recheck remain transactional",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../services/order-service.js"),"utf8");
  assert.match(source,/async function recheckStock/);
  assert.match(source,/async function cancel/);
  assert.match(source,/movementType:"release"/);
  assert.match(source,/startSession\(\)/);
});
