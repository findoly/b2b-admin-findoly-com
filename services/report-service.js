const SalesOrder=require("../models/SalesOrder");
const ProcurementAllocation=require("../models/ProcurementAllocation");
const Payment=require("../models/Payment");
const Invoice=require("../models/Invoice");
const SupplierBill=require("../models/SupplierBill");
const Return=require("../models/Return");
const Employee=require("../models/Employee");
function range(query={}){const from=query.from?new Date(query.from):new Date(Date.now()-30*86400000);const to=query.to?new Date(query.to):new Date();if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||from>to)throw Object.assign(new Error("Report date range is invalid"),{status:400});return{from,to};}
async function businessSummary(query={}){
  const{from,to}=range(query);const date={$gte:from,$lte:to};
  const[orders,allocations,invoices,payments,bills,returns,currentReceivables,currentPayables]=await Promise.all([
    SalesOrder.find({createdAt:date,status:{$nin:["cancelled"]}}).lean(),
    ProcurementAllocation.find({createdAt:date,status:{$ne:"cancelled"}}).lean(),
    Invoice.find({createdAt:date,status:"issued"}).lean(),
    Payment.find({paidAt:date}).lean(),
    SupplierBill.find({createdAt:date}).lean(),
    Return.find({createdAt:date}).lean(),
    Invoice.find({status:"issued",outstandingPaise:{$gt:0}}).lean(),
    SupplierBill.find({paymentStatus:{$in:["unpaid","partially_paid"]},outstandingPaise:{$gt:0}}).lean(),
  ]);
  const netSalesPaise=orders.reduce((s,x)=>s+Number(x.taxablePaise||0),0);
  const salesGstPaise=orders.reduce((s,x)=>s+Number(x.gstPaise||0),0);
  const procurementCostPaise=allocations.reduce((s,x)=>s+Number(x.purchasePricePaise||0)*Number(x.quantity||0),0);
  const byOrderCost=new Map();for(const x of allocations)byOrderCost.set(x.salesOrderId,(byOrderCost.get(x.salesOrderId)||0)+Number(x.purchasePricePaise||0)*Number(x.quantity||0));
  const employeeIds=[...new Set(orders.map(o=>o.assignedEmployeeId).filter(Boolean))];const employeeRows=employeeIds.length?await Employee.find({employeeId:{$in:employeeIds}}).limit(employeeIds.length).select({employeeId:1,name:1,employeeCode:1}).lean():[];const employeeNames=new Map(employeeRows.map(e=>[e.employeeId,e.name||e.employeeCode||e.employeeId]));
  const agents=new Map();for(const o of orders){const id=o.assignedEmployeeId||"unassigned",v=agents.get(id)||{employeeId:id,employeeName:id==="unassigned"?"Unassigned":employeeNames.get(id)||"Unknown employee",orderCount:0,netSalesPaise:0,procurementCostPaise:0,grossMarginPaise:0};v.orderCount+=1;v.netSalesPaise+=Number(o.taxablePaise||0);v.procurementCostPaise+=byOrderCost.get(o.salesOrderId)||0;v.grossMarginPaise=v.netSalesPaise-v.procurementCostPaise;agents.set(id,v)}
  const suppliers=new Map();for(const a of allocations){const id=a.supplierId,v=suppliers.get(id)||{supplierId:id,supplierName:a.supplierSnapshot?.businessName||"",allocationCount:0,quantity:0,procurementCostPaise:0};v.allocationCount+=1;v.quantity+=Number(a.quantity||0);v.procurementCostPaise+=Number(a.purchasePricePaise||0)*Number(a.quantity||0);suppliers.set(id,v)}
  const statuses={};for(const o of orders)statuses[o.status]=(statuses[o.status]||0)+1;
  return{from,to,salesOrderCount:orders.length,netSalesPaise,salesGstPaise,procurementCostPaise,grossMarginPaise:netSalesPaise-procurementCostPaise,invoicedPaise:invoices.reduce((s,x)=>s+Number(x.totalPaise||0),0),customerCollectionsPaise:payments.filter(x=>x.direction==="receivable").reduce((s,x)=>s+Number(x.amountPaise||0),0),supplierPaymentsPaise:payments.filter(x=>x.direction==="payable").reduce((s,x)=>s+Number(x.amountPaise||0),0),supplierBillsPaise:bills.reduce((s,x)=>s+Number(x.totalPaise||0),0),currentReceivableOutstandingPaise:currentReceivables.reduce((s,x)=>s+Number(x.outstandingPaise||0),0),currentPayableOutstandingPaise:currentPayables.reduce((s,x)=>s+Number(x.outstandingPaise||0),0),returnCount:returns.length,orderStatusCounts:statuses,agentPerformance:[...agents.values()].sort((a,b)=>b.netSalesPaise-a.netSalesPaise),supplierPerformance:[...suppliers.values()].sort((a,b)=>b.procurementCostPaise-a.procurementCostPaise)};
}
function csvCell(value){const s=String(value??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function toCsv(report){const rows=[["Metric","Value"],["From",report.from.toISOString()],["To",report.to.toISOString()],["Sales order count",report.salesOrderCount],["Net sales paise",report.netSalesPaise],["Sales GST paise",report.salesGstPaise],["Procurement cost paise",report.procurementCostPaise],["Gross margin paise",report.grossMarginPaise],["Customer collections paise",report.customerCollectionsPaise],["Supplier payments paise",report.supplierPaymentsPaise],["Receivable outstanding paise",report.currentReceivableOutstandingPaise],["Payable outstanding paise",report.currentPayableOutstandingPaise],["Return count",report.returnCount],[],["Sales employee","Employee ID","Orders","Net sales paise","Procurement cost paise","Gross margin paise"],...report.agentPerformance.map(x=>[x.employeeName,x.employeeId,x.orderCount,x.netSalesPaise,x.procurementCostPaise,x.grossMarginPaise]),[],["Supplier ID","Supplier","Allocations","Quantity","Procurement cost paise"],...report.supplierPerformance.map(x=>[x.supplierId,x.supplierName,x.allocationCount,x.quantity,x.procurementCostPaise])];return rows.map(row=>row.map(csvCell).join(",")).join("\n");}
module.exports={businessSummary,toCsv};
