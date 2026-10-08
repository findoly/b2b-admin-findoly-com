const catalog=require("./catalog-service");
const {effectiveAgreementQuery}=require("./pricing-service");
const mongoose=require("mongoose");const SalesOrder=require("../models/SalesOrder");const Customer=require("../models/Customer");const Product=require("../models/Product");const CustomerPrice=require("../models/CustomerProductPrice");const CustomerProductMapping=require("../models/CustomerProductMapping");const Warehouse=require("../models/Warehouse");const InventoryBalance=require("../models/InventoryBalance");const InventoryMovement=require("../models/InventoryMovement");const ProcurementAllocation=require("../models/ProcurementAllocation");const Invoice=require("../models/Invoice");const Supplier=require("../models/Supplier");const Employee=require("../models/Employee");const SupplierLocation=require("../models/SupplierLocation");const Offer=require("../models/SupplierProductOffer");const uuid=require("../utils/uuid");const {invoiceTotals}=require("../utils/money");const {pageQuery,escapedRegex}=require("../utils/pagination");const {requiredUuid,positiveInteger,nonNegativeInteger,basisPoints}=require("../utils/validation");const {hasPermission}=require("../utils/permissions");
function orderNumber(){return `SO-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${uuid().slice(0,8).toUpperCase()}`;}
const OPEN_CREDIT_STATUSES=["draft","created","confirmed","procurement_required","procurement_in_progress","stock_ready","picking","packed","ready_for_dispatch","assigned_for_delivery","out_for_delivery","delivered","partially_delivered","delivery_failed"];
function warehouseView(w){return w?{warehouseId:w.warehouseId,name:w.name,code:w.code,address:w.address||{},active:w.active!==false}:null;}
async function warehouseOptions(){return Warehouse.find({active:true}).select({warehouseId:1,name:1,code:1,address:1,active:1}).sort({name:1}).limit(500).lean();}
async function warehouseAvailability(input={}){
  let rawLines=input.lines;
  if(typeof rawLines==="string"){try{rawLines=JSON.parse(rawLines);}catch(_){throw Object.assign(new Error("Product selection is invalid"),{status:400,code:"INVALID_WAREHOUSE_AVAILABILITY_LINES"});}}
  if(!Array.isArray(rawLines)||!rawLines.length)throw Object.assign(new Error("Select at least one product before choosing a warehouse"),{status:400});
  const lines=rawLines.map(raw=>({productId:requiredUuid(raw.productId,"Product"),quantity:positiveInteger(raw.quantity,"Quantity")}));
  const productIds=lines.map(x=>x.productId);
  if(new Set(productIds).size!==productIds.length)throw Object.assign(new Error("The same product cannot appear more than once on a sales order"),{status:400,code:"DUPLICATE_ORDER_PRODUCT"});
  const[products,warehouses]=await Promise.all([
    Product.find({productId:{$in:productIds},status:"active"}).select({productId:1,name:1,sku:1}).lean(),
    Warehouse.find({active:true}).select({warehouseId:1,name:1,code:1,address:1,active:1}).sort({name:1}).limit(500).lean()
  ]);
  if(products.length!==productIds.length)throw Object.assign(new Error("One or more selected products are unavailable"),{status:404});
  if(!warehouses.length)return{recommendedWarehouseId:"",warehouses:[]};
  const warehouseIds=warehouses.map(x=>x.warehouseId);
  const balances=await InventoryBalance.find({warehouseId:{$in:warehouseIds},productId:{$in:productIds}}).select({warehouseId:1,productId:1,availableQty:1}).lean();
  const productById=new Map(products.map(x=>[x.productId,x]));
  const balanceByKey=new Map(balances.map(x=>[`${x.warehouseId}:${x.productId}`,Math.max(0,Number(x.availableQty||0))]));
  const requestedQty=lines.reduce((sum,x)=>sum+x.quantity,0);
  const candidates=warehouses.map(warehouse=>{
    let coveredQty=0,totalAvailableQty=0;
    const lineAvailability=lines.map(line=>{
      const availableQty=balanceByKey.get(`${warehouse.warehouseId}:${line.productId}`)||0;
      const covered=Math.min(line.quantity,availableQty),shortageQty=Math.max(0,line.quantity-availableQty),product=productById.get(line.productId);
      coveredQty+=covered;totalAvailableQty+=availableQty;
      return{productId:line.productId,productName:product?.name||"",sku:product?.sku||"",requestedQty:line.quantity,availableQty,shortageQty};
    });
    const shortageQty=requestedQty-coveredQty;
    return{...warehouseView(warehouse),canFulfilAll:shortageQty===0,requestedQty,coveredQty,shortageQty,totalAvailableQty,lines:lineAvailability};
  });
  candidates.sort((a,b)=>Number(b.canFulfilAll)-Number(a.canFulfilAll)||a.shortageQty-b.shortageQty||b.coveredQty-a.coveredQty||b.totalAvailableQty-a.totalAvailableQty||String(a.name||"").localeCompare(String(b.name||"")));
  return{recommendedWarehouseId:candidates[0]?.warehouseId||"",warehouses:candidates};
}
async function list(query={}){const{page,limit,skip}=pageQuery(query);const filter={};if(query.status)filter.status=query.status;if(query.customerId)filter.customerId=query.customerId;if(query.assignedEmployeeId)filter.assignedEmployeeId=query.assignedEmployeeId;if(query.search){const rx=new RegExp(escapedRegex(query.search),"i");filter.$or=[{orderNumber:rx},{"customerSnapshot.businessName":rx}];}const[items,total]=await Promise.all([SalesOrder.find(filter).sort({createdAt:-1}).skip(skip).limit(limit).lean(),SalesOrder.countDocuments(filter)]);const warehouseIds=[...new Set(items.map(x=>x.warehouseId).filter(Boolean))];const warehouses=warehouseIds.length?await Warehouse.find({warehouseId:{$in:warehouseIds}}).select({warehouseId:1,name:1,code:1,address:1,active:1}).limit(warehouseIds.length).lean():[];const byWarehouse=new Map(warehouses.map(x=>[x.warehouseId,x]));return{items:items.map(x=>({...x,warehouseSnapshot:warehouseView(byWarehouse.get(x.warehouseId))})),page,limit,total,pages:Math.ceil(total/limit)||1};}
async function get(id){const[order,allocations]=await Promise.all([SalesOrder.findOne({salesOrderId:id}).lean(),ProcurementAllocation.find({salesOrderId:id}).sort({createdAt:1}).lean()]);if(!order)throw Object.assign(new Error("Sales order not found"),{status:404});const warehouse=order.warehouseId?await Warehouse.findOne({warehouseId:order.warehouseId}).select({warehouseId:1,name:1,code:1,address:1,active:1}).lean():null;return{...order,warehouseSnapshot:warehouseView(warehouse),procurementAllocations:allocations};}
async function create(input,admin){const customerId=requiredUuid(input.customerId,"Customer"),warehouseId=requiredUuid(input.warehouseId,"Warehouse"),assignedEmployeeId=requiredUuid(input.assignedEmployeeId||admin.employeeId,"Assigned employee");if(!Array.isArray(input.lines)||!input.lines.length)throw Object.assign(new Error("At least one order line is required"),{status:400});const productIds=input.lines.map(x=>requiredUuid(x.productId,"Product"));if(new Set(productIds).size!==productIds.length)throw Object.assign(new Error("The same product cannot appear more than once on a sales order"),{status:400,code:"DUPLICATE_ORDER_PRODUCT"});const now=new Date();const openStatuses=OPEN_CREDIT_STATUSES;const[customer,warehouse,employee,products,approvedPrices,mappedProducts,outstandingRows,openOrders,issuedOrderRows]=await Promise.all([Customer.findOne({customerId,status:"active"}).lean(),Warehouse.findOne({warehouseId,active:true}).lean(),Employee.findOne({employeeId:assignedEmployeeId,status:"active"}).lean(),Product.find({productId:{$in:productIds},status:"active"}).lean(),CustomerPrice.find(effectiveAgreementQuery(customerId,{$in:productIds},now)).sort({validFrom:-1,createdAt:-1,customerProductPriceId:1}).lean(),CustomerProductMapping.find({customerId,productId:{$in:productIds},active:true}).select({productId:1}).lean(),Invoice.aggregate([{$match:{customerId,status:"issued",outstandingPaise:{$gt:0}}},{$group:{_id:null,total:{$sum:"$outstandingPaise"}}}]),SalesOrder.find({customerId,status:{$in:openStatuses}}).select({salesOrderId:1,totalPaise:1}).lean(),Invoice.find({customerId,status:"issued"}).select({salesOrderId:1}).lean()]);if(!customer||!warehouse||!employee||products.length!==productIds.length)throw Object.assign(new Error("Customer, warehouse, assigned employee or product not found"),{status:404});if(new Set(mappedProducts.map(x=>x.productId)).size!==productIds.length)throw Object.assign(new Error("One or more products are not mapped to this customer"),{status:400,code:"CUSTOMER_PRODUCT_NOT_MAPPED"});const byProduct=new Map((await catalog.decorateProducts(products)).map(x=>[x.productId,x]));const reasons=[];const lines=input.lines.map(raw=>{const p=byProduct.get(raw.productId);const qty=positiveInteger(raw.quantity,"Quantity");const agreement=approvedPrices.find(x=>x.productId===p.productId&&qty>=x.minimumQuantity);const price=Number(raw.unitPricePaise??agreement?.unitPricePaise??p.referenceSellingPricePaise);if(!Number.isSafeInteger(price)||price<0)throw Object.assign(new Error(`Selling price is invalid for ${p.name}`),{status:400});if(price<p.minimumSellingPricePaise)throw Object.assign(new Error(`Selling price for ${p.name} is below the minimum permitted price`),{status:400,code:"BELOW_MINIMUM_PRICE"});const approvedAgreement=agreement&&price===agreement.unitPricePaise&&qty>=agreement.minimumQuantity;const exception=price<p.referenceSellingPricePaise&&!approvedAgreement&&!hasPermission(admin,"pricing.approve");if(exception)reasons.push(`Price approval required for ${p.sku}`);return{productId:p.productId,productName:p.name,categoryId:p.categoryId||"",subcategoryId:p.subcategoryId||"",category:p.category||"",subcategory:p.subcategory||"",sku:p.sku,hsnCode:p.hsnCode||"",quantity:qty,unitPricePaise:price,gstRateBps:basisPoints(p.gstRateBps??0,"GST rate"),customerProductPriceId:approvedAgreement?agreement.customerProductPriceId:"",minimumSellingPricePaise:p.minimumSellingPricePaise,priceException:exception,stockReservedQty:0,stockUnitCostPaise:0,procurementRequiredQty:0,procurementAllocatedQty:0};});const totals=invoiceTotals(lines);const outstanding=Number(outstandingRows[0]?.total||0),issuedOrderIds=new Set(issuedOrderRows.map(x=>x.salesOrderId)),openOrderExposure=openOrders.filter(x=>!issuedOrderIds.has(x.salesOrderId)).reduce((s,x)=>s+Number(x.totalPaise||0),0);if(customer.creditHold)reasons.push("Customer is on credit hold");if(customer.creditLimitPaise>0&&outstanding+openOrderExposure+totals.totalPaise>customer.creditLimitPaise)reasons.push("Customer credit limit would be exceeded");const deliveryAddress=input.deliveryAddress||customer.deliveryAddresses.find(x=>x.isDefault)||customer.deliveryAddresses[0]||customer.billingAddress;const paymentTermDays=nonNegativeInteger(input.paymentTermDays??customer.paymentTermDays??0,"Payment term days");if(paymentTermDays>3650)throw Object.assign(new Error("Payment term days cannot exceed 3650"),{status:400});const due=new Date();due.setDate(due.getDate()+paymentTermDays);const gstTreatment=String(input.gstTreatment||"unclassified");if(!["unclassified","intra_state","inter_state","no_gst"].includes(gstTreatment))throw Object.assign(new Error("GST treatment is invalid"),{status:400});if(totals.gstPaise>0&&gstTreatment==="no_gst")throw Object.assign(new Error("GST treatment cannot be no_gst when GST is charged"),{status:400});const approvalStatus=reasons.length?(hasPermission(admin,"orders.approve")?"approved":"pending"):"not_required";const order=await SalesOrder.create({orderNumber:orderNumber(),customerId,customerSnapshot:{businessName:customer.businessName,contactName:customer.contactName,mobile:customer.mobile,email:customer.email,gstin:customer.gstin,customerType:customer.customerType},deliveryAddressSnapshot:deliveryAddress,assignedEmployeeId,warehouseId,status:"created",approvalStatus,approvalReasons:reasons,approvedBy:approvalStatus==="approved"?admin.employeeId:"",approvedAt:approvalStatus==="approved"?new Date():null,lines,taxablePaise:totals.taxablePaise,gstPaise:totals.gstPaise,gstTreatment,totalPaise:totals.totalPaise,paymentTermDays,paymentDueAt:due,notes:String(input.notes||""),createdBy:admin.employeeId,updatedBy:admin.employeeId});return order.toObject();}
async function approve(id,admin){if(!hasPermission(admin,"orders.approve"))throw Object.assign(new Error("Order approval permission is required"),{status:403});const order=await SalesOrder.findOneAndUpdate({salesOrderId:id,approvalStatus:"pending"},{$set:{approvalStatus:"approved",approvedBy:admin.employeeId,approvedAt:new Date(),updatedBy:admin.employeeId}},{new:true});if(!order)throw Object.assign(new Error("Pending order approval was not found"),{status:404});return order.toObject();}
async function currentCreditExposure(customerId,session){let invoiceAgg=Invoice.aggregate([{$match:{customerId,status:"issued",outstandingPaise:{$gt:0}}},{$group:{_id:null,total:{$sum:"$outstandingPaise"}}}]);let orderQuery=SalesOrder.find({customerId,status:{$in:OPEN_CREDIT_STATUSES}}).select({salesOrderId:1,totalPaise:1});let invoiceOrderQuery=Invoice.find({customerId,status:"issued"}).select({salesOrderId:1});if(session){invoiceAgg=invoiceAgg.session(session);orderQuery=orderQuery.session(session);invoiceOrderQuery=invoiceOrderQuery.session(session);}const[outstandingRows,openOrders,issuedOrderRows]=await Promise.all([invoiceAgg,orderQuery.lean(),invoiceOrderQuery.lean()]);const issuedOrderIds=new Set(issuedOrderRows.map(x=>x.salesOrderId));return Number(outstandingRows[0]?.total||0)+openOrders.filter(x=>!issuedOrderIds.has(x.salesOrderId)).reduce((sum,x)=>sum+Number(x.totalPaise||0),0);}
async function confirm(id,admin){const actor=admin.employeeId;const session=await mongoose.startSession();try{return await session.withTransaction(async()=>{const order=await SalesOrder.findOne({salesOrderId:id}).session(session);if(!order)throw Object.assign(new Error("Sales order not found"),{status:404});if(order.approvalStatus==="pending")throw Object.assign(new Error("Order requires approval before confirmation"),{status:409});if(!["created","draft"].includes(order.status))throw Object.assign(new Error("Order has already been confirmed"),{status:409});const customer=await Customer.findOne({customerId:order.customerId,status:"active"}).session(session);if(!customer)throw Object.assign(new Error("Customer is unavailable"),{status:409});await Customer.updateOne({customerId:order.customerId},{$inc:{creditGuardVersion:1}},{session});const exposure=await currentCreditExposure(order.customerId,session),requiresCreditApproval=order.orderType!=="replacement"&&(Boolean(customer.creditHold)||(Number(customer.creditLimitPaise||0)>0&&exposure>Number(customer.creditLimitPaise||0)));if(requiresCreditApproval&&order.approvalStatus!=="approved"&&!hasPermission(admin,"orders.approve"))throw Object.assign(new Error("Customer credit approval is required before confirmation"),{status:409,code:"CREDIT_APPROVAL_REQUIRED"});let shortage=false;for(const line of order.lines){const balance=await InventoryBalance.findOneAndUpdate({warehouseId:order.warehouseId,productId:line.productId},{$setOnInsert:{updatedBy:actor}},{upsert:true,new:true,session,setDefaultsOnInsert:true});const reserve=Math.min(Number(balance.availableQty||0),line.quantity);line.stockReservedQty=reserve;line.stockUnitCostPaise=reserve>0?Number(balance.averageCostPaise||0):0;if(reserve>0){balance.availableQty-=reserve;balance.reservedQty+=reserve;balance.updatedBy=actor;await balance.save({session});await InventoryMovement.create([{warehouseId:order.warehouseId,productId:line.productId,movementType:"reserve",quantityDelta:reserve,bucket:"reserved",referenceType:"sales_order",referenceId:order.salesOrderId,reason:"Sales order confirmed",actorEmployeeId:actor}],{session});}line.procurementRequiredQty=Math.max(0,line.quantity-reserve);if(reserve<line.quantity)shortage=true;}order.status=shortage?"procurement_required":"stock_ready";order.updatedBy=actor;await order.save({session});return order.toObject();});}finally{await session.endSession();}}
async function allocate(id,input,actor){const session=await mongoose.startSession();try{return await session.withTransaction(async()=>{const order=await SalesOrder.findOne({salesOrderId:id}).session(session);if(!order)throw Object.assign(new Error("Sales order not found"),{status:404});if(!["procurement_required","procurement_in_progress"].includes(order.status))throw Object.assign(new Error("Procurement can only be allocated while an order requires procurement"),{status:409});const line=order.lines.find(x=>x.salesOrderLineId===input.salesOrderLineId);if(!line)throw Object.assign(new Error("Order line not found"),{status:404});const supplierId=requiredUuid(input.supplierId,"Supplier"),supplierLocationId=requiredUuid(input.supplierLocationId,"Supplier location"),quantity=positiveInteger(input.quantity,"Quantity");const supplier=await Supplier.findOne({supplierId,status:"active"}).session(session).lean(),location=await SupplierLocation.findOne({supplierLocationId,supplierId,active:true}).session(session).lean(),offer=input.supplierProductOfferId?await Offer.findOne({supplierProductOfferId:input.supplierProductOfferId,active:true}).session(session).lean():null,existingRows=await ProcurementAllocation.aggregate([{$match:{salesOrderId:id,salesOrderLineId:line.salesOrderLineId,status:{$ne:"cancelled"}}},{$group:{_id:null,total:{$sum:"$quantity"}}}]).session(session);if(!supplier||!location)throw Object.assign(new Error("Supplier or supplier location not found"),{status:404});if(offer&&(offer.supplierId!==supplierId||offer.supplierLocationId!==supplierLocationId||offer.productId!==line.productId))throw Object.assign(new Error("Supplier offer does not match the selected supplier, location and product"),{status:400});const existingAllocated=Number(existingRows[0]?.total||0);let requiredProcurement=Number(line.procurementRequiredQty||0);if(requiredProcurement<=0){const currentReserved=await reservedQuantityForOrderProduct(id,line.productId,session);requiredProcurement=Math.min(line.quantity,existingAllocated+Math.max(0,line.quantity-currentReserved));}if(existingAllocated+quantity>requiredProcurement)throw Object.assign(new Error("Procurement allocation exceeds the remaining required quantity"),{status:409,code:"PROCUREMENT_OVERALLOCATED"});const counterBase=Math.max(Number(line.procurementAllocatedQty||0),existingAllocated);await SalesOrder.updateOne({salesOrderId:id,"lines.salesOrderLineId":line.salesOrderLineId},{$max:{"lines.$[target].procurementAllocatedQty":counterBase}},{session,arrayFilters:[{"target.salesOrderLineId":line.salesOrderLineId}]});const maxBefore=requiredProcurement-quantity;const guarded=await SalesOrder.findOneAndUpdate({salesOrderId:id,status:{$in:["procurement_required","procurement_in_progress"]},lines:{$elemMatch:{salesOrderLineId:line.salesOrderLineId,procurementAllocatedQty:{$lte:maxBefore}}}},{$inc:{"lines.$[target].procurementAllocatedQty":quantity},$set:{status:"procurement_in_progress",updatedBy:actor}},{new:true,session,arrayFilters:[{"target.salesOrderLineId":line.salesOrderLineId}]});if(!guarded)throw Object.assign(new Error("Procurement allocation exceeds the remaining required quantity"),{status:409,code:"PROCUREMENT_OVERALLOCATED"});const price=Number(input.purchasePricePaise??offer?.purchasePricePaise);if(!Number.isSafeInteger(price)||price<0)throw Object.assign(new Error("Purchase price is required"),{status:400});const rows=await ProcurementAllocation.create([{salesOrderId:id,salesOrderLineId:line.salesOrderLineId,productId:line.productId,supplierId,supplierLocationId,supplierProductOfferId:offer?.supplierProductOfferId||"",quantity,purchasePricePaise:price,gstRateBps:basisPoints(input.gstRateBps??offer?.gstRateBps??line.gstRateBps,"GST rate"),supplierSnapshot:{businessName:supplier.businessName,gstin:supplier.gstin},supplierLocationSnapshot:{name:location.name,city:location.city,state:location.state,pincode:location.pincode},purchaseOrderId:String(input.purchaseOrderId||""),status:"planned",createdBy:actor}],{session});return rows[0].toObject();});}finally{await session.endSession();}}
async function reservedQuantityForOrderProduct(salesOrderId,productId,session){
  let query=InventoryMovement.find({referenceType:"sales_order",referenceId:salesOrderId,productId,movementType:{$in:["reserve","release"]}});if(session)query=query.session(session);const movements=await query.lean();
  let reserved=0;
  for(const movement of movements){
    if(movement.movementType==="reserve")reserved+=Number(movement.quantityDelta||0);
    if(movement.movementType==="release")reserved-=Number(movement.quantityDelta||0);
  }
  return Math.max(0,reserved);
}
function quantityByProduct(lines){const map=new Map();for(const line of lines||[])map.set(line.productId,(map.get(line.productId)||0)+Number(line.quantity||0));return map;}
async function recheckStock(id,actor){
  const session=await mongoose.startSession();
  try{return await session.withTransaction(async()=>{
    const order=await SalesOrder.findOne({salesOrderId:id}).session(session);
    if(!order)throw Object.assign(new Error("Sales order not found"),{status:404});
    if(!["procurement_required","procurement_in_progress"].includes(order.status))throw Object.assign(new Error("Only procurement orders can recheck stock"),{status:409});
    const required=quantityByProduct(order.lines);let allReserved=true;
    for(const [productId,requiredQty] of required){
      const alreadyReserved=await reservedQuantityForOrderProduct(order.salesOrderId,productId,session);
      const needed=Math.max(0,requiredQty-alreadyReserved);
      if(!needed)continue;
      const balance=await InventoryBalance.findOneAndUpdate({warehouseId:order.warehouseId,productId},{$setOnInsert:{updatedBy:actor}},{upsert:true,new:true,session,setDefaultsOnInsert:true});
      const reserve=Math.min(Number(balance.availableQty||0),needed);
      if(reserve>0){
        balance.availableQty-=reserve;balance.reservedQty+=reserve;balance.updatedBy=actor;await balance.save({session});
        await InventoryMovement.create([{warehouseId:order.warehouseId,productId,movementType:"reserve",quantityDelta:reserve,bucket:"reserved",referenceType:"sales_order",referenceId:order.salesOrderId,reason:"Stock rechecked after procurement",actorEmployeeId:actor}],{session});
        const line=order.lines.find(x=>x.productId===productId);
        if(line){
          const allocationRows=await ProcurementAllocation.aggregate([{$match:{salesOrderId:id,salesOrderLineId:line.salesOrderLineId,status:{$ne:"cancelled"}}},{$group:{_id:null,total:{$sum:"$quantity"}}}]).session(session);
          const initialStockQty=Math.max(0,Number(line.quantity||0)-Number(line.procurementRequiredQty||0));
          const allocationQty=Math.min(Number(line.procurementRequiredQty||0),Number(allocationRows[0]?.total||0));
          const totalReservedAfter=alreadyReserved+reserve;
          const desiredStockCostQty=Math.min(Number(line.quantity||0),initialStockQty+Math.max(0,totalReservedAfter-initialStockQty-allocationQty));
          const currentStockCostQty=Number(line.stockReservedQty||0);
          const extraStockCostQty=Math.max(0,desiredStockCostQty-currentStockCostQty);
          if(extraStockCostQty>0){
            const oldCost=currentStockCostQty*Number(line.stockUnitCostPaise||0),newCost=extraStockCostQty*Number(balance.averageCostPaise||0);
            line.stockReservedQty=currentStockCostQty+extraStockCostQty;
            line.stockUnitCostPaise=Math.round((oldCost+newCost)/line.stockReservedQty);
          }
        }
      }
      if(alreadyReserved+reserve<requiredQty)allReserved=false;
    }
    for(const [productId,requiredQty] of required){if(await reservedQuantityForOrderProduct(order.salesOrderId,productId,session)<requiredQty){allReserved=false;break;}}
    const hasAllocation=Boolean(await ProcurementAllocation.exists({salesOrderId:id,status:{$ne:"cancelled"}}).session(session));
    order.status=allReserved?"stock_ready":hasAllocation?"procurement_in_progress":"procurement_required";order.updatedBy=actor;await order.save({session});return order.toObject();
  });}finally{await session.endSession();}
}
async function cancel(id,input,actor){
  const session=await mongoose.startSession();
  try{return await session.withTransaction(async()=>{
    const order=await SalesOrder.findOne({salesOrderId:id}).session(session);
    if(!order)throw Object.assign(new Error("Sales order not found"),{status:404});
    const allowed=["draft","created","procurement_required","procurement_in_progress","stock_ready","picking","packed","ready_for_dispatch"];
    if(!allowed.includes(order.status))throw Object.assign(new Error(`Order cannot be cancelled from ${order.status}`),{status:409});
    const issuedInvoice=await Invoice.findOne({salesOrderId:id,status:"issued"}).session(session).lean();if(issuedInvoice)throw Object.assign(new Error("An issued invoice exists for this order; cancellation requires a finance reversal workflow"),{status:409,code:"ORDER_INVOICED"});
    const required=quantityByProduct(order.lines);let sourceField="";
    if(["procurement_required","procurement_in_progress","stock_ready"].includes(order.status))sourceField="reservedQty";
    else if(order.status==="picking")sourceField="pickedQty";
    else if(["packed","ready_for_dispatch"].includes(order.status))sourceField="packedQty";
    if(sourceField){
      for(const [productId,totalQty] of required){
        const releaseQty=sourceField==="reservedQty"?await reservedQuantityForOrderProduct(order.salesOrderId,productId,session):totalQty;
        if(!releaseQty)continue;
        const balance=await InventoryBalance.findOne({warehouseId:order.warehouseId,productId}).session(session);
        if(!balance||Number(balance[sourceField]||0)<releaseQty)throw Object.assign(new Error("Inventory state is inconsistent; order cancellation was not applied"),{status:409});
        balance[sourceField]-=releaseQty;balance.availableQty+=releaseQty;balance.updatedBy=actor;await balance.save({session});
        await InventoryMovement.create([{warehouseId:order.warehouseId,productId,movementType:"release",quantityDelta:releaseQty,bucket:"available",referenceType:"sales_order",referenceId:order.salesOrderId,reason:"Sales order cancelled; stock released",actorEmployeeId:actor}],{session});
      }
    }
    await ProcurementAllocation.updateMany({salesOrderId:id,status:{$in:["planned","ordered"]}},{$set:{status:"cancelled"}},{session});
    order.status="cancelled";order.cancellationReason=String(input?.reason||"").trim().slice(0,1000);order.cancelledBy=actor;order.cancelledAt=new Date();order.updatedBy=actor;await order.save({session});return order.toObject();
  });}finally{await session.endSession();}
}
async function advanceFulfilment(id,target,actor){
  const allowed={stock_ready:"picking",picking:"packed",packed:"ready_for_dispatch"};
  const session=await mongoose.startSession();
  try{return await session.withTransaction(async()=>{
    const order=await SalesOrder.findOne({salesOrderId:id}).session(session);
    if(!order)throw Object.assign(new Error("Sales order not found"),{status:404});
    if(allowed[order.status]!==target)throw Object.assign(new Error(`Cannot move order from ${order.status} to ${target}`),{status:409});
    if(target==="picking"||target==="packed"){
      for(const line of order.lines){
        const balance=await InventoryBalance.findOne({warehouseId:order.warehouseId,productId:line.productId}).session(session);
        if(!balance)throw Object.assign(new Error("Inventory balance not found"),{status:409});
        if(target==="picking"){
          if(balance.reservedQty<line.quantity)throw Object.assign(new Error(`Reserved stock is insufficient for ${line.sku}`),{status:409});
          balance.reservedQty-=line.quantity;balance.pickedQty+=line.quantity;
          await InventoryMovement.create([{warehouseId:order.warehouseId,productId:line.productId,movementType:"pick",quantityDelta:line.quantity,bucket:"picked",referenceType:"sales_order",referenceId:order.salesOrderId,reason:"Order picked",actorEmployeeId:actor}],{session});
        }else{
          if(balance.pickedQty<line.quantity)throw Object.assign(new Error(`Picked stock is insufficient for ${line.sku}`),{status:409});
          balance.pickedQty-=line.quantity;balance.packedQty+=line.quantity;
          await InventoryMovement.create([{warehouseId:order.warehouseId,productId:line.productId,movementType:"pack",quantityDelta:line.quantity,bucket:"packed",referenceType:"sales_order",referenceId:order.salesOrderId,reason:"Order packed",actorEmployeeId:actor}],{session});
        }
        balance.updatedBy=actor;await balance.save({session});
      }
    }
    order.status=target;order.updatedBy=actor;await order.save({session});
    return order.toObject();
  });}finally{await session.endSession();}
}
module.exports={list,get,warehouseOptions,warehouseAvailability,create,approve,confirm,allocate,recheckStock,cancel,advanceFulfilment};
