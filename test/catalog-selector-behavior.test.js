"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){const pending=[];const context=vm.createContext({URLSearchParams,apiFetch:url=>new Promise(resolve=>pending.push({url,resolve}))});vm.runInContext(fs.readFileSync(require.resolve('../public/js/catalogue-fields.js'),'utf8'),context);const page=context.catalogueFields();page.form={categoryId:'chosen',category:'Saved category',subcategoryId:'chosen-sub',subcategory:'Saved subcategory'};return{page,pending};}
test('paginating categories replaces retained selections without duplicate option keys',async()=>{
 const {page,pending}=harness();let request=page.loadCategories();pending[0].resolve({data:{items:[{categoryId:'first',name:'First'}],pages:2}});await request;assert.equal(page.categoryOptions.length,2);
 request=page.loadCategories(true);pending[1].resolve({data:{items:[{categoryId:'chosen',name:'Current category name'}],pages:2}});await request;
 assert.equal(page.categoryOptions.length,2);assert.equal(page.categoryOptions.find(x=>x.categoryId==='chosen').name,'Current category name');
});
test('paginating subcategories replaces retained selections without duplicate option keys',async()=>{
 const {page,pending}=harness();let request=page.loadSubcategories();pending[0].resolve({data:{items:[{subcategoryId:'first-sub',name:'First'}],pages:2}});await request;
 request=page.loadSubcategories(true);pending[1].resolve({data:{items:[{subcategoryId:'chosen-sub',name:'Current subcategory name'}],pages:2}});await request;
 assert.equal(page.subcategoryOptions.length,2);assert.equal(page.subcategoryOptions.find(x=>x.subcategoryId==='chosen-sub').name,'Current subcategory name');
});
test('changing a category discards an obsolete subcategory response and clears the old selection',async()=>{
 const {page,pending}=harness();const old=page.loadSubcategories();page.form.categoryId='new';const current=page.categoryChanged();
 pending[1].resolve({data:{items:[{subcategoryId:'new-sub',name:'New'}],pages:1}});await current;pending[0].resolve({data:{items:[{subcategoryId:'old-sub',name:'Old'}],pages:1}});await old;
 assert.equal(page.form.subcategoryId,'');assert.equal(page.subcategoryOptions.length,1);assert.equal(page.subcategoryOptions[0].subcategoryId,'new-sub');
});
test('managed products and new products cannot silently save an empty category',async()=>{
 const context=vm.createContext({catalogueFields:()=>({}),apiFetch:()=>{throw new Error('Unexpected submission');}});
 const source=fs.readFileSync(require.resolve('../views/product-form.ejs'),'utf8').match(/<script nonce="<%= cspNonce %>">([\s\S]*?)<\/script>/)[1];vm.runInContext(source,context);
 for(const editing of [false,true]){const page=context.productFormPage();page.editing=editing;page.originalCategoryId=editing?'chosen':'';page.form=page.blankForm();page.form.name='Rice';page.form.sku='RICE';await page.save();assert.equal(page.error,'Select a category before saving.');}
});
test('a completed pin save does not replace the confirmation on a newly selected location',async()=>{
 let resolve;const context=vm.createContext({apiFetch:()=>new Promise(yes=>{resolve=yes;}),showCrmToast(){}});vm.runInContext(fs.readFileSync(require.resolve('../public/js/operations-map.js'),'utf8'),context);
 const page=context.operationsMapPage(),first={key:'first',entityType:'customer',entityId:'id',addressSlot:'billing',addressHash:'hash'},second={key:'second'};page.rows=[first,second];page.selected=first;page.latitude='19';page.longitude='73';const saving=page.savePin();page.selected=second;page.lookupMessage='Review second location';resolve({data:{location:{latitude:19,longitude:73,source:'manual'}}});await saving;
 assert.equal(page.selected.key,'second');assert.equal(page.lookupMessage,'Review second location');assert.equal(first.location.latitude,19);
});
