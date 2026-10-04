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

function preparePrice(page){
  page.form.customerId='customer-a';const line=page.newLine();line.productId='rice';page.form.lines=[line];return line;
}
function priceResult(unitPricePaise,source='negotiated'){return {data:{unitPricePaise,source}};}

test('selecting a mapped product populates negotiated rupees and submits that price',async()=>{
  const {page,pending}=harness(),line=preparePrice(page);
  const lookup=page.productChanged(line);assert.equal(line.priceLoading,true);
  assert.match(pending[0].url,/customerId=customer-a&productId=rice&quantity=1/);
  pending[0].resolve(priceResult(12345));await lookup;
  assert.equal(line.unitPriceRupees,'123.45');assert.equal(page.priceLabel(line),'Negotiated customer price');
  page.form.warehouseId='warehouse';const create=page.createOrder();
  assert.equal(JSON.parse(pending[1].options.body).lines[0].unitPricePaise,12345);
  pending[1].resolve({data:{salesOrderId:'order'}});await create;
});

test('changing quantity refreshes automatic price and supports zero negotiated price',async()=>{
  const {page,pending}=harness(),line=preparePrice(page);line.quantity=10;
  let lookup=page.quantityChanged(line);pending[0].resolve(priceResult(0));await lookup;
  assert.equal(line.unitPriceRupees,'0.00');
  line.quantity=1;lookup=page.quantityChanged(line);pending[1].resolve(priceResult(5000,'reference'));await lookup;
  assert.equal(line.unitPriceRupees,'50.00');assert.match(page.priceLabel(line),/Reference price/);
});

test('changing customer resets the old price and ignores its late response',async()=>{
  const {page,pending}=harness(),line=preparePrice(page);
  const old=page.productChanged(line);page.form.customerId='customer-b';const current=page.customerChanged();
  assert.equal(pending[0].options.signal.aborted,true);
  pending[1].resolve(priceResult(8000));await current;pending[0].resolve(priceResult(12000));await old;
  assert.equal(line.unitPriceRupees,'80.00');assert.equal(line.priceLoading,false);
});

test('manual edits survive late quotes and quantity changes; reset restores customer pricing',async()=>{
  const {page,pending}=harness(),line=preparePrice(page);const old=page.productChanged(line);
  line.unitPriceRupees='75.50';page.priceEdited(line);pending[0].resolve(priceResult(5000));await old;
  line.quantity=2;await page.quantityChanged(line);assert.equal(pending.length,1);assert.equal(line.unitPriceRupees,'75.50');
  const reset=page.refreshLinePrice(line,true);pending[1].resolve(priceResult(6000));await reset;
  assert.equal(line.unitPriceRupees,'60.00');assert.equal(line.priceMode,'auto');
});

test('changing product clears manual pricing from the previous product',async()=>{
  const {page,pending}=harness(),line=preparePrice(page);line.unitPriceRupees='75';page.priceEdited(line);
  line.productId='oil';const lookup=page.productChanged(line);assert.equal(line.unitPriceRupees,'');
  pending[0].resolve(priceResult(9000));await lookup;assert.equal(line.unitPriceRupees,'90.00');
});

test('failed lookup blocks progression until Retry resolves the price',async()=>{
  const {page,pending}=harness(),line=preparePrice(page);page.step=2;
  let lookup=page.productChanged(line);assert.equal(page.validateStep(3),false);
  pending[0].reject(new Error('Pricing temporarily unavailable'));await lookup;
  assert.equal(line.priceError,'Pricing temporarily unavailable');assert.equal(page.validateStep(3),false);
  lookup=page.refreshLinePrice(line);pending[1].resolve(priceResult(5000));await lookup;
  assert.equal(line.priceError,'');assert.equal(page.validateStep(3),true);
});

test('clearing a product cancels its old price lookup',async()=>{
  const {page,pending}=harness(),line=preparePrice(page);const lookup=page.productChanged(line);
  line.productId='';await page.productChanged(line);pending[0].resolve(priceResult(5000));await lookup;
  assert.equal(line.unitPriceRupees,'');assert.equal(line.priceLoading,false);
});

test('restored automatic drafts re-fetch prices instead of retaining a stale agreement',async()=>{
  const {page,pending,storage}=harness(),line=preparePrice(page);line.unitPriceRupees='999.00';
  storage.set('findoly.b2b.order-draft.v1',JSON.stringify({form:page.form,products:[]}));
  const loading=page.load();pending[0].resolve({data:{items:[]}});pending[1].resolve({data:{items:[]}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,3);
  pending[2].resolve(priceResult(5500));await loading;assert.equal(page.form.lines[0].unitPriceRupees,'55.00');
});
