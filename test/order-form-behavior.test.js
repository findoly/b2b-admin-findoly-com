"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {randomUUID}=require("node:crypto");

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
function harness(){
  const pending=[],timers=new Map(),storage=new Map();let timerId=0;
  const context=vm.createContext({
    crypto:{randomUUID},AbortController,requestIdempotencyKey:randomUUID,
    apiFetch(url,options){const request=deferred();pending.push({url,options,...request});return request.promise;},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    setTimeout:callback=>{timers.set(++timerId,callback);return timerId;},clearTimeout:id=>timers.delete(id),
    showCrmToast(){},location:{href:""}
  });
  const source=fs.readFileSync(path.join(__dirname,"../views/order-form.ejs"),"utf8");
  const script=source.match(/<script nonce="<%= cspNonce %>">([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script,context);
  const page=context.orderFormPage();page.$watch=()=>{};
  return {page,pending,timers,storage,context};
}

test("product search preserves every selected product snapshot",async()=>{
  const {page,pending}=harness();
  page.products=[{productId:"first",name:"Rice"},{productId:"second",name:"Oil"}];
  page.form.lines=[{productId:"first",quantity:1},{productId:"second",quantity:2}];
  page.productSearch="soap";
  const search=page.searchProducts();
  pending[0].resolve({data:{items:[{productId:"third",name:"Soap"}]}});await search;
  assert.equal(page.product("first").name,"Rice");
  assert.equal(page.product("second").name,"Oil");
  assert.equal(page.product("third").name,"Soap");
});

test("customer search preserves selected account and prefers refreshed matching records",async()=>{
  const {page,pending}=harness();
  page.customers=[{customerId:"chosen",businessName:"Original"}];page.form.customerId="chosen";page.customerSearch="other";
  let search=page.searchCustomers();pending[0].resolve({data:{items:[{customerId:"other",businessName:"Other"}]}});await search;
  assert.equal(page.selectedCustomer.businessName,"Original");
  search=page.searchCustomers();pending[1].resolve({data:{items:[{customerId:"chosen",businessName:"Updated"}]}});await search;
  assert.equal(page.selectedCustomer.businessName,"Updated");
  assert.equal(page.customers.filter(x=>x.customerId==="chosen").length,1);
});

for(const domain of ["product","customer"]){
  const method=domain==="product"?"searchProducts":"searchCustomers",collection=domain==="product"?"products":"customers",key=domain+"Id";
  test(`${domain} search ignores obsolete responses even if transport does not honor abort`,async()=>{
    const {page,pending}=harness();page[domain+"Search"]="older";const old=page[method]();
    page[domain+"Search"]="newer";const current=page[method]();
    assert.equal(pending[0].options.signal.aborted,true);
    pending[1].resolve({data:{items:[{[key]:"new"}]}});await current;
    pending[0].resolve({data:{items:[{[key]:"old"}]}});await old;
    assert.equal(page[collection][0][key],"new");
  });
  test(`${domain} search cancels pending work when query is cleared`,async()=>{
    const {page,pending}=harness();page[domain+"Search"]="older";const old=page[method]();
    page[domain+"Search"]="";await page[method]();assert.equal(pending[0].options.signal.aborted,true);
    pending[0].reject(new Error("Obsolete failure"));await old;
    assert.equal(page.error,"");
  });
}

function prepareStockCheck(page){page.step=2;page.form.customerId="customer";page.form.lines=[{productId:"rice",quantity:1}];}
const stockResult={data:{warehouses:[{warehouseId:"warehouse",canFulfilAll:true}],recommendedWarehouseId:"warehouse"}};

test("editing demand invalidates an in-flight stock check and prevents advancing",async()=>{
  const {page,pending}=harness();prepareStockCheck(page);const next=page.next();
  page.form.lines[0].quantity=20;page.productsChanged();
  assert.equal(pending[0].options.signal.aborted,true);
  pending[0].resolve(stockResult);await next;
  assert.equal(page.step,2);assert.equal(page.form.warehouseId,"");assert.equal(page.warehouses.length,0);
  assert.equal(page.warehouseAvailabilityLoading,false);
});

test("duplicate Continue clicks make only one stock check",async()=>{
  const {page,pending}=harness();prepareStockCheck(page);const next=page.next();const duplicate=page.next();
  assert.equal(pending.length,1);pending[0].resolve(stockResult);await Promise.all([next,duplicate]);assert.equal(page.step,3);
});

test("returning to Customer prevents a late stock response from advancing the wizard",async()=>{
  const {page,pending}=harness();prepareStockCheck(page);const next=page.next();page.go(1);
  assert.equal(pending[0].options.signal.aborted,true);pending[0].resolve(stockResult);await next;
  assert.equal(page.step,1);assert.equal(page.form.warehouseId,"");
});

test("repeated Create clicks submit one order and cancel pending draft persistence",async()=>{
  const {page,pending,timers,context}=harness();prepareStockCheck(page);page.form.warehouseId="warehouse";
  page.form.lines[0].unitPriceRupees="";page.scheduleDraftSave();
  const create=page.createOrder(),duplicate=page.createOrder();assert.equal(pending.length,1);
  pending[0].resolve({data:{salesOrderId:"created-order"}});await Promise.all([create,duplicate]);
  assert.equal(context.location.href,"/orders/created-order");assert.equal(timers.size,0);assert.equal(page.saving,false);
});

test("obsolete stock request cannot clear the newer request loading state",async()=>{
  const {page,pending}=harness();prepareStockCheck(page);const old=page.next();page.productsChanged();const current=page.next();
  pending[0].resolve(stockResult);await old;assert.equal(page.warehouseAvailabilityLoading,true);assert.equal(page.step,2);
  pending[1].resolve(stockResult);await current;assert.equal(page.warehouseAvailabilityLoading,false);assert.equal(page.step,3);
});

test("failed stock checks keep user on Products with actionable error",async()=>{
  const {page,pending}=harness();prepareStockCheck(page);const next=page.next();pending[0].reject(new Error("Stock service unavailable"));await next;
  assert.equal(page.step,2);assert.equal(page.error,"Stock service unavailable");assert.equal(page.warehouseAvailabilityLoading,false);
});

test("clearing a completed draft cancels delayed writes",()=>{
  const {page,timers,storage}=harness();page.scheduleDraftSave();assert.equal(timers.size,1);page.clearDraft();
  assert.equal(timers.size,0);assert.equal(storage.size,0);
});
