"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("dashboard primary action and recent order links target dedicated pages",()=>{
  const source=read("views/dashboard.ejs");
  assert.match(source,/href="\/orders\/new"/);
  assert.match(source,/:href="'\/orders\/'\+order\.salesOrderId"/);
});

test("mobile controls retain 44px minimum touch sizes",()=>{
  const source=read("public/css/mobile-filters.css");
  assert.doesNotMatch(source,/min-height:\s*42px/);
  assert.match(source,/min-height:\s*44px/);
  const workspace=read("public/css/b2b-workspace.css");
  assert.match(workspace,/crm-order-stage-actions\{position:sticky/);
});

test("shared navigation traps focus and restores it on close",()=>{
  const sidebar=read("views/partials/sidebar.ejs");
  const scripts=read("views/partials/scripts.ejs");
  assert.match(sidebar,/trapSidebarFocus\(\$event\)/);
  assert.match(sidebar,/:inert="mobileViewport && !sidebarOpen"/);
  assert.match(scripts,/openSidebar\(\)/);
  assert.match(scripts,/closeSidebar\(\)/);
  assert.match(scripts,/trapSidebarFocus\(event\)/);
});

test("finance and warehouse actions prevent concurrent requests",()=>{
  const finance=read("views/finance.ejs");
  const fulfil=read("views/order-fulfilment.ejs");
  assert.match(finance,/:disabled="paymentSaving"/);
  assert.match(finance,/if\(this\.paymentSaving\)return/);
  assert.match(finance,/finally\{this\.paymentSaving=false\}/);
  assert.match(fulfil,/if\(this\.busy\)return/);
  assert.match(fulfil,/e\.status===409/);
});

test("S3 views show measurable upload progress",()=>{
  for(const file of["views/storage.ejs","views/product-detail.ejs"]){
    const source=read(file);
    assert.match(source,/putPresignedUpload\([^\n]*percent=>/);
    assert.match(source,/<progress /);
    assert.match(source,/uploadProgress/);
  }
});

test("reports and list views provide loading and empty-result feedback",()=>{
  const reports=read("views/reports.ejs");
  assert.match(reports,/Loading business report/);
  assert.match(reports,/:disabled="loading"/);
  assert.match(reports,/No supplier activity in this range/);
  for(const file of["views/orders.ejs","views/products.ejs"])
    assert.match(read(file),/Clear filters/);
});
