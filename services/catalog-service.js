"use strict";
const Category=require("../models/Category");
const Subcategory=require("../models/Subcategory");
const {pageQuery,escapedRegex}=require("../utils/pagination");
const {textValue,requiredUuid,nonNegativeInteger,booleanValue}=require("../utils/validation");
const nameKey=value=>String(value||"").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
function definition(kind){if(kind==="categories")return{Model:Category,id:"categoryId"};if(kind==="subcategories")return{Model:Subcategory,id:"subcategoryId"};throw Object.assign(new Error("Unknown catalogue section"),{status:404});}
async function list(kind,query={}){
 const {Model}=definition(kind),{page,limit,skip}=pageQuery(query),filter={};
 if(query.search)filter.name=new RegExp(escapedRegex(String(query.search).slice(0,120)),"i");
 if(query.active!==undefined&&query.active!=="")filter.active=booleanValue(query.active);
 if(kind==="subcategories"&&query.categoryId)filter.categoryId=requiredUuid(query.categoryId,"Category");
 const [items,total]=await Promise.all([Model.find(filter).sort({displayOrder:1,name:1}).skip(skip).limit(limit).lean(),Model.countDocuments(filter)]);
 if(kind==="subcategories"){
  const ids=[...new Set(items.map(x=>x.categoryId))];const parents=await Category.find({categoryId:{$in:ids}}).limit(ids.length||1).lean();const names=new Map(parents.map(x=>[x.categoryId,x.name]));
  for(const item of items)item.categoryName=names.get(item.categoryId)||"Unknown category";
 }
 return{items,page,limit,total,pages:Math.max(1,Math.ceil(total/limit))};
}
async function get(kind,value){const{Model,id}=definition(kind);const item=await Model.findOne({[id]:requiredUuid(value,"Catalogue item")}).lean();if(!item)throw Object.assign(new Error("Catalogue item not found"),{status:404});return item;}
async function save(kind,value,input,actor){
 const{Model,id}=definition(kind);const before=value?await get(kind,value):null;
 const name=textValue(input.name,{label:"Name",required:true,maxLength:120});
 const patch={name,nameKey:nameKey(name),description:textValue(input.description,{label:"Description",maxLength:2000}),displayOrder:nonNegativeInteger(input.displayOrder??0,"Display order"),active:booleanValue(input.active,true),updatedBy:actor};
 if(patch.displayOrder>100000)throw Object.assign(new Error("Display order cannot exceed 100000"),{status:400});
 if(kind==="subcategories"){
  const categoryId=requiredUuid(input.categoryId||before?.categoryId,"Category");
  if(before&&categoryId!==before.categoryId)throw Object.assign(new Error("A subcategory's parent cannot be changed"),{status:409});
  const parent=await Category.findOne({categoryId}).lean();
  if(!parent||(!before&&!parent.active))throw Object.assign(new Error("Select an active parent category"),{status:400});
  if(!before)patch.categoryId=categoryId;
 }
 try{return before?await Model.findOneAndUpdate({[id]:value},{$set:patch},{new:true,runValidators:true}).lean():(await Model.create({...patch,createdBy:actor})).toObject();}
 catch(error){if(error.code===11000)throw Object.assign(new Error("This name already exists in the selected catalogue group"),{status:409});throw error;}
}
async function resolveProduct(input,current=null){
 // Old API clients may retain existing names. They cannot create taxonomy implicitly.
 if(input.categoryId===undefined&&input.subcategoryId===undefined&&current&&
    (input.category===undefined||input.category===current.category)&&
    (input.subcategory===undefined||input.subcategory===current.subcategory))return{categoryId:current.categoryId||"",subcategoryId:current.subcategoryId||"",category:current.category||"",subcategory:current.subcategory||""};
 const categoryId=input.categoryId?requiredUuid(input.categoryId,"Category"):"";
 const category=categoryId?await Category.findOne({categoryId}).lean():await Category.findOne({nameKey:nameKey(input.category),active:true}).lean();
 if(!category)throw Object.assign(new Error("Select a managed category. Create it in Categories first."),{status:400});
 if(!category.active&&current?.categoryId!==category.categoryId)throw Object.assign(new Error("Selected category is inactive"),{status:400});
 let subcategory=null;
 if(input.subcategoryId)subcategory=await Subcategory.findOne({subcategoryId:requiredUuid(input.subcategoryId,"Subcategory"),categoryId:category.categoryId}).lean();
 else if(input.subcategoryId===undefined&&input.subcategory)subcategory=await Subcategory.findOne({categoryId:category.categoryId,nameKey:nameKey(input.subcategory)}).lean();
 if((input.subcategoryId!==undefined?input.subcategoryId:input.subcategory)&&!subcategory)throw Object.assign(new Error("Subcategory does not belong to this category"),{status:400});
 if(subcategory&&!subcategory.active&&current?.subcategoryId!==subcategory.subcategoryId)throw Object.assign(new Error("Selected subcategory is inactive"),{status:400});
 return{categoryId:category.categoryId,subcategoryId:subcategory?.subcategoryId||"",category:category.name,subcategory:subcategory?.name||""};
}
async function decorateProducts(products){
 const categoryIds=[...new Set(products.map(x=>x.categoryId).filter(Boolean))],subcategoryIds=[...new Set(products.map(x=>x.subcategoryId).filter(Boolean))];
 const [categories,subcategories]=await Promise.all([categoryIds.length?Category.find({categoryId:{$in:categoryIds}}).select({categoryId:1,name:1}).limit(categoryIds.length).lean():[],subcategoryIds.length?Subcategory.find({subcategoryId:{$in:subcategoryIds}}).select({subcategoryId:1,categoryId:1,name:1}).limit(subcategoryIds.length).lean():[]]);
 const byCategory=new Map(categories.map(x=>[x.categoryId,x])),bySubcategory=new Map(subcategories.map(x=>[x.subcategoryId,x]));
 return products.map(product=>({...product,category:byCategory.get(product.categoryId)?.name||product.category||"",subcategory:bySubcategory.get(product.subcategoryId)?.name||product.subcategory||""}));
}
module.exports={list,get,save,resolveProduct,nameKey,decorateProducts};
