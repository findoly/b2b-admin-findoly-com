const SalesOrder=require("../models/SalesOrder");
const ProcurementAllocation=require("../models/ProcurementAllocation");
const Payment=require("../models/Payment");
const Invoice=require("../models/Invoice");
const SupplierBill=require("../models/SupplierBill");
const Return=require("../models/Return");
const Employee=require("../models/Employee");
function istDate(day,end=false){
 const raw=String(day);
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(raw))throw Object.assign(new Error("Report date range is invalid"),{status:400});
 const date=new Date(raw+(end?"T23:59:59.999+05:30":"T00:00:00.000+05:30"));
 if(Number.isNaN(date.getTime())||new Date(date.getTime()+330*60000).toISOString().slice(0,10)!==raw)throw Object.assign(new Error("Report date range is invalid"),{status:400});
 return date;
}
function range(query={}){
 const today=new Date(Date.now()+330*60000).toISOString().slice(0,10);
 const from=istDate(query.from||new Date(Date.now()+330*60000-29*86400000).toISOString().slice(0,10));
 const to=query.to?istDate(query.to,true):istDate(today,true);
 if(from>to)throw Object.assign(new Error("Report date range is invalid"),{status:400});
 if(to-from>366*86400000)throw Object.assign(new Error("Report date range cannot exceed 366 days"),{status:400});
 return{from,to};
}
function chunk(values,size=500){const out=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));return out;}
async function allocationRows(orderIds){const rows=[];for(const ids of chunk(orderIds)){const part=await ProcurementAllocation.aggregate([{$match:{salesOrderId:{$in:ids},status:{$ne:"cancelled"}}},{$group:{_id:{salesOrderId:"$salesOrderId",supplierId:"$supplierId"},quantity:{$sum:"$quantity"},procurementCostPaise:{$sum:{$multiply:["$purchasePricePaise","$quantity"]}},supplierName:{$first:"$supplierSnapshot.businessName"}}}]);rows.push(...part);}return rows;}
async function sumField(Model,match,field){const rows=await Model.aggregate([{$match:match},{$group:{_id:null,total:{$sum:`$${field}`}}}]);return Number(rows[0]?.total||0);}
async function countAndSum(Model,match,field){const rows=await Model.aggregate([{$match:match},{$group:{_id:null,count:{$sum:1},total:{$sum:`$${field}`}}}]);return{count:Number(rows[0]?.count||0),total:Number(rows[0]?.total||0)};}
async function businessSummary(query={}){
  const {from,to}=range(query),date={$gte:from,$lte:to},orderMatch={createdAt:date,status:{$ne:"cancelled"},orderType:{$ne:"replacement"}};
  const [invoiceAgg,receivablePayments,supplierPayments,billAgg,returnCount,currentReceivableOutstandingPaise,currentPayableOutstandingPaise]=await Promise.all([
    countAndSum(Invoice,{createdAt:date,status:"issued"},"totalPaise"),
    sumField(Payment,{paidAt:date,direction:"receivable"},"amountPaise"),
    sumField(Payment,{paidAt:date,direction:"payable"},"amountPaise"),
    countAndSum(SupplierBill,{createdAt:date,paymentStatus:{$ne:"void"}},"totalPaise"),
    Return.countDocuments({createdAt:date}),
    sumField(Invoice,{status:"issued",outstandingPaise:{$gt:0}},"outstandingPaise"),
    sumField(SupplierBill,{paymentStatus:{$in:["unpaid","partially_paid","settled"]},outstandingPaise:{$gt:0}},"outstandingPaise")
  ]);
  let salesOrderCount=0,netSalesPaise=0,salesGstPaise=0,stockCostPaise=0,procurementCostPaise=0;
  const agents=new Map(),suppliers=new Map(),statuses={};
  // Stream the projected orders and reconcile procurement costs in batches.
  // Avoid materializing all annual sales orders or their IDs in Node memory.
  async function processBatch(orders){
    if(!orders.length)return;
    const allocations=await allocationRows(orders.map(x=>x.salesOrderId));
    const procurementCostByOrder=new Map();
    for(const row of allocations){
      const orderId=row._id.salesOrderId,supplierId=row._id.supplierId,cost=Number(row.procurementCostPaise||0);
      procurementCostByOrder.set(orderId,(procurementCostByOrder.get(orderId)||0)+cost);
      const supplier=suppliers.get(supplierId)||{supplierId,supplierName:row.supplierName||"",allocationCount:0,quantity:0,procurementCostPaise:0};
      supplier.allocationCount+=1;supplier.quantity+=Number(row.quantity||0);supplier.procurementCostPaise+=cost;
      suppliers.set(supplierId,supplier);
    }
    for(const o of orders){
      salesOrderCount+=1;
      const sale=Number(o.taxablePaise||0),stock=Number(o.stockCostPaise||0),procurement=Number(procurementCostByOrder.get(o.salesOrderId)||0),id=o.assignedEmployeeId||"unassigned";
      netSalesPaise+=sale;salesGstPaise+=Number(o.gstPaise||0);stockCostPaise+=stock;procurementCostPaise+=procurement;
      statuses[o.status]=(statuses[o.status]||0)+1;
      const agent=agents.get(id)||{employeeId:id,employeeName:id==="unassigned"?"Unassigned":id,orderCount:0,netSalesPaise:0,stockCostPaise:0,procurementCostPaise:0,cogsPaise:0,grossMarginPaise:0};
      agent.orderCount+=1;agent.netSalesPaise+=sale;agent.stockCostPaise+=stock;agent.procurementCostPaise+=procurement;
      agent.cogsPaise=agent.stockCostPaise+agent.procurementCostPaise;agent.grossMarginPaise=agent.netSalesPaise-agent.cogsPaise;
      agents.set(id,agent);
    }
  }
  const cursor=SalesOrder.aggregate([
    {$match:orderMatch},
    {$project:{_id:0,salesOrderId:1,assignedEmployeeId:1,status:1,
      taxablePaise:{$ifNull:["$taxablePaise",0]},gstPaise:{$ifNull:["$gstPaise",0]},
      stockCostPaise:{$sum:{$map:{input:{$ifNull:["$lines",[]]},as:"line",in:{$multiply:[{$ifNull:["$$line.stockReservedQty",0]},{$ifNull:["$$line.stockUnitCostPaise",0]}]}}}}
    }}
  ]).cursor({batchSize:500});
  let batch=[];
  for await(const order of cursor){
    batch.push(order);
    if(batch.length>=500){await processBatch(batch);batch=[];}
  }
  await processBatch(batch);
  const employeeIds=[...agents.keys()].filter(id=>id!=="unassigned");
  const employeeRows=employeeIds.length?await Employee.find({employeeId:{$in:employeeIds}}).select({employeeId:1,name:1,employeeCode:1}).lean():[];
  const employeeNames=new Map(employeeRows.map(e=>[e.employeeId,e.name||e.employeeCode||e.employeeId]));
  for(const agent of agents.values())if(agent.employeeId!=="unassigned")agent.employeeName=employeeNames.get(agent.employeeId)||"Unknown employee";
  const cogsPaise=stockCostPaise+procurementCostPaise;
  return{from,to,salesOrderCount,netSalesPaise,salesGstPaise,stockCostPaise,procurementCostPaise,cogsPaise,grossMarginPaise:netSalesPaise-cogsPaise,invoicedPaise:invoiceAgg.total,invoiceCount:invoiceAgg.count,customerCollectionsPaise:receivablePayments,supplierPaymentsPaise:supplierPayments,supplierBillsPaise:billAgg.total,supplierBillCount:billAgg.count,currentReceivableOutstandingPaise,currentPayableOutstandingPaise,returnCount,orderStatusCounts:statuses,agentPerformance:[...agents.values()].sort((a,b)=>b.netSalesPaise-a.netSalesPaise),supplierPerformance:[...suppliers.values()].sort((a,b)=>b.procurementCostPaise-a.procurementCostPaise)};
}
function csvCell(value){let s=String(value??"");if(/^[\s\uFEFF]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function toCsv(report){const rows=[["Metric","Value"],["From",report.from.toISOString()],["To",report.to.toISOString()],["Sales order count",report.salesOrderCount],["Net sales paise",report.netSalesPaise],["Sales GST paise",report.salesGstPaise],["Existing-stock cost paise",report.stockCostPaise],["Procurement cost paise",report.procurementCostPaise],["COGS paise",report.cogsPaise],["Gross margin paise",report.grossMarginPaise],["Customer collections paise",report.customerCollectionsPaise],["Supplier payments paise",report.supplierPaymentsPaise],["Receivable outstanding paise",report.currentReceivableOutstandingPaise],["Payable outstanding paise",report.currentPayableOutstandingPaise],["Return count",report.returnCount],[],["Sales employee","Employee ID","Orders","Net sales paise","Existing-stock cost paise","Procurement cost paise","COGS paise","Gross margin paise"],...report.agentPerformance.map(x=>[x.employeeName,x.employeeId,x.orderCount,x.netSalesPaise,x.stockCostPaise,x.procurementCostPaise,x.cogsPaise,x.grossMarginPaise]),[],["Supplier ID","Supplier","Allocation groups","Quantity","Procurement cost paise"],...report.supplierPerformance.map(x=>[x.supplierId,x.supplierName,x.allocationCount,x.quantity,x.procurementCostPaise])];return rows.map(row=>row.map(csvCell).join(",")).join("\n");}
module.exports={businessSummary,toCsv,range,istDate};
