"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");

function walk(dir,out=[]){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(["node_modules",".git"].includes(entry.name))continue;const p=path.join(dir,entry.name);entry.isDirectory()?walk(p,out):out.push(p)}return out}

test("production views contain no developer payload or raw JSON controls",()=>{
  for(const file of walk(path.join(root,"views")).filter(x=>x.endsWith(".ejs"))){
    const source=fs.readFileSync(file,"utf8");
    assert.doesNotMatch(source,/Create \/ action payload|x-model=["']payload["']|JSON\.stringify\(data|null,2\)|<pre\b|font-monospace/i,path.relative(root,file));
  }
});

test("every inline production script has a CSP nonce",()=>{
  for(const file of walk(path.join(root,"views")).filter(x=>x.endsWith(".ejs"))){
    const source=fs.readFileSync(file,"utf8");
    for(const match of source.matchAll(/<script([^>]*)>/gi)){
      const attrs=match[1]||"";
      if(/\bsrc\s*=/.test(attrs))continue;
      assert.match(attrs,/\bnonce\s*=/,path.relative(root,file));
    }
  }
});

test("customer and product forms use business-facing units",()=>{
  const customers=fs.readFileSync(path.join(root,"views/customers.ejs"),"utf8");
  const products=fs.readFileSync(path.join(root,"views/product-form.ejs"),"utf8");
  assert.match(customers,/Credit limit ₹/);
  assert.doesNotMatch(customers,/Credit limit paise/i);
  assert.match(products,/GST %/);
  assert.match(products,/MRP ₹/);
  assert.doesNotMatch(products,/GST bps|MRP paise|Reference sell paise|Minimum sell paise/i);
});

test("customer 360 and supplier product comparison remain wired",()=>{
  const customers=fs.readFileSync(path.join(root,"views/customers.ejs"),"utf8");
  const productDetail=fs.readFileSync(path.join(root,"views/product-detail.ejs"),"utf8");
  assert.match(customers,/\/360/);
  assert.match(productDetail,/supplier-offers/);
});

test("legacy simplified mobile bottom navigation is not present",()=>{
  const source=walk(path.join(root,"views")).filter(x=>x.endsWith(".ejs")).map(x=>fs.readFileSync(x,"utf8")).join("\n");
  assert.doesNotMatch(source,/class=["'][^"']*mobile-nav/);
});


test("CRM runtime loads local Alpine first and only reports a real runtime failure",()=>{
  const head=fs.readFileSync(path.join(root,"views/partials/head.ejs"),"utf8");
  const scripts=fs.readFileSync(path.join(root,"views/partials/scripts.ejs"),"utf8");
  const runtime=fs.readFileSync(path.join(root,"public/js/crm-ui-runtime.js"),"utf8");
  const alpineIndex=head.indexOf('/vendor/alpinejs/cdn.min.js');
  const runtimeIndex=head.indexOf('/js/crm-ui-runtime.js');
  assert.ok(alpineIndex>=0,"local Alpine script must be present in the document head");
  assert.ok(runtimeIndex>alpineIndex,"CRM runtime must execute after local Alpine");
  assert.doesNotMatch(scripts,/\/vendor\/alpinejs\/cdn\.min\.js/,"Alpine must not be loaded a second time at the bottom of the page");
  assert.doesNotMatch(runtime,/cdn\.jsdelivr\.net|unpkg\.com/,"runtime fallback must not depend on CSP-blocked external CDNs");
  assert.match(runtime,/window\.addEventListener\('load', showRuntimeError/);
  assert.match(runtime,/if \(window\.Alpine\)/);
});


test("admin shell uses Alpine CSP build without unsafe-eval",()=>{
  const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  assert.doesNotMatch(app,/unsafe-eval/);
  assert.match(app,/@alpinejs\/csp\/dist/);
  assert.equal(pkg.dependencies["@alpinejs/csp"],"3.15.12");
  assert.equal(pkg.dependencies.alpinejs,undefined);
});

test("server rendered admin shell exposes CSRF state without a redundant auth bootstrap call",()=>{
  const head=fs.readFileSync(path.join(root,"views/partials/head.ejs"),"utf8");
  const scripts=fs.readFileSync(path.join(root,"views/partials/scripts.ejs"),"utf8");
  assert.match(head,/meta name="csrf-token"/);
  assert.match(head,/__crmServerAdmin/);
  assert.match(scripts,/X-CSRF-Token/);
  assert.match(scripts,/if\(this\.admin\?\.employeeId\)return/);
});


test("Alpine expressions stay within CSP evaluator syntax",()=>{
  for(const file of walk(path.join(root,"views")).filter(x=>x.endsWith(".ejs"))){
    const source=fs.readFileSync(file,"utf8");
    assert.doesNotMatch(source,/\\bx-html\\s*=/,path.relative(root,file));
    for(const match of source.matchAll(/\\b(?:x-[\\w:.@-]+|@[\\w.:-]+|:[\\w.-]+)=(?:"([^"]*)"|'([^']*)')/g)){
      const expression=match[1]??match[2]??"";
      assert.doesNotMatch(expression,/=>|\\.{3}|\\x60|\\b(?:window|document|JSON|parseInt|parseFloat)\\b/,path.relative(root,file));
    }
  }
});

test("delivery workflow uses dedicated connected pages",()=>{
  const routes=fs.readFileSync(path.join(root,"routes/frontend.js"),"utf8");
  const list=fs.readFileSync(path.join(root,"views/delivery.ejs"),"utf8");
  const assign=fs.readFileSync(path.join(root,"views/delivery-assign.ejs"),"utf8");
  const detail=fs.readFileSync(path.join(root,"views/delivery-detail.ejs"),"utf8");
  const update=fs.readFileSync(path.join(root,"views/delivery-update.ejs"),"utf8");
  assert.match(routes,/\/delivery\/assign/);
  assert.match(routes,/\/delivery\/:deliveryAssignmentId\/update/);
  assert.match(assign,/Warehouse & products/);
  assert.match(assign,/assignedDriverId/);
  assert.match(detail,/Products in this delivery/);
  assert.match(update,/Review & confirm/);
  assert.doesNotMatch(list,/Update delivery<\/h2>/);
});

test("product management uses dedicated HTML and gallery pages",()=>{
  const routes=fs.readFileSync(path.join(root,"routes/frontend.js"),"utf8");
  const form=fs.readFileSync(path.join(root,"views/product-form.ejs"),"utf8");
  const detail=fs.readFileSync(path.join(root,"views/product-detail.ejs"),"utf8");
  assert.match(routes,/\/products\/new/);
  assert.match(routes,/\/products\/:productId\/edit/);
  assert.match(form,/Import HTML/);
  assert.match(form,/descriptionHtml/);
  assert.match(detail,/Photo gallery/);
  assert.match(detail,/setSafeHtml\(\$el, product\?\.descriptionHtml\)/);
});
