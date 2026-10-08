"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const workspace = () => read("public/css/b2b-workspace.css");

test("U1/U2: mobile order wizard has a compact horizontal stepper with natural-height heading", () => {
  const css = workspace();
  const form = read("views/order-form.ejs");
  assert.match(css, /@media\(max-width:767\.98px\)/);
  assert.match(css, /\.crm-order-timeline-card \.crm-order-timeline\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.crm-order-timeline-card \.crm-order-timeline::before\{top:21px;bottom:auto;left:12\.5%;right:12\.5%/);
  assert.match(css, /\.crm-order-timeline-card \.crm-order-timeline-copy small,\s*\.content \.crm-order-timeline-card \.crm-order-timeline-copy em\{display:none\}/);
  assert.match(css, /\.crm-order-wizard-heading>:first-child\{flex:0 1 auto;width:100%\}/);
  assert.match(form, /:aria-current="step===index\+1 \? 'step' : null"/);
  assert.match(form, /:aria-label="label\+' — '\+stageStatus\(index\+1\)"/);
  assert.match(form, /steps:\['Customer','Products','Warehouse','Review'\]/);
});

test("U3/U11: 8px spacing tokens, scoped selectors and cascade order are preserved", () => {
  const css = workspace();
  const head = read("views/partials/head.ejs");
  assert.match(css, /--b2b-space-1:\.5rem/);
  assert.match(css, /--b2b-space-2:1rem/);
  assert.match(css, /--b2b-space-3:1\.5rem/);
  assert.match(css, /--b2b-space-4:2rem/);
  assert.match(css, /\.content \.crm-data-card>\.crm-card-heading/);
  assert.ok(head.indexOf("/css/b2b-workspace.css?") > head.indexOf("/css/app.css?"), "overrides must load after the CRM shell");
  assert.match(head, /b2b-responsive-u1-u12/);
});

test("U4: mobile records use existing card conversion and finance tables scroll locally", () => {
  const css = workspace();
  const orders = read("views/orders.ejs");
  const finance = read("views/finance.ejs");
  const products = read("views/products.ejs");
  assert.match(css, /\.content \.crm-finance-table\{min-width:42rem\}/);
  assert.match(css, /overflow-x:auto;max-width:100%;overscroll-behavior-x:contain/);
  assert.match(css, /\.content \.crm-orders-mobile-card/);
  assert.match(orders, /crm-orders-mobile-card/);
  assert.match(orders, /crm-order-mobile-actions/);
  assert.match(products, /crm-mobile-records/);
  assert.equal((finance.match(/<table class="table crm-table crm-finance-table/g)||[]).length,4);
  assert.match(read("public/js/b2b-workspace.js"), /cell\.dataset\.label=label/);
});

test("U5/U10: mobile navigation controls and visible keyboard focus preserve CRM theme tokens", () => {
  const css = workspace();
  const nav = read("views/partials/navbar.ejs");
  assert.match(css, /\.crm-topbar \.crm-mobile-menu,\s*\.crm-topbar \.crm-topbar-icon\{width:44px;height:44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /--crm-user-accent/);
  assert.match(css, /prefers-contrast:more/);
  assert.match(nav, /:aria-expanded="sidebarOpen\.toString\(\)"/);
  assert.match(nav, /:aria-label="sidebarOpen \? 'Navigation open' : 'Open navigation'"/);
});

test("U6/U7: finance actions guard repeated submissions and mobile wizard actions remain usable", () => {
  const finance = read("views/finance.ejs");
  const css = workspace();
  assert.match(finance, /invoiceSaving:false/);
  assert.match(finance, /if\(!this\.invoiceOrderId\|\|this\.invoiceSaving\)return/);
  assert.match(finance, /:disabled="!invoiceOrderId\|\|invoiceSaving"/);
  for(const id of ["finance-invoice-order", "finance-advance-document", "finance-settlement-document", "finance-settlement-amount"])
    assert.ok(finance.includes('for="'+id+'"') && finance.includes('id="'+id+'"'), id);
  assert.match(css, /\.content \.crm-order-stage-actions\{bottom:env\(safe-area-inset-bottom,0px\)/);
  assert.match(css, /\.content \.crm-order-stage-actions>\.btn\{min-height:44px\}/);
});

test("U8: dashboard, products, customers and finance have actionable loading/error/empty states", () => {
  const dash=read("views/dashboard.ejs");
  const products=read("views/products.ejs");
  const customers=read("views/customers.ejs");
  const finance=read("views/finance.ejs");
  assert.match(dash, /Retry dashboard/);
  assert.match(dash, /Loading dashboard metrics/);
  assert.match(products, /loadProducts\(\)">Retry/);
  assert.match(products, /!loading && !error && !items\.length/);
  assert.match(customers, /Clear filters/);
  assert.match(finance, /Loading finance data/);
  assert.match(finance, /Refresh data/);
});

test("U9/U12: tablet/laptop layout rules and regression viewport checklist are maintained", () => {
  const css=workspace();
  const manual=read("docs/RESPONSIVE_QA.md");
  assert.match(css, /@media\(min-width:768px\) and \(max-width:1199\.98px\)/);
  for(const width of [360,375,390,430,768,1024,1280,1440])
    assert.match(manual,new RegExp("\\b"+width+"px\\b"));
  assert.match(manual, /iOS Safari/);
  assert.match(manual, /not a substitute for a live browser/);
});

test("order wizard error feedback never emits duplicate HTML role attributes", () => {
  const form = read("views/order-form.ejs");
  const tag = form.match(/<div x-show="error"[^>]*>/)?.[0]||"";
  assert.equal((tag.match(/\brole=/g)||[]).length,1);
});
