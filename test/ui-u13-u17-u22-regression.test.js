"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const cases=[
 ["warehouse-form",["saving","warehouse-field-"]],
 ["employees",["employeeSaving","employee-field-"]],
 ["suppliers",["supplierSaving","supplier-field-"]],
 ["pricing",["priceSaving","price-field-"]],
 ["returns",["saving","return-field-"]],
 ["audit",["audit-field-"]],
 ["procurement",["aria-label=\"Search purchase orders or suppliers\""]]
];
test("U13: CRM form labels explicitly associate with controls",()=>{
 for(const [page] of cases){const s=read("views/"+page+".ejs");for(const m of s.matchAll(/<label class="form-label"[^>]*for="([^"]+)"[^>]*>/g))assert.match(s,new RegExp('id="'+m[1]+'"'),page+" label missing control");}
 for(const p of ["warehouse-form","employees","suppliers","pricing","returns","audit"])assert.match(read("views/"+p+".ejs"),/class="form-label" for="/);
});
test("U14/U16: audit and return lists distinguish load, error, zero results, and convert to mobile records",()=>{
 const a=read("views/audit.ejs"),r=read("views/returns.ejs");
 for(const s of [a,r]){assert.match(s,/crm-mobile-records/);assert.match(s,/role="alert"/);assert.match(s,/crm-table-loading/);assert.match(s,/!loading && !error && !/);assert.match(s,/finally\{this.loading=false\}/);}
 assert.match(a,/this.loading=true;this.error='';try/);
 assert.match(r,/aria-label="Loading returns"/);
});
test("U15/U22: return and master creation operations guard duplicate transactions",()=>{
 for(const [page,flag,fn] of [["returns","saving","createReturn"],["returns","processingBusy","processReturn"],["warehouse-form","saving","save"],["employees","employeeSaving","createEmployee"],["suppliers","supplierSaving","createSupplier"],["pricing","priceSaving","createPrice"]]){
  const s=read("views/"+page+".ejs");assert.ok(s.includes("async "+fn+"(){if(this."+flag+")return"),page+" "+fn+" missing early guard");assert.ok(s.includes("finally{this."+flag+"=false}"),page+" "+fn+" missing finalizer");assert.ok(s.includes(':disabled="'+flag+'"'),page+" "+fn+" missing disabled UI");
 }
});
test("U17: return quantities and dynamic line controls communicate validation and accessible purpose",()=>{
 const s=read("views/returns.ejs");assert.match(s,/Number.isInteger\(l.quantity\)/);assert.match(s,/Return quantity must be a whole number/);
 for(const name of ["Return quantity for ","Stock source for ","Return reason for ","Outcome for "])assert.ok(s.includes(name),name);
});
test("U13/U22: required documented screens and responsive checklist cover release",()=>{
 for(const [page,tokens] of cases){const s=read("views/"+page+".ejs");for(const t of tokens)assert.ok(s.includes(t),page+" missing "+t)}
 assert.match(read("docs/RESPONSIVE_QA.md"),/U13–U17\/U22/);
});
