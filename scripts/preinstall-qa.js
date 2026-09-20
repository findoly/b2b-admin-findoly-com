#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path"),{spawnSync}=require("child_process");
const root=path.resolve(__dirname,"..");
const ignored=new Set(["node_modules",".git"]);
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory()&&ignored.has(e.name))continue;const p=path.join(dir,e.name);e.isDirectory()?walk(p,out):out.push(p)}return out}
function fail(msg){console.error(`QA failed: ${msg}`);process.exitCode=1}
const files=walk(root);const js=files.filter(f=>f.endsWith(".js"));
for(const f of js){const r=spawnSync(process.execPath,["--check",f],{encoding:"utf8"});if(r.status!==0)fail(`${path.relative(root,f)}\n${r.stderr}`)}
console.log(`✓ JavaScript syntax: ${js.length} files`);
const implementation=files.filter(f=>/\.(js|ejs)$/.test(f)&&!path.relative(root,f).startsWith("test/")&&!path.relative(root,f).startsWith("scripts/"));
for(const f of implementation){const t=fs.readFileSync(f,"utf8");if(/\.populate\s*\(/.test(t))fail(`${path.relative(root,f)} contains populate()`);if(/\$lookup\b/.test(t))fail(`${path.relative(root,f)} contains $lookup`);if(/Schema\.Types\.ObjectId/.test(t))fail(`${path.relative(root,f)} contains ObjectId relationship code`);if(/\bref\s*:\s*["']/.test(t))fail(`${path.relative(root,f)} contains a Mongoose ref`)}
console.log("✓ No join/populate/ObjectId/ref relationship implementation");
for(const f of files.filter(f=>f.endsWith(".ejs"))){const t=fs.readFileSync(f,"utf8");for(const m of t.matchAll(/include\(['\"]([^'\"]+)['\"]\)/g)){let target=path.resolve(path.dirname(f),m[1]);if(!target.endsWith(".ejs"))target+=".ejs";if(!fs.existsSync(target))fail(`${path.relative(root,f)} includes missing ${m[1]}`)}}
console.log("✓ EJS include targets exist");
for(const doc of ["PROJECT_STANDARDS.md","FEATURE_SCOPE.md","DATA_MODEL_RULES.md"]){if(!fs.existsSync(path.join(root,doc)))fail(`missing ${doc}`)}
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));if(pkg.engines?.node!==">=20")fail("Node engine must be >=20");
const idRules={Customer:"customerId",Product:"productId",Supplier:"supplierId",SupplierLocation:"supplierLocationId",SupplierProductOffer:"supplierProductOfferId",PurchasePriceHistory:"purchasePriceHistoryId",CustomerProductPrice:"customerProductPriceId",Warehouse:"warehouseId",PurchaseOrder:"purchaseOrderId",GoodsReceipt:"goodsReceiptId",InventoryBalance:"inventoryBalanceId",InventoryMovement:"inventoryMovementId",SalesOrder:"salesOrderId",ProcurementAllocation:"procurementAllocationId",Invoice:"invoiceId",SupplierBill:"supplierBillId",Payment:"paymentId",DeliveryAssignment:"deliveryAssignmentId",Return:"returnId",Employee:"employeeId",Role:"roleId",AuditLog:"auditLogId"};
for(const [model,id] of Object.entries(idRules)){const file=path.join(root,"models",`${model}.js`);if(!fs.existsSync(file)){fail(`missing model ${model}`);continue}const t=fs.readFileSync(file,"utf8");if(!new RegExp(`${id}\\s*:\\s*\\{\\s*type\\s*:\\s*String`).test(t))fail(`${model} does not expose ${id} as String`);if(!t.includes("immutable:true"))fail(`${model} has no immutable application ID`)}
const product=fs.readFileSync(path.join(root,"models/Product.js"),"utf8");if(/purchasePricePaise/.test(product))fail("Product master must not contain a single purchase price");
const order=fs.readFileSync(path.join(root,"models/SalesOrder.js"),"utf8");if(!order.includes("gstTreatment"))fail("Sales orders must carry explicit GST treatment");
const finance=fs.readFileSync(path.join(root,"services/finance-service.js"),"utf8");if(!finance.includes("GST_TREATMENT_REQUIRED"))fail("Invoice issue must reject unclassified GST treatment");
const combined=implementation.map(f=>fs.readFileSync(f,"utf8")).join("\n");if(/communication[ -]?center/i.test(combined))fail("Communication Center implementation is out of scope");
console.log("✓ B2B architecture and scope guards");
if(!process.exitCode)console.log("Preinstall QA passed.");
