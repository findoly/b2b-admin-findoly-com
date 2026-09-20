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
  const [orders,prices,invoices,payments,returns]=await Promise.all([
    SalesOrder.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
    CustomerPrice.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
    Invoice.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
    Payment.find({customerId,direction:"receivable"}).sort({paidAt:-1}).limit(100).lean(),
    Return.find({customerId}).sort({createdAt:-1}).limit(100).lean(),
  ]);
  const orderIds=orders.map(x=>x.salesOrderId);
  const deliveries=orderIds.length?await Delivery.find({salesOrderId:{$in:orderIds}}).sort({createdAt:-1}).limit(100).lean():[];
  const outstandingPaise=invoices.filter(x=>x.status==="issued").reduce((s,x)=>s+Number(x.outstandingPaise||0),0);
  return{customer,orders,prices,invoices,payments,deliveries,returns,outstandingPaise};
}
module.exports={get};
