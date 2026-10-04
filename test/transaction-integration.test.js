"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const mongoose=require("mongoose");
const Customer=require("../models/Customer");
const Warehouse=require("../models/Warehouse");
const SalesOrder=require("../models/SalesOrder");
const InventoryBalance=require("../models/InventoryBalance");
const InventoryMovement=require("../models/InventoryMovement");
const Product=require("../models/Product");
const orderService=require("../services/order-service");
const uuid=require("../utils/uuid");

test("order confirmation reserves stock inside a real Mongo transaction",async(t)=>{
  const uri=String(process.env.MONGODB_URI||"").trim();
  if(!uri){t.skip("MONGODB_URI is not configured");return;}
  await mongoose.connect(uri,{serverSelectionTimeoutMS:10000});
  t.after(async()=>{await mongoose.connection.dropDatabase();await mongoose.disconnect();});

  const actor=uuid(),customerId=uuid(),warehouseId=uuid(),secondaryWarehouseId=uuid(),productId=uuid(),salesOrderId=uuid();
  await Customer.create({
    customerId,
    businessName:"Transaction Test Customer",
    contactName:"Test",
    mobile:"9000000001",
    normalizedMobile:"9000000001",
    billingAddress:{line1:"1 Test Road",city:"Mumbai",state:"Maharashtra",pincode:"400001"},
    deliveryAddresses:[],
    creditLimitPaise:500000,
    creditHold:false
  });
  await Product.create({productId,sku:"TXN-SKU",name:"Test Product",referenceSellingPricePaise:5000,minimumSellingPricePaise:0});
  await Warehouse.insertMany([
    {warehouseId,name:"Transaction Test Warehouse",code:"TXN"},
    {warehouseId:secondaryWarehouseId,name:"Transaction Low Stock Warehouse",code:"TXL"}
  ]);
  await InventoryBalance.insertMany([
    {warehouseId,productId,availableQty:10,reservedQty:0,averageCostPaise:2500,updatedBy:actor},
    {warehouseId:secondaryWarehouseId,productId,availableQty:2,reservedQty:0,averageCostPaise:2600,updatedBy:actor}
  ]);

  const availability=await orderService.warehouseAvailability({lines:[{productId,quantity:3}]});
  assert.equal(availability.recommendedWarehouseId,warehouseId);
  assert.equal(availability.warehouses[0].canFulfilAll,true);
  assert.equal(availability.warehouses[0].lines[0].availableQty,10);
  assert.equal(availability.warehouses[1].shortageQty,1);
  await SalesOrder.create({
    salesOrderId,
    orderNumber:`SO-TXN-${Date.now()}`,
    customerId,
    customerSnapshot:{businessName:"Transaction Test Customer",mobile:"9000000001"},
    deliveryAddressSnapshot:{line1:"1 Test Road",city:"Mumbai",state:"Maharashtra",pincode:"400001"},
    assignedEmployeeId:actor,
    warehouseId,
    status:"created",
    approvalStatus:"not_required",
    lines:[{productId,productName:"Test Product",sku:"TXN-SKU",quantity:3,unitPricePaise:5000,gstRateBps:1800}],
    taxablePaise:15000,
    gstPaise:2700,
    totalPaise:17700,
    gstTreatment:"intra_state",
    createdBy:actor,
    updatedBy:actor
  });

  const confirmed=await orderService.confirm(salesOrderId,{employeeId:actor,permissions:["orders.create"]});
  assert.equal(confirmed.status,"stock_ready");
  assert.equal(confirmed.lines[0].stockReservedQty,3);

  const balance=await InventoryBalance.findOne({warehouseId,productId}).lean();
  assert.equal(balance.availableQty,7);
  assert.equal(balance.reservedQty,3);

  const movement=await InventoryMovement.findOne({referenceId:salesOrderId,movementType:"reserve"}).lean();
  assert.ok(movement);
  assert.equal(movement.quantityDelta,3);
});
