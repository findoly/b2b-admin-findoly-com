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
  const products=fs.readFileSync(path.join(root,"views/products.ejs"),"utf8");
  assert.match(customers,/Credit limit ₹/);
  assert.doesNotMatch(customers,/Credit limit paise/i);
  assert.match(products,/GST %/);
  assert.match(products,/MRP ₹/);
  assert.doesNotMatch(products,/GST bps|MRP paise|Reference sell paise|Minimum sell paise/i);
});

test("customer 360 and supplier product comparison remain wired",()=>{
  const customers=fs.readFileSync(path.join(root,"views/customers.ejs"),"utf8");
  const products=fs.readFileSync(path.join(root,"views/products.ejs"),"utf8");
  assert.match(customers,/\/360/);
  assert.match(products,/supplier-offers/);
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
