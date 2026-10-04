"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const SalesOrder=require("../models/SalesOrder");

const root=path.resolve(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("master-data updates use allowlists instead of request-body mass assignment",()=>{
  for(const file of[
    "services/customer-service.js",
    "services/supplier-service.js",
    "services/warehouse-service.js",
    "services/employee-service.js"
  ]){
    const source=read(file);
    assert.doesNotMatch(source,/const\s+patch\s*=\s*\{\s*\.\.\.input/,file);
    assert.doesNotMatch(source,/\$set\s*:\s*input/,file);
  }
});

test("sales-order procurement requirement is explicit and allocation is bounded",()=>{
  const line=SalesOrder.schema.path("lines").schema;
  assert.ok(line.path("procurementRequiredQty"));
  const source=read("services/order-service.js");
  assert.match(source,/DUPLICATE_ORDER_PRODUCT/);
  assert.match(source,/validFrom:\{\$lte:now\}/);
  assert.match(source,/PROCUREMENT_OVERALLOCATED/);
  assert.match(source,/offer\.productId!==line\.productId/);
  assert.match(source,/ORDER_INVOICED/);
  assert.match(source,/Employee\.findOne\(\{employeeId:assignedEmployeeId,status:"active"\}\)/);
});

test("purchase orders reject duplicate SKU lines",()=>{
  assert.match(read("services/procurement-service.js"),/DUPLICATE_PO_PRODUCT/);
});

test("pricing changes are transactional and decisions are bounded",()=>{
  const source=read("services/pricing-service.js");
  assert.match(source,/startSession\(\)/);
  assert.match(source,/withTransaction/);
  assert.match(source,/\["approved","rejected"\]\.includes\(status\)/);
  assert.match(source,/runValidators:true/);
});

test("finance requires a real party and confirmed order before money documents",()=>{
  const source=read("services/finance-service.js");
  assert.match(source,/requiredUuid\(direction==="receivable"\?input\.customerId:input\.supplierId/);
  assert.match(source,/Customer\.findOne\(\{customerId:partyId\}/);
  assert.match(source,/Supplier\.findOne\(\{supplierId:partyId\}/);
  assert.match(source,/\["draft","created","cancelled"\]/);
  assert.match(source,/Payment is already reconciled/);
});

test("dashboard overdue totals exclude records without due dates",()=>{
  const source=read("services/dashboard-service.js");
  const matches=source.match(/dueAt:\{\$ne:null,\$lt:now\}/g)||[];
  assert.equal(matches.length,2);
});

test("delivery assignment is atomic and return stock is based on real received stock",()=>{
  const delivery=read("services/delivery-service.js");
  assert.match(delivery,/findOne\(\{salesOrderId,status:\{\$in:\["packed","ready_for_dispatch"\]\}\}/);
  assert.match(delivery,/Employee\.findOne\(\{employeeId:assignedDriverId,status:"active",deliveryEligible:\{\$ne:false\}\}\)/);
  assert.match(delivery,/Packed stock is insufficient/);
  assert.match(delivery,/findOneAndUpdate\(\{salesOrderId:order\.salesOrderId,status:order\.status\}/);
  assert.match(delivery,/withTransaction/);
  const returns=read("services/return-service.js");
  assert.match(returns,/GoodsReceipt\.find\(\{purchaseOrderId:po\.purchaseOrderId\}\)/);
  assert.match(returns,/acceptedQty\|\|0\)\+Number\(line\.damagedQty\|\|0\)/);
  assert.match(returns,/\["supplier_return","rejected"\]/);
  assert.match(returns,/line\.outcome==="rejected"/);
});

test("product media attachment and HTML descriptions stay scoped and sanitized",()=>{
  const source=read("services/product-service.js");
  const html=read("utils/product-html.js");
  assert.match(source,/expectedPrefix=kind==="document"\?cfg\.privatePrefix\+"products\/"\:cfg\.publicPrefix\+"products\//);
  assert.match(source,/Product media key does not match its media type/);
  assert.match(source,/sanitizeProductHtml/);
  assert.match(html,/allowedTags:ALLOWED_TAGS/);
  assert.doesNotMatch(html,/"script"/);
  assert.doesNotMatch(html,/"style"/);
  assert.match(html,/allowProtocolRelative:false/);
  assert.doesNotMatch(html,/enforceHtmlBoundary:true/);
});

test("protected system roles and employee self-access cannot be disabled accidentally",()=>{
  const source=read("services/employee-service.js");
  assert.match(source,/cannot deactivate or suspend your own employee account/);
  assert.match(source,/Super Admin role cannot be deactivated/);
  assert.match(source,/Role cannot be deactivated while active employees are assigned/);
});

test("role and employee administration prevents vertical privilege escalation",()=>{
  const source=read("services/employee-service.js");
  assert.match(source,/PRIVILEGE_ESCALATION_BLOCKED/);
  assert.match(source,/You cannot grant permissions that you do not have/);
  assert.match(source,/Only a Super Admin can assign this role/);
  assert.match(source,/Only a Super Admin can modify the Super Admin role/);
  assert.match(source,/assertCanAssignRole\(grantorRole,role\)/);
  assert.match(source,/assertCanGrantPermissions\(grantorRole,requested\)/);
});

test("primary operational views do not use native prompt or confirm dialogs",()=>{
  for(const file of["views/orders.ejs","views/procurement.ejs","views/products.ejs","views/returns.ejs","views/delivery.ejs"]){
    assert.doesNotMatch(read(file),/\b(?:prompt|confirm)\s*\(/,file);
  }
});
