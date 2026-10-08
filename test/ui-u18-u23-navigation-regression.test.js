"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
test("U18: Finance section links have actual fixed targets and protect issuing action",()=>{
 const s=read("views/finance.ejs");
 assert.match(s,/aria-label="Finance sections"/);
 for(const id of ["finance-invoice-create","finance-settlements","finance-invoices","finance-bills","finance-payments"]){assert.ok(s.includes('href="#'+id+'"'));assert.ok(s.includes('id="'+id+'"'));}
 assert.match(s,/<% if \(can\('finance.invoice'\)\) \{ %><a href="#finance-invoice-create">/);
});
test("U19: customer 360 section navigation stays inside conditional record and maps to real cards",()=>{
 const s=read("views/customers.ejs"),root=s.indexOf('<div x-show="selected360" x-cloak>');
 const nav=s.indexOf('aria-label="Customer record sections"');
 assert.ok(root>=0&&nav>root);
 for(const id of ["customer-360-products","customer-360-orders","customer-360-finance","customer-360-activity"]){assert.ok(s.includes('href="#'+id+'"'));assert.ok(s.includes('id="'+id+'"'));}
 for(const id of ["customer-map-search","customer-map-product"]){assert.ok(s.includes('for="'+id+'"')&&s.includes('id="'+id+'"'));}
});
test("U20: filters retain the original search/reset functions and expose active-filter context",()=>{
 for(const [file,expression,handler] of [["orders","search || statusFilter","filterOrders()"],["products","search || statusFilter","searchProducts()"],["pricing","approvalFilter","filterPrices()"]]){
 const s=read("views/"+file+".ejs");
 assert.match(s,/class="crm-filter-summary mb-3"/);assert.ok(s.includes('x-show="'+expression+'"'));assert.ok(s.includes(handler));assert.match(s,/Clear filters/);
 }
});
test("U21: Dashboard metric links are permission-scoped and empty action points to order creation",()=>{
 const s=read("views/dashboard.ejs");
 for(const destination of ["/orders","/procurement/demand","/delivery","/pricing","/finance#finance-invoices","/finance#finance-bills","/inventory"])assert.ok(s.includes('href="'+destination+'"'),destination);
 assert.equal((s.match(/class="crm-metric-action"/g)||[]).length,7);
 assert.match(s,/<% if \(can\('orders.create'\)\) \{ %><a href="\/orders\/new"/);
 assert.match(s,/<% if \(can\('orders.view'\)\) \{ %><a href="\/orders"/);
});
test("U23: navigation and filter presentation remains responsive and theme-aware",()=>{
 const css=read("public/css/b2b-workspace.css"),head=read("views/partials/head.ejs"),qa=read("docs/RESPONSIVE_QA.md");
 for(const selector of [".crm-section-jump",".crm-filter-summary",".crm-metric-action"])assert.ok(css.includes(selector));
 assert.match(css,/min-height:44px/);assert.match(css,/:focus-visible/);assert.match(css,/@media\(max-width:767\.98px\)/);
 assert.match(head,/20261009-b2b-responsive-u1-u12-b1-b6-f1-f4-u18-u23-navigation-filters/);assert.match(qa,/U18–U23/);
});
