const Mapping=require("../models/CustomerProductMapping");
const Customer=require("../models/Customer");
const Product=require("../models/Product");
const CustomerPrice=require("../models/CustomerProductPrice");
const {effectiveAgreementQuery}=require("./pricing-service");
const {requiredUuid,booleanValue}=require("../utils/validation");
const {escapedRegex}=require("../utils/pagination");

async function assertCustomer(customerId){
  const customer=await Customer.findOne({customerId}).select({customerId:1,status:1}).lean();
  if(!customer)throw Object.assign(new Error("Customer not found"),{status:404});
  return customer;
}

async function list(customerId,input={}){
  customerId=requiredUuid(customerId,"Customer");
  await assertCustomer(customerId);
  const mappingFilter={customerId};
  if(String(input.includeInactive||"")!=="true")mappingFilter.active=true;
  const mappings=await Mapping.find(mappingFilter).sort({createdAt:-1}).limit(5000).lean();
  const mappedIds=[...new Set(mappings.map(x=>x.productId))];
  if(!mappedIds.length)return{items:[],total:0};
  const productFilter={productId:{$in:mappedIds}};
  if(String(input.includeInactiveProducts||"")!=="true")productFilter.status="active";
  if(input.search){
    const rx=new RegExp(escapedRegex(input.search),"i");
    productFilter.$or=[{name:rx},{sku:rx},{brand:rx},{barcode:rx}];
  }
  const products=await Product.find(productFilter).sort({name:1}).limit(1000).lean();
  const productIds=products.map(x=>x.productId),now=new Date();
  const prices=productIds.length?await CustomerPrice.find(effectiveAgreementQuery(customerId,{$in:productIds},now)).sort({validFrom:-1,createdAt:-1,customerProductPriceId:1}).lean():[];
  const priceByProduct=new Map();
  for(const price of prices)if(!priceByProduct.has(price.productId))priceByProduct.set(price.productId,price);
  const mappingByProduct=new Map(mappings.map(x=>[x.productId,x]));
  return{items:products.map(product=>({
    ...product,
    customerProductMapping:mappingByProduct.get(product.productId),
    negotiatedPrice:priceByProduct.get(product.productId)||null
  })),total:products.length};
}

async function upsert(customerId,input,actor){
  customerId=requiredUuid(customerId,"Customer");
  const productId=requiredUuid(input.productId,"Product");
  const[customer,product]=await Promise.all([
    Customer.findOne({customerId}).select({customerId:1,status:1}).lean(),
    Product.findOne({productId}).select({productId:1,status:1}).lean()
  ]);
  if(!customer||!product)throw Object.assign(new Error("Customer or product was not found"),{status:404});
  const item=await Mapping.findOneAndUpdate(
    {customerId,productId},
    {$set:{active:booleanValue(input.active,true),notes:String(input.notes||"").trim().slice(0,2000),updatedBy:actor},$setOnInsert:{createdBy:actor}},
    {upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true}
  );
  return item.toObject();
}

async function update(customerId,mappingId,input,actor){
  customerId=requiredUuid(customerId,"Customer");
  mappingId=requiredUuid(mappingId,"Customer product mapping");
  const patch={updatedBy:actor};
  if(Object.prototype.hasOwnProperty.call(input,"active"))patch.active=booleanValue(input.active);
  if(Object.prototype.hasOwnProperty.call(input,"notes"))patch.notes=String(input.notes||"").trim().slice(0,2000);
  const item=await Mapping.findOneAndUpdate({customerId,customerProductMappingId:mappingId},{$set:patch},{new:true,runValidators:true});
  if(!item)throw Object.assign(new Error("Customer product mapping not found"),{status:404});
  return item.toObject();
}

async function assertMapped(customerId,productIds){
  customerId=requiredUuid(customerId,"Customer");
  const ids=[...new Set((productIds||[]).map(x=>requiredUuid(x,"Product")))];
  if(!ids.length)return true;
  const count=await Mapping.countDocuments({customerId,productId:{$in:ids},active:true});
  if(count!==ids.length)throw Object.assign(new Error("One or more products are not mapped to this customer"),{status:400,code:"CUSTOMER_PRODUCT_NOT_MAPPED"});
  return true;
}

module.exports={list,upsert,update,assertMapped};
