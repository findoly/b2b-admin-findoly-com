"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("warehouse occupancy counts physical stock but reports incoming separately",()=>{
  const source=read("services/warehouse-service.js");
  assert.match(source,/physicalQty:\{\$add:/);
  assert.doesNotMatch(source,/physicalQty:\{\$add:\[[^\]]*incomingQty/);
  assert.match(source,/incomingStockUnits/);
  assert.match(source,/occupancyStatus:physicalStockUnits>0\?"in_use":"empty"/);
});

test("negotiated price replacement expires approved price only when new price is approved",()=>{
  const source=read("services/pricing-service.js");
  assert.match(source,/approvalStatus==="approved"&&input\.replaceActive!==false/);
  assert.match(source,/approvalStatus:"approved"/);
  assert.match(source,/Only pending price agreements can be decided/);
  assert.match(source,/runValidators:true/);
});

test("finance supports immutable allocation reversal and later advance allocation",()=>{
  const Payment=require("../models/Payment");
  const allocation=Payment.schema.path("allocations").schema;
  for(const field of["reversedAt","reversedBy","reversalReason"])assert.ok(allocation.path(field),field);
  const source=read("services/finance-service.js");
  assert.match(source,/async function allocatePayment/);
  assert.match(source,/async function voidInvoice/);
  assert.match(source,/async function voidSupplierBill/);
  assert.match(source,/payment\.unallocatedPaise\+=Number\(allocation\.amountPaise\|\|0\)/);
});

test("supplier invoice uniqueness is enforced per supplier without breaking legacy rows",()=>{
  const SupplierBill=require("../models/SupplierBill");
  const normalized=SupplierBill.schema.indexes().find(([fields,options])=>fields.supplierInvoiceKey===1&&options.unique===true&&options.sparse===true);
  assert.ok(normalized);
  const source=read("services/procurement-service.js");
  assert.match(source,/supplierInvoiceKey\(po\.supplierId,invoiceNumber\)/);
  assert.match(source,/supplierInvoiceNumber:new RegExp/);
});

test("procurement demand is linked through ordered and received states",()=>{
  const Allocation=require("../models/ProcurementAllocation");
  assert.deepEqual(Allocation.schema.path("status").options.enum,["planned","ordered","received","cancelled"]);
  const source=read("services/procurement-service.js");
  assert.match(source,/procurementAllocationIds/);
  assert.match(source,/status:"ordered"/);
  assert.match(source,/allocation\.status="received"/);
  assert.match(source,/Purchase order cancelled; incoming stock released/);
  assert.match(source,/Purchase order closed; remaining incoming stock released/);
});

test("partial procurement receipts requeue only residual allocation quantity",()=>{
  const source=read("services/procurement-service.js");
  assert.match(source,/residualAllocationPayload/);
  assert.match(source,/const residualQty=quantity-acceptedRemaining/);
  assert.match(source,/allocation\.quantity=acceptedRemaining/);
  assert.match(source,/purchaseOrderId:"",status:"planned"/);
  assert.match(source,/reconcileAllocationReceiptStatus\(po,session,\{finalize:true\}\)/);
});

test("inventory and sales orders snapshot stock cost for COGS",()=>{
  const Inventory=require("../models/InventoryBalance");
  const Order=require("../models/SalesOrder");
  const line=Order.schema.path("lines").schema;
  assert.ok(Inventory.schema.path("averageCostPaise"));
  assert.ok(line.path("stockReservedQty"));
  assert.ok(line.path("stockUnitCostPaise"));
  const report=read("services/report-service.js");
  assert.match(report,/stockCostPaise/);
  assert.match(report,/cogsPaise=stockCostPaise\+procurementCostPaise/);
});

test("return processing creates auditable finance settlements and replacement orders",()=>{
  const Return=require("../models/Return");
  const Settlement=require("../models/ReturnSettlement");
  const Order=require("../models/SalesOrder");
  assert.ok(Return.schema.path("returnSettlementId"));
  assert.ok(Return.schema.path("replacementSalesOrderId"));
  assert.deepEqual(Settlement.schema.path("settlementType").options.enum,["customer_credit","supplier_debit"]);
  assert.deepEqual(Order.schema.path("orderType").options.enum,["sale","replacement"]);
  const source=read("services/return-service.js");
  assert.match(source,/createCustomerSettlement/);
  assert.match(source,/createSupplierSettlement/);
  assert.match(source,/createReplacementOrder/);
  assert.ok(Settlement.schema.path("applications"));
  const finance=read("services/finance-service.js");
  assert.match(finance,/async function applyReturnSettlement/);
  assert.match(finance,/settlement\.applications\.push/);
});

test("reorder dashboard uses configured product reorder levels",()=>{
  const source=read("services/dashboard-service.js");
  assert.match(source,/reorderLevel:\{\$gt:0\}/);
  assert.match(source,/item\.availableQty<=item\.reorderLevel/);
});

test("business attachments use scoped private prefixes and collision-resistant keys",()=>{
  const storage=read("services/storage/s3-service.js");
  const routes=read("routes/storage.js");
  assert.match(storage,/crypto\.randomUUID\(\)/);
  assert.match(storage,/File content type does not match the selected file type/);
  for(const area of["customers","suppliers","invoices","returns"])assert.match(routes,new RegExp("\\/"+area+"\\/upload-url"));
});

test("customer 360 credit exposure includes confirmed uninvoiced orders",()=>{
  const source=read("services/customer-360-service.js");
  assert.match(source,/openOrderExposurePaise/);
  assert.match(source,/creditExposurePaise=outstandingPaise\+openOrderExposurePaise/);
  assert.match(read("views/customers.ejs"),/selected360\?\.creditExposurePaise/);
});

test("mutations require an audit intent before business routes execute",()=>{
  const middleware=read("middleware/mutation-audit.js");
  const routes=read("routes/main.js");
  assert.match(middleware,/action:"mutation\.intent"/);
  assert.match(middleware,/AUDIT_UNAVAILABLE/);
  assert.match(routes,/r\.use\(apiAuth\);r\.use\(requireMutationAudit\)/);
});

test("GitHub Actions workflow is intentionally absent while QA scripts remain",()=>{
  assert.equal(fs.existsSync(path.join(root,".github/workflows/qa.yml")),false);
  const pkg=JSON.parse(read("package.json"));
  assert.ok(pkg.scripts["qa:production"]);
  assert.ok(pkg.scripts["qa:critical"]);
});

test("large operational screens expose bounded pagination/search controls",()=>{
  for(const file of["customers.ejs","products.ejs","suppliers.ejs","pricing.ejs","procurement.ejs","orders.ejs","delivery.ejs","returns.ejs","employees.ejs","audit.ejs","inventory.ejs"]){
    const source=read("views/"+file);
    assert.match(source,/crmPager\(/,file);
  }
  const finance=read("views/finance.ejs");
  for(const meta of["invoiceMeta","billMeta","paymentMeta","settlementMeta"])assert.match(finance,new RegExp(meta));
  assert.match(finance,/openSettlementAllocation/);
  assert.doesNotMatch(read("views/procurement.ejs"),/\b(?:prompt|confirm)\s*\(/);
  assert.doesNotMatch(finance,/\b(?:prompt|confirm)\s*\(/);
});
