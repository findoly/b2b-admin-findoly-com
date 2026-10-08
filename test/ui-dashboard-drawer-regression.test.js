"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

test("B1/B2: Bootstrap display utilities never override Alpine-controlled error visibility",()=>{
  for(const file of ["views/dashboard.ejs","views/products.ejs","views/finance.ejs"]){
    const src=read(file);
    const tag=src.match(/<div x-show="error"[^>]*>/)?.[0];
    assert.ok(tag,"Expected conditional error alert in "+file);
    assert.match(tag,/x-cloak/);
    assert.match(tag,/role="alert"/);
    assert.doesNotMatch(tag,/class="[^"]*\bd-(?:flex|block|grid|inline-flex|inline-block)\b/,"Bootstrap display !important overrides x-show in "+file);
    assert.match(src,/<div x-show="error"[^>]*><div class="d-flex flex-wrap justify-content-between align-items-center gap-2">/);
    assert.match(src,/<span x-text="error"><\/span>/);
    assert.doesNotMatch(src,/x-show="error"[^>]*class="[^"]*\bd-flex\b/);
  }
});

test("B1: Dashboard shows metrics only when the request is settled and error-free",()=>{
  const src=read("views/dashboard.ejs");
  assert.match(src,/x-show="!loading && !error" x-cloak class="crm-metric-grid/);
  assert.match(src,/Retry dashboard/);
  assert.match(src,/this\.loading=true;this\.error='';try/);
  assert.match(src,/class="crm-page-header crm-dashboard-page-header"|class="page-header page-header-light crm-page-header crm-dashboard-page-header"/);
});

test("B3/B4: mobile drawer has compact non-colliding header and keyboard-accessible close",()=>{
  const view=read("views/partials/sidebar.ejs"),style=read("public/css/b2b-workspace.css");
  const scripts=read("views/partials/scripts.ejs");
  assert.match(view,/class="crm-sidebar-brand"/);
  assert.match(view,/class="crm-sidebar-mobile-title">Menu<\/strong>/);
  assert.match(view,/aria-label="Close navigation"/);
  assert.match(view,/class="crm-sidebar-close"[^>]*><svg viewBox/);
  assert.match(style,/@media\(max-width:991\.98px\)/);
  assert.match(style,/\.crm-sidebar \.crm-sidebar-close\{/);
  assert.match(style,/width:44px;height:44px/);
  assert.match(style,/\.crm-sidebar \.crm-sidebar-close:focus-visible/);
  assert.match(style,/\.crm-sidebar \.sidebar-section\.pt-2\{padding-top:\.125rem!important\}/);
  assert.match(view,/@keydown\.escape\.window="closeSidebar\(\)"/);
  assert.match(view,/@keydown\.tab="trapSidebarFocus\(\$event\)"/);
  assert.match(scripts,/closeSidebar\(\)/);
});

test("B5: dashboard phone heading opts out of inherited oversized flex-basis",()=>{
  const css=read("public/css/b2b-workspace.css"),view=read("views/dashboard.ejs");
  assert.match(view,/crm-dashboard-page-header/);
  assert.match(css,/\.crm-dashboard-page-header \.crm-page-heading>:first-child\{\s*flex:0 1 auto/);
  assert.match(css,/\.crm-dashboard-page-header \.crm-page-heading\{/);
  assert.match(css,/\.crm-dashboard-page-header \.crm-primary-action\{flex:0 0 auto;width:100%\}/);
});

test("B6: style changes invalidate cache and responsive browser checklist includes both regressions",()=>{
  const head=read("views/partials/head.ejs"),qa=read("docs/RESPONSIVE_QA.md");
  assert.match(head,/b2b-responsive-u1-u12-b1-b6/);
  assert.match(qa,/No blank pink\/red Retry dashboard banner/);
  assert.match(qa,/no oversized gap before Workspace/);
});
