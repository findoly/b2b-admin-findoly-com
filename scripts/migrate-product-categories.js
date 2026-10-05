"use strict";
// Dry run by default. Use the runtime wrapper and --apply after reviewing the output.
// Only product masters are classified. Historical commercial snapshots are never rewritten.
const mongoose=require("mongoose");
const Product=require("../models/Product");
const Category=require("../models/Category");
const Subcategory=require("../models/Subcategory");
const {nameKey}=require("../services/catalog-service");
const {textValue}=require("../utils/validation");
async function run(){
 const apply=process.argv.includes("--apply");let reviewed=0,classified=0,missing=0,conflicts=0;
 if(apply){await Category.createIndexes();await Subcategory.createIndexes();}
 const cursor=Product.find({$or:[{categoryId:""},{categoryId:{$exists:false}}]}).select({productId:1,category:1,subcategory:1,updatedAt:1}).cursor();
 for await(const product of cursor){
  reviewed++;const name=String(product.category||"").trim(),sub=String(product.subcategory||"").trim();
  if(!name){missing++;continue;}textValue(name,{maxLength:120});textValue(sub,{maxLength:120});
  if(!apply){console.log(JSON.stringify({productId:product.productId,category:name,subcategory:sub}));continue;}
  const category=await Category.findOneAndUpdate({nameKey:nameKey(name)},{$setOnInsert:{name,description:"Imported from existing product labels",createdBy:"catalog-migration",updatedBy:"catalog-migration"}},{upsert:true,new:true,setDefaultsOnInsert:true});
  let subcategory=null;if(sub)subcategory=await Subcategory.findOneAndUpdate({categoryId:category.categoryId,nameKey:nameKey(sub)},{$setOnInsert:{name:sub,createdBy:"catalog-migration",updatedBy:"catalog-migration"}},{upsert:true,new:true,setDefaultsOnInsert:true});
  const result=await Product.updateOne({productId:product.productId,updatedAt:product.updatedAt,$or:[{categoryId:""},{categoryId:{$exists:false}}]},{$set:{categoryId:category.categoryId,subcategoryId:subcategory?.subcategoryId||"",updatedBy:"catalog-migration"}});
  if(result.modifiedCount)classified++;else conflicts++;
 }
 console.log({mode:apply?"apply":"dry-run",reviewed,classified,missing,conflicts});
}
run().then(()=>mongoose.disconnect()).catch(async error=>{console.error(error.message);await mongoose.disconnect();process.exitCode=1;});
