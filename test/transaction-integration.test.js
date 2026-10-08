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
const Employee=require("../models/Employee");
const CustomerPrice=require("../models/CustomerProductPrice");
const CustomerProductMapping=require("../models/CustomerProductMapping");
const pricingService=require("../services/pricing-service");

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
  await CustomerProductMapping.create({customerId,productId,active:true,createdBy:actor,updatedBy:actor});
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

  await t.test("concurrent picking cannot consume another order's reservation",async()=>{
    const secondId=uuid();
    await SalesOrder.create({
      salesOrderId:secondId,orderNumber:`SO-TXN-SECOND-${Date.now()}`,customerId,
      customerSnapshot:{businessName:"Transaction Test Customer",mobile:"9000000001"},
      deliveryAddressSnapshot:{line1:"1 Test Road",city:"Mumbai",state:"Maharashtra",pincode:"400001"},
      assignedEmployeeId:actor,warehouseId,status:"created",approvalStatus:"not_required",
      lines:[{productId,productName:"Test Product",sku:"TXN-SKU",quantity:2,unitPricePaise:5000,gstRateBps:1800}],
      taxablePaise:10000,gstPaise:1800,totalPaise:11800,gstTreatment:"intra_state",
      createdBy:actor,updatedBy:actor
    });
    await orderService.confirm(secondId,{employeeId:actor,permissions:["orders.create"]});
    const results=await Promise.allSettled([
      orderService.advanceFulfilment(salesOrderId,"picking",actor),
      orderService.advanceFulfilment(salesOrderId,"picking",actor)
    ]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(results.filter(x=>x.status==="rejected").length,1);
    const current=await InventoryBalance.findOne({warehouseId,productId}).lean();
    assert.equal(current.availableQty,5);
    assert.equal(current.reservedQty,2,"another order's reservation must stay intact");
    assert.equal(current.pickedQty,3);
    assert.equal(await InventoryMovement.countDocuments({referenceId:salesOrderId,movementType:"pick"}),1);
    assert.equal((await SalesOrder.findOne({salesOrderId}).lean()).status,"picking");
  });

  await Employee.create({employeeId:actor,name:"Pricing Test Employee",mobile:"9000000002",normalizedMobile:"9000000002",roleId:uuid()});
  await t.test("payment idempotency replays a missing paidAt without double recording cash",async()=>{
    const finance=require("../services/finance-service");
    const Payment=require("../models/Payment");
    const idempotencyKey="qa-payment-retry-"+uuid();
    const payload={idempotencyKey,direction:"receivable",customerId,amountPaise:1500,mode:"bank_transfer",reference:"QA RETRY WITHOUT DATE",allocations:[]};
    const original=await finance.recordPayment(payload,actor);
    await new Promise(resolve=>setTimeout(resolve,15));
    const replay=await finance.recordPayment(payload,actor);
    assert.equal(replay.paymentId,original.paymentId);
    assert.equal(await Payment.countDocuments({idempotencyKey}),1);
    await assert.rejects(finance.recordPayment({...payload,amountPaise:1600},actor),err=>err.status===409&&err.code==="IDEMPOTENCY_KEY_REUSED");
  });
  await t.test("manual adjustment rejects workflow-managed stock without mutation",async()=>{
    const inventory=require("../services/inventory-service");
    const before=await InventoryBalance.findOne({warehouseId,productId}).lean();
    await assert.rejects(inventory.adjust({warehouseId,productId,bucket:"reserved",quantityDelta:-1},actor),err=>err.status===409&&err.code==="WORKFLOW_STOCK_ADJUSTMENT_FORBIDDEN");
    const after=await InventoryBalance.findOne({warehouseId,productId}).lean();
    assert.equal(after.reservedQty,before.reservedQty);
    assert.equal(after.pickedQty,before.pickedQty);
  });

  const admin={employeeId:actor,permissions:["orders.create"]};
  const now=Date.now();
  const baseAgreement={customerId,productId,unitPricePaise:4200,minimumQuantity:5,validFrom:new Date(now-60000),validUntil:null,approvalStatus:"approved",active:true,negotiatedBy:actor,createdBy:actor,updatedBy:actor};
  for(const scenario of [
    {name:"eligible approved agreement",quantity:5,patch:{},expected:4200,source:"negotiated"},
    {name:"below agreement minimum quantity",quantity:4,patch:{},expected:5000,source:"reference"},
    {name:"pending agreement",quantity:5,patch:{approvalStatus:"pending"},expected:5000,source:"reference"},
    {name:"expired agreement",quantity:5,patch:{validUntil:new Date(now-1000)},expected:5000,source:"reference"},
    {name:"future agreement",quantity:5,patch:{validFrom:new Date(now+86400000)},expected:5000,source:"reference"},
    {name:"inactive agreement",quantity:5,patch:{active:false},expected:5000,source:"reference"},
    {name:"other customer agreement",quantity:5,patch:{customerId:uuid()},expected:5000,source:"reference"},
    {name:"zero negotiated price",quantity:5,patch:{unitPricePaise:0},expected:0,source:"negotiated"}
  ]){
    await t.test(scenario.name,async()=>{
      await CustomerPrice.deleteMany({});
      const agreement=await CustomerPrice.create({...baseAgreement,...scenario.patch});
      const quote=await pricingService.orderPrice({customerId,productId,quantity:scenario.quantity});
      assert.equal(quote.unitPricePaise,scenario.expected);assert.equal(quote.source,scenario.source);
      const order=await orderService.create({customerId,warehouseId,lines:[{productId,quantity:scenario.quantity}]},admin);
      assert.equal(order.lines[0].unitPricePaise,quote.unitPricePaise);
      assert.equal(order.lines[0].customerProductPriceId,scenario.source==="negotiated"?agreement.customerProductPriceId:"");
      assert.equal(order.lines[0].priceException,false);
    });
  }
  await t.test("latest eligible agreement wins and manual overrides retain approval checks",async()=>{
    await CustomerPrice.deleteMany({});
    const older=await CustomerPrice.create({...baseAgreement,minimumQuantity:1,unitPricePaise:4500});
    await CustomerPrice.create({...baseAgreement,validFrom:new Date(now-30000)});
    const quote=await pricingService.orderPrice({customerId,productId,quantity:1});
    assert.equal(quote.unitPricePaise,4500);assert.equal(quote.customerProductPriceId,older.customerProductPriceId);
    const automatic=await orderService.create({customerId,warehouseId,lines:[{productId,quantity:1}]},admin);
    assert.equal(automatic.lines[0].unitPricePaise,4500);assert.equal(automatic.lines[0].customerProductPriceId,older.customerProductPriceId);
    const overridden=await orderService.create({customerId,warehouseId,lines:[{productId,quantity:1,unitPricePaise:4000}]},admin);
    assert.equal(overridden.lines[0].unitPricePaise,4000);assert.equal(overridden.lines[0].priceException,true);assert.equal(overridden.approvalStatus,"pending");
  });

  await t.test("streamed business reporting agrees with MongoDB order totals",async()=>{
    const reports=require("../services/report-service");
    const today=new Date().toISOString().slice(0,10);
    const result=await reports.businessSummary({from:today,to:today});
    const orders=await SalesOrder.find({status:{$ne:"cancelled"},orderType:{$ne:"replacement"}}).lean();
    const netSales=orders.reduce((sum,order)=>sum+Number(order.taxablePaise||0),0);
    const cost=orders.reduce((sum,order)=>sum+(order.lines||[]).reduce((lineSum,line)=>lineSum+Number(line.stockReservedQty||0)*Number(line.stockUnitCostPaise||0),0),0);
    assert.equal(result.salesOrderCount,orders.length);
    assert.equal(result.netSalesPaise,netSales);
    assert.equal(result.stockCostPaise,cost);
    assert.equal(result.agentPerformance.reduce((sum,agent)=>sum+agent.orderCount,0),orders.length);
  });

});
