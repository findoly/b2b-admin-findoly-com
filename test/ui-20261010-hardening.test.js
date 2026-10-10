"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("B01: finance options are bounded, minimal and guarded independently from master directory permissions",()=>{
  const routes=read("routes/finance.js");
  const selectors=read("services/ui-selection-service.js");
  const page=read("views/finance.ejs");
  assert.match(routes,/\/options\/customers",requirePermission\("finance\.view"\)/);
  assert.match(routes,/\/options\/suppliers",requirePermission\("finance\.view"\)/);
  assert.match(routes,/\/options\/orders",requirePermission\("finance\.invoice"\)/);
  assert.match(selectors,/pageQuery\(query\)/);
  assert.match(selectors,/\.skip\(skip\)\.limit\(limit\)\.lean\(\)/);
  assert.match(selectors,/\{customerId:1,businessName:1\}/);
  assert.match(selectors,/\{supplierId:1,businessName:1\}/);
  assert.match(page,/Promise\.allSettled\(requests\.map/);
  assert.doesNotMatch(page,/apiFetch\('\/api\/customers\?limit=50'\)/);
  assert.doesNotMatch(page,/apiFetch\('\/api\/suppliers\?limit=50'\)/);
});

test("B02: sales order creation has its own scoped customer and mapped SKU selectors",()=>{
  const routes=read("routes/orders.js"),form=read("views/order-form.ejs");
  assert.match(routes,/\/options\/customers",requirePermission\("orders\.create"\)/);
  assert.match(routes,/\/options\/customers\/:customerId\/products",requirePermission\("orders\.create"\)/);
  assert.match(form,/\/api\/orders\/options\/customers\?limit=50/);
  assert.match(form,/\/api\/orders\/options\/customers\/\x27\+customerId\+\x27\/products/);
  assert.doesNotMatch(form,/apiFetch\('\/api\/customers\?/);
});

test("B03: default navigation lands on an authorized page, including custom roles",()=>{
  const {firstAuthorizedPath}=require("../middleware/auth");
  assert.equal(firstAuthorizedPath({permissions:["orders.create"]}),"/orders/new");
  assert.equal(firstAuthorizedPath({permissions:["finance.view"]}),"/finance");
  assert.equal(firstAuthorizedPath({permissions:["*"]}),"/dashboard");
  assert.equal(firstAuthorizedPath({permissions:[]}),"/access-denied");
  assert.match(read("middleware/auth.js"),/guestOnly\(req,res,next\).*firstAuthorizedPath/);
  assert.match(read("controllers/authController.js"),/homePath:firstAuthorizedPath\(session\)/);
  assert.match(read("views/login.ejs"),/b\.data\?\.homePath/);
  assert.match(read("views/partials/navbar.ejs"),/href="<%= homePath/);
});

test("B04/B05: finance dates follow India calendar and irreversible actions report busy state",()=>{
  const page=read("views/finance.ejs"),shared=read("views/partials/scripts.ejs");
  assert.match(shared,/function indiaToday\(\)\{return new Date\(Date\.now\(\)\+330\*60000\)/);
  assert.doesNotMatch(page,/paidAt:new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
  assert.match(page,/paidAt:indiaToday\(\)/);
  for(const flag of["advanceSaving","settlementSaving","reconcileId"]){
    assert.match(page,new RegExp(flag));
  }
  assert.match(page,/async allocateAdvance\(\)\{if\(this\.advanceSaving\)return/);
  assert.match(page,/async applySettlement\(\)\{if\(this\.settlementSaving\)return/);
  assert.match(page,/async reconcile\(p\)\{if\(this\.reconcileId\)return/);
});

test("B06–B08: disclosure choice and URL defaults are retained without full table rescans",()=>{
  const workspace=read("public/js/b2b-workspace.js");
  const filters=read("public/js/mobile-filters.js");
  assert.match(workspace,/crmMobileOpen/);
  assert.match(workspace,/touchedTables/);
  assert.match(workspace,/initialized\?Array\.from\(touchedTables\)/);
  assert.match(filters,/const supplied = params\.has\(key\)/);
  assert.match(filters,/control\.defaultChecked/);
  assert.match(filters,/option\.defaultSelected/);
  assert.match(filters,/window\.addEventListener\('popstate'/);
  const head=read("views/partials/head.ejs");
  assert.match(head,/b2b-workspace\.js\?v=20261010-ui-stability/);
});
