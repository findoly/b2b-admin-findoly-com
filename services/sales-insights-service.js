"use strict";
const SalesOrder=require("../models/SalesOrder");
const Invoice=require("../models/Invoice");
const {optionalUuid}=require("../utils/validation");
function dateRange(query={}){
 const today=new Date(Date.now()+330*60000).toISOString().slice(0,10);
 const from=String(query.from||new Date(Date.now()+330*60000-29*86400000).toISOString().slice(0,10));
 const to=String(query.to||today);
 for(const day of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw Object.assign(new Error("Enter valid report dates"),{status:400});
 const start=new Date(from+"T00:00:00+05:30"),end=new Date(to+"T23:59:59.999+05:30");
 if(start>end||end-start>366*86400000)throw Object.assign(new Error("Choose a date range of up to 366 days"),{status:400});
 return{from,to,start,end};
}
function nonEmpty(field,fallback){return{$cond:[{$and:[{$ne:[{$ifNull:[field,""]},""]},{$ne:[field,null]}]},field,fallback]};}
function pipeline(query={}){
 const dates=dateRange(query),mode=query.mode||"orders",dimension=query.dimension||"category",metric=query.metric||"valuePaise";
 if(!["orders","invoices"].includes(mode)||!["category","subcategory","product"].includes(dimension)||!["valuePaise","units","orderCount"].includes(metric))throw Object.assign(new Error("Invalid sales insight filter"),{status:400});
 const categoryId=optionalUuid(query.categoryId,"Category"),subcategoryId=optionalUuid(query.subcategoryId,"Subcategory");
 const documentId=mode==="orders"?"$salesOrderId":"$invoiceId";
 const match={createdAt:{$gte:dates.start,$lte:dates.end},...(mode==="orders"?{status:{$nin:["cancelled","draft"]},orderType:{$ne:"replacement"}}:{status:"issued"})};
 const groupField=dimension==="product"?"$lines.productId":dimension==="category"?"$lines.categoryId":"$lines.subcategoryId";
 const labelField=dimension==="product"?"$lines.productName":dimension==="category"?"$lines.category":"$lines.subcategory";
 const page=Math.max(1,Math.min(100000,Math.trunc(Number(query.page)||1))),limit=20;
 const stages=[{$match:match},{$unwind:"$lines"}];
 const filter={};if(categoryId)filter["lines.categoryId"]=categoryId;if(subcategoryId)filter["lines.subcategoryId"]=subcategoryId;if(Object.keys(filter).length)stages.push({$match:filter});
 stages.push({$project:{documentId,groupKey:nonEmpty(groupField,nonEmpty(labelField,"unclassified")),label:nonEmpty(labelField,"Unclassified / historical"),categoryId:{$ifNull:["$lines.categoryId",""]},subcategoryId:{$ifNull:["$lines.subcategoryId",""]},category:{$ifNull:["$lines.category",""]},sku:{$ifNull:["$lines.sku",""]},units:"$lines.quantity",valuePaise:mode==="invoices"?"$lines.taxablePaise":{$multiply:["$lines.quantity","$lines.unitPricePaise"]}}});
 const group=[{$group:{_id:{group:"$groupKey",document:"$documentId"},label:{$first:"$label"},categoryId:{$first:"$categoryId"},subcategoryId:{$first:"$subcategoryId"},category:{$first:"$category"},sku:{$first:"$sku"},units:{$sum:"$units"},valuePaise:{$sum:"$valuePaise"}}},{$group:{_id:"$_id.group",label:{$first:"$label"},categoryId:{$first:"$categoryId"},subcategoryId:{$first:"$subcategoryId"},category:{$first:"$category"},sku:{$first:"$sku"},units:{$sum:"$units"},valuePaise:{$sum:"$valuePaise"},orderCount:{$sum:1}}}];
 stages.push({$facet:{items:[...group,{$sort:{[metric]:-1,_id:1}},{$skip:(page-1)*limit},{$limit:limit}],groups:[...group,{$count:"total"}],totals:[{$group:{_id:"$documentId",units:{$sum:"$units"},valuePaise:{$sum:"$valuePaise"}}},{$group:{_id:null,orderCount:{$sum:1},units:{$sum:"$units"},valuePaise:{$sum:"$valuePaise"}}}]}});
 return{stages,mode,dimension,metric,page,limit,from:dates.from,to:dates.to};
}
async function summary(query={}){
 const config=pipeline(query),Model=config.mode==="orders"?SalesOrder:Invoice;
 const [result]=await Model.aggregate(config.stages).allowDiskUse(true).option({maxTimeMS:20000});
 const total=result?.groups?.[0]?.total||0;
 return{...config,stages:undefined,items:(result?.items||[]).map(({_id,...row})=>({key:_id,...row})),totals:result?.totals?.[0]||{orderCount:0,units:0,valuePaise:0},total,pages:Math.max(1,Math.ceil(total/config.limit))};
}
module.exports={summary,pipeline,dateRange};
