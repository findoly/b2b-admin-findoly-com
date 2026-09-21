const Customer=require("../models/Customer");
const SalesOrder=require("../models/SalesOrder");
const CustomerPrice=require("../models/CustomerProductPrice");
const Invoice=require("../models/Invoice");
const Payment=require("../models/Payment");
const Delivery=require("../models/DeliveryAssignment");
const Return=require("../models/Return");
async function get(customerId){
  const customer=await Customer.findOne({customerId}).lean();
  if(!customer)throw Object.assign(new Error("Customer not found"),{status:404});
  const openStatuses=["procurement_required","procurement_in_progress","stock_ready","picking","packed","ready_for_dispatch","assigned_for_delivery","out_for_delivery","delivered","partially_delivered","delivery_failed"];const [orders,prices,invoices,payments,returns,outstandingRows,issuedOrderRows,openOrders]=await Promise.all([
    SalesOrder.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
    CustomerPrice.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
    Invoice.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
    Payment.find({customerId,direction:"receivable"}).sort({paidAt:-1}).limit(100).lean(),
    Return.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
    Invoice.aggregate([{$match:{customerId,status:"issued",outstandingPaise:{$gt:0}}},{$group:{_id:null,total:{$sum:"$outstandingPaise"}}}]),
    Invoice.find({customerId,status:"issued"}).select({salesOrderId:1}).lean(),
    SalesOrder.find({customerId,status:{$in:openStatuses}}).select({salesOrderId:1,totalPaise:1}).lean(),
  ]);
  const orderIds=orders.map(x=>x.salesOrderId);
  const deliveries=orderIds.length?await Delivery.find({salesOrderId:{$in:orderIds}}).sort({createdAt:-1}).limit(100).lean():[];
  const outstandingPaise=Number(outstandingRows[0]?.total||0),issuedOrderIds=new Set(issuedOrderRows.map(x=>x.salesOrderId)),openOrderExposurePaise=openOrders.filter(x=>!issuedOrderIds.has(x.salesOrderId)).reduce((sum,x)=>sum+Number(x.totalPaise||0),0),creditExposurePaise=outstandingPaise+openOrderExposurePaise,availableCreditPaise=Number(customer.creditLimitPaise||0)>0?Math.max(0,Number(customer.creditLimitPaise||0)-creditExposurePaise):0;
  return{customer,orders,prices,invoices,payments,deliveries,returns,outstandingPaise,openOrderExposurePaise,creditExposurePaise,availableCreditPaise};
}
module.exports={get};
