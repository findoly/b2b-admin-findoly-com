"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
test("U24/U25: bright scoped action cards use live API values and permission-aware routes",()=>{
 const s=read("views/dashboard.ejs");for(const key of ["pendingProcurement","readyDispatch","pendingPrices","lowStockCount","overdueReceivablePaise"])assert.ok(s.includes("data."+key));for(const key of ["procurement.view","delivery.view","pricing.view","inventory.view","finance.view"])assert.ok(s.includes("can('"+key+"')"));assert.match(s,/Business action center/);assert.match(s,/lowStockItems/);
});
test("U26/U32: order-status donut counts and actions are backed by real status aggregates",()=>{
 const service=read("services/dashboard-service.js"),view=read("views/dashboard.ejs"),orders=read("views/orders.ejs");assert.match(service,/async function orderStatusMix/);assert.match(service,/\$group:\{_id:"\$status",count:/);assert.match(view,/orderDonutStyle\(\)/);assert.match(view,/orders\?status=/);assert.match(orders,/new URLSearchParams\(location.search\)\.get\('status'\)/);assert.match(view,/can\('orders.view'\)/);
});
test("U29: real fourteen-day IST sales aggregates exclude draft, cancelled and replacement orders",()=>{
 const s=read("services/dashboard-service.js");for(const x of ["salesTrend(now","Asia/Kolkata","taxablePaise","$nin:[\"draft\",\"cancelled\"]","orderType:{$ne:\"replacement\"}","length:14","maxTimeMS:15000"])assert.ok(s.includes(x),x);assert.match(read("views/dashboard.ejs"),/dailyBarStyle\(day\)/);
});
test("U27/U28: real reports and sales insights contain accessible comparative bars and SKU navigation",()=>{
 const reports=read("views/reports.ejs"),sales=read("views/sales-insights.ejs");for(const n of ["topAgents","topSuppliers","agentBarStyle","supplierBarStyle","reportDonutStyle"])assert.ok(reports.includes(n));assert.match(sales,/productLink\(row\)/);assert.match(sales,/\^\[a-f0-9\]\{32\}\$/);assert.match(sales,/background-color/);assert.match(reports,/can\('suppliers.view'\)/);
});
test("U31: receivables aging uses issued outstanding invoice money and separate undated bucket",()=>{
 const s=read("services/finance-service.js"),view=read("views/finance.ejs");for(const val of ["async function receivableAging","outstandingPaise:{$gt:0}","status:\"issued\"","undated","61+","amountPaise","maxTimeMS:15000"])assert.ok(s.includes(val),val);assert.match(view,/agingBar\(item,index\)/);assert.match(view,/receivableAging: \[\]|receivableAging:\[\]/);assert.match(view,/#finance-invoices/);
});
test("U30/U33: inventory explicitly confines derived stock visuals to current page",()=>{
 const s=read("views/inventory.ejs");assert.match(s,/Only the/);assert.match(s,/loaded balance records/);assert.match(s,/this\.balances\.reduce/);assert.match(s,/zeroAvailable\(\)/);assert.match(s,/this\.balances\.filter/);
 const style=read("public/css/b2b-workspace.css"),head=read("views/partials/head.ejs");assert.match(style,/\.crm-visual-grid/);assert.match(style,/@media\(max-width:575\.98px\)/);assert.match(style,/:focus-visible/);assert.match(head,/u24-u33-light-charts/);assert.doesNotMatch(head,/chart\.js|recharts|echarts/i);
});
