const SalesOrder=require("../models/SalesOrder");const Invoice=require("../models/Invoice");const SupplierBill=require("../models/SupplierBill");const InventoryBalance=require("../models/InventoryBalance");const CustomerPrice=require("../models/CustomerProductPrice");const Product=require("../models/Product");
async function sumOutstanding(Model,match){const rows=await Model.aggregate([{$match:match},{$group:{_id:null,total:{$sum:"$outstandingPaise"}}}]);return Number(rows[0]?.total||0);}
async function lowStock(){
 const cursor=Product.find({status:"active",reorderLevel:{$gt:0}})
  .select({productId:1,name:1,sku:1,reorderLevel:1}).sort({productId:1}).lean().cursor({batchSize:200});
 let batch=[],count=0;const items=[];
 const compare=(a,b)=>(a.availableQty-a.reorderLevel)-(b.availableQty-b.reorderLevel)||a.productId.localeCompare(b.productId);
 async function processBatch(){
  if(!batch.length)return;
  const ids=batch.map(x=>x.productId);
  const stockRows=await InventoryBalance.aggregate([{$match:{productId:{$in:ids}}},{$group:{_id:"$productId",availableQty:{$sum:"$availableQty"}}}]).option({maxTimeMS:15000});
  const available=new Map(stockRows.map(row=>[row._id,Number(row.availableQty||0)]));
  for(const product of batch){
   const item={productId:product.productId,name:product.name,sku:product.sku,reorderLevel:Number(product.reorderLevel||0),availableQty:Number(available.get(product.productId)||0)};
   if(item.availableQty>item.reorderLevel)continue;
   count++;items.push(item);items.sort(compare);if(items.length>10)items.pop();
  }
  batch=[];
 }
 for await(const product of cursor){batch.push(product);if(batch.length===200)await processBatch();}
 await processBatch();return{count,items};
}
async function salesTrend(now=new Date()){
 const indianDay=new Date(now.getTime()+330*60000).toISOString().slice(0,10);
 const start=new Date(indianDay+"T00:00:00+05:30");start.setUTCDate(start.getUTCDate()-13);
 const days=Array.from({length:14},(_,i)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);return new Date(d.getTime()+330*60000).toISOString().slice(0,10)});
 const end=new Date(indianDay+"T00:00:00+05:30");end.setUTCDate(end.getUTCDate()+1);
 const rows=await SalesOrder.aggregate([{$match:{createdAt:{$gte:start,$lt:end},status:{$nin:["draft","cancelled"]},orderType:{$ne:"replacement"}}},{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$createdAt",timezone:"Asia/Kolkata"}},salesPaise:{$sum:{$ifNull:["$taxablePaise",0]}},orders:{$sum:1}}},{$sort:{_id:1}}]).option({maxTimeMS:15000});
 const byDay=new Map(rows.map(r=>[r._id,r]));return days.map(day=>({day,label:day.slice(5),salesPaise:Number(byDay.get(day)?.salesPaise||0),orders:Number(byDay.get(day)?.orders||0)}));
}
async function orderStatusMix(){
 const rows=await SalesOrder.aggregate([{$match:{orderType:{$ne:"replacement"}}},{$group:{_id:"$status",count:{$sum:1}}},{$sort:{count:-1}}]).option({maxTimeMS:15000});
 return rows.filter(r=>typeof r._id==="string").map(r=>({status:r._id,count:r.count}));
}
async function get(){const start=new Date();start.setHours(0,0,0,0);const now=new Date();const[todayOrders,pendingProcurement,readyDispatch,overdueReceivablePaise,overduePayablePaise,pendingPrices,lowStockResult,recentOrders,salesTrendRows,statusMix]=await Promise.all([SalesOrder.countDocuments({createdAt:{$gte:start}}),SalesOrder.countDocuments({status:{$in:["procurement_required","procurement_in_progress"]}}),SalesOrder.countDocuments({status:{$in:["packed","ready_for_dispatch"]}}),sumOutstanding(Invoice,{outstandingPaise:{$gt:0},dueAt:{$ne:null,$lt:now},status:"issued"}),sumOutstanding(SupplierBill,{outstandingPaise:{$gt:0},dueAt:{$ne:null,$lt:now},paymentStatus:{$in:["unpaid","partially_paid"]}}),CustomerPrice.countDocuments({approvalStatus:"pending",active:true}),lowStock(),SalesOrder.find({}).sort({createdAt:-1}).limit(8).lean(),salesTrend(now),orderStatusMix()]);return{todayOrders,pendingProcurement,readyDispatch,overdueReceivablePaise,overduePayablePaise,pendingPrices,lowStockCount:lowStockResult.count,lowStockItems:lowStockResult.items,recentOrders,salesTrend:salesTrendRows,orderStatusMix:statusMix};}
module.exports={get,salesTrend,orderStatusMix,lowStock};
