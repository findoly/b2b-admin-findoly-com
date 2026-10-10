"use strict";
const Customer=require("../models/Customer");
const Supplier=require("../models/Supplier");
const SalesOrder=require("../models/SalesOrder");
const customerProducts=require("./customer-product-mapping-service");
const {pageQuery,escapedRegex}=require("../utils/pagination");
const {requiredUuid}=require("../utils/validation");

// Read-only, bounded selectors for employees whose workflow permission does
// not imply access to the full customer, supplier or sales-order directories.
async function selectPage(Model,filter,fields,query={},sort={businessName:1}){
  const {page,limit,skip}=pageQuery(query);
  const [items,total]=await Promise.all([
    Model.find(filter).select(fields).sort(sort).skip(skip).limit(limit).lean(),
    Model.countDocuments(filter)
  ]);
  return {items,page,limit,total,pages:Math.ceil(total/limit)||1};
}
function searchFilter(query,fields){
  const search=String(query.search||"").trim().slice(0,120);
  if(!search)return {};
  const rx=new RegExp(escapedRegex(search),"i");
  return {$or:fields.map(field=>({[field]:rx}))};
}
function orderCustomers(query={}){
  return selectPage(Customer,{status:"active",...searchFilter(query,["businessName","mobile"])},
    {customerId:1,businessName:1,mobile:1,customerType:1,creditLimitPaise:1,creditHold:1,paymentTermDays:1},query);
}
async function orderProducts(customerId,query={}){
  const id=requiredUuid(customerId,"Customer");
  const result=await customerProducts.list(id,{search:String(query.search||"").slice(0,120)});
  return {items:(result.items||[]).slice(0,100).map(p=>({
    productId:p.productId,name:p.name,sku:p.sku,manufacturer:p.manufacturer,
    referenceSellingPricePaise:p.referenceSellingPricePaise
  })),total:result.total};
}
function financeCustomers(query={}){
  return selectPage(Customer,searchFilter(query,["businessName"]),{customerId:1,businessName:1},query);
}
function financeSuppliers(query={}){
  return selectPage(Supplier,searchFilter(query,["businessName"]),{supplierId:1,businessName:1},query);
}
function financeOrders(query={}){
  const filter={status:{$nin:["draft","created","cancelled"]},
    approvalStatus:{$nin:["pending","rejected"]},orderType:{$ne:"replacement"},
    ...searchFilter(query,["orderNumber","customerSnapshot.businessName"])};
  return selectPage(SalesOrder,filter,
    {salesOrderId:1,orderNumber:1,totalPaise:1,status:1,approvalStatus:1,"customerSnapshot.businessName":1},
    query,{createdAt:-1});
}
module.exports={orderCustomers,orderProducts,financeCustomers,financeSuppliers,financeOrders};
