"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("sales-order workflow uses dedicated list, create, detail, sourcing and fulfilment pages",()=>{
  const routes=read("routes/frontend.js");
  for(const route of["/orders/new","/orders/:salesOrderId/procurement","/orders/:salesOrderId/fulfilment","/orders/:salesOrderId"])assert.match(routes,new RegExp(route.replace(/[/:]/g,m=>m==="/"?"\\/":":") ));
  const list=read("views/orders.ejs");
  assert.match(list,/href="\/orders\/new"/);
  assert.doesNotMatch(list,/New sales order<\/h2>/);
  assert.doesNotMatch(list,/Procurement allocation<\/h2>/);
  assert.match(read("views/order-detail.ejs"),/Product demand & source mapping/);
  assert.match(read("views/order-procurement.ejs"),/Multiple allocations are allowed/);
  assert.match(read("views/order-fulfilment.ejs"),/Ready for dispatch/);
});

test("procurement workflow uses dedicated demand, create, detail and receive pages",()=>{
  const routes=read("routes/frontend.js");
  for(const route of["/procurement/demand","/procurement/new","/procurement/:purchaseOrderId/receive","/procurement/:purchaseOrderId"])assert.ok(routes.includes(route),route);
  const list=read("views/procurement.ejs");
  assert.doesNotMatch(list,/Receive goods<\/h2>/);
  assert.doesNotMatch(list,/New purchase order<\/h2>/);
  assert.match(read("views/procurement-detail.ejs"),/Linked sales-order demand/);
  assert.match(read("views/procurement-receive.ejs"),/Accepted/);
});

test("inventory and warehouse master actions use dedicated pages",()=>{
  const routes=read("routes/frontend.js");
  for(const route of["/inventory/movements","/inventory/adjust","/warehouses/new","/warehouses/:warehouseId/edit"])assert.ok(routes.includes(route),route);
  assert.doesNotMatch(read("views/inventory.ejs"),/Inventory adjustment/);
  assert.doesNotMatch(read("views/inventory.ejs"),/Recent stock movements/);
  assert.doesNotMatch(read("views/warehouses.ejs"),/New warehouse<\/h2>/);
});

test("sales-order sourcing surfaces configured supplier offers and preserves one order warehouse",()=>{
  const source=read("views/order-procurement.ejs");
  assert.match(source,/supplier-offers/);
  assert.match(source,/supplierProductOfferId/);
  const model=read("models/SalesOrder.js");
  assert.ok(model.includes("warehouseId:{type:String,required:true,index:true}"));
  const allocation=read("models/ProcurementAllocation.js");
  for(const field of["salesOrderId","salesOrderLineId","productId","supplierId","supplierLocationId","supplierProductOfferId","quantity"])assert.ok(allocation.includes(field+":"),field);
});

test("connected record pages do not require unrelated inventory or product API permissions",()=>{
  const orderRoutes=read("routes/orders.js");
  assert.match(orderRoutes,/\/options\/warehouses/);
  assert.match(orderRoutes,/requirePermission\("orders\.create"\),c\.orderWarehouseOptions/);
  for(const file of["views/orders.ejs","views/order-detail.ejs","views/order-fulfilment.ejs"])assert.doesNotMatch(read(file),/api\/warehouses/,file);
  assert.match(read("views/order-form.ejs"),/api\/orders\/options\/warehouse-availability/);
  const orderService=read("services/order-service.js");
  assert.match(orderService,/async function warehouseOptions/);
  assert.match(orderService,/warehouseSnapshot/);
  for(const file of["views/procurement.ejs","views/procurement-demand.ejs","views/procurement-detail.ejs"]){
    const source=read(file);
    assert.doesNotMatch(source,/api\/warehouses/,file);
    assert.doesNotMatch(source,/api\/products/,file);
  }
  const procurementService=read("services/procurement-service.js");
  assert.match(procurementService,/warehouseSnapshot/);
  assert.match(procurementService,/productSnapshot/);
});


test("sales order creation follows customer products warehouse review with stock-based recommendation",()=>{
  const form=read("views/order-form.ejs");
  assert.match(form,/Customer → products and pricing → warehouse → review/);
  assert.match(form,/steps:\['Customer','Products','Warehouse','Review'\]/);
  assert.match(form,/crm-order-timeline/);
  assert.match(form,/\/api\/orders\/options\/warehouse-availability\?lines=/);
  assert.match(form,/Recommended fulfilment warehouse/);
  assert.match(form,/existing procurement workflow/);
  assert.doesNotMatch(form,/steps:\['Customer','Warehouse','Products','Review'\]/);
  const routes=read("routes/orders.js");
  assert.match(routes,/\/options\/warehouse-availability/);
  assert.match(routes,/requirePermission\("orders\.create"\),c\.orderWarehouseAvailability/);
  const service=read("services/order-service.js");
  assert.match(service,/async function warehouseAvailability/);
  assert.match(service,/InventoryBalance\.find\(/);
  assert.match(service,/recommendedWarehouseId/);
});
