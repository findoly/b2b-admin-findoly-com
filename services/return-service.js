const mongoose=require("mongoose");const Return=require("../models/Return");const SalesOrder=require("../models/SalesOrder");const PurchaseOrder=require("../models/PurchaseOrder");const GoodsReceipt=require("../models/GoodsReceipt");const Warehouse=require("../models/Warehouse");const Delivery=require("../models/DeliveryAssignment");const InventoryBalance=require("../models/InventoryBalance");const InventoryMovement=require("../models/InventoryMovement");const {pageQuery}=require("../utils/pagination");const {positiveInteger}=require("../utils/validation");
async function list(query={}){const{page,limit,skip}=pageQuery(query);const filter={};if(query.status)filter.status=query.status;if(query.returnType)filter.returnType=query.returnType;const[items,total]=await Promise.all([Return.find(filter).sort({createdAt:-1}).skip(skip).limit(limit).lean(),Return.countDocuments(filter)]);return{items,page,limit,total,pages:Math.ceil(total/limit)||1};}
async function create(input,actor){
  const returnType=String(input.returnType||"");
  if(!["customer","supplier"].includes(returnType))throw Object.assign(new Error("Return type is invalid"),{status:400});
  if(!Array.isArray(input.lines)||!input.lines.length)throw Object.assign(new Error("Return lines are required"),{status:400});
  const warehouseId=String(input.warehouseId||"");const warehouse=await Warehouse.findOne({warehouseId,active:true}).select({warehouseId:1}).lean();if(!warehouse)throw Object.assign(new Error("Return warehouse was not found or is inactive"),{status:404});
  let customerId="",supplierId="",sourceLines=[],sourceId="",sourceField="";
  if(returnType==="customer"){
    const order=await SalesOrder.findOne({salesOrderId:input.salesOrderId}).lean();
    if(!order)throw Object.assign(new Error("Sales order not found"),{status:404});
    if(!["delivered","partially_delivered"].includes(order.status))throw Object.assign(new Error("Customer returns can only be created for delivered or partially delivered orders"),{status:409});
    customerId=order.customerId;sourceId=order.salesOrderId;sourceField="salesOrderId";
    let deliveredByLine=null;
    if(order.status==="partially_delivered"){
      const delivery=await Delivery.findOne({salesOrderId:order.salesOrderId,status:"partially_delivered"}).sort({createdAt:-1}).lean();
      if(delivery?.lines?.length)deliveredByLine=new Map(delivery.lines.map(line=>[line.salesOrderLineId,Number(line.deliveredQty||0)]));
    }
    const sourceMap=new Map();for(const line of order.lines||[]){const maxQty=deliveredByLine?Number(deliveredByLine.get(line.salesOrderLineId)||0):Number(line.quantity||0),current=sourceMap.get(line.productId)||{productId:line.productId,productName:line.productName,maxQty:0};current.maxQty+=maxQty;sourceMap.set(line.productId,current);}sourceLines=[...sourceMap.values()];
  }else{
    const po=await PurchaseOrder.findOne({purchaseOrderId:input.purchaseOrderId}).lean();
    if(!po)throw Object.assign(new Error("Purchase order not found"),{status:404});
    if(!["partially_received","received","closed"].includes(po.status))throw Object.assign(new Error("Supplier returns require received purchase-order stock"),{status:409});
    supplierId=po.supplierId;sourceId=po.purchaseOrderId;sourceField="purchaseOrderId";
    const receipts=await GoodsReceipt.find({purchaseOrderId:po.purchaseOrderId}).select({lines:1}).lean(),sourceMap=new Map();for(const receipt of receipts)for(const line of receipt.lines||[]){const eligible=Number(line.acceptedQty||0)+Number(line.damagedQty||0),current=sourceMap.get(line.productId)||{productId:line.productId,productName:(po.lines||[]).find(x=>x.productId===line.productId)?.productName||"Product",maxQty:0};current.maxQty+=eligible;sourceMap.set(line.productId,current);}sourceLines=[...sourceMap.values()];
  }
  const prior=await Return.find({returnType,[sourceField]:sourceId,status:{$ne:"rejected"}}).sort({createdAt:-1}).limit(100).lean();
  const alreadyReturned=new Map();for(const item of prior)for(const line of item.lines||[]){if(line.outcome==="rejected")continue;alreadyReturned.set(line.productId,(alreadyReturned.get(line.productId)||0)+Number(line.quantity||0));}
  const sourceByProduct=new Map(sourceLines.map(line=>[line.productId,line]));
  const normalized=input.lines.map(raw=>{
    const source=sourceByProduct.get(String(raw.productId||""));if(!source||source.maxQty<=0)throw Object.assign(new Error("Return product is not eligible on the source document"),{status:400});
    const quantity=positiveInteger(raw.quantity,"Return quantity"),used=Number(alreadyReturned.get(source.productId)||0);
    if(used+quantity>source.maxQty)throw Object.assign(new Error(`Return quantity exceeds eligible quantity for ${source.productName}`),{status:409});
    alreadyReturned.set(source.productId,used+quantity);
    const sourceBucket=["available","damaged","returned"].includes(String(raw.sourceBucket||""))?String(raw.sourceBucket):"available";
    return{productId:source.productId,productName:source.productName,quantity,reason:String(raw.reason||"Return"),sourceBucket,outcome:"pending"};
  });
  const item=await Return.create({returnType,salesOrderId:returnType==="customer"?sourceId:"",purchaseOrderId:returnType==="supplier"?sourceId:"",customerId,supplierId,warehouseId,status:"requested",lines:normalized,documentKeys:Array.isArray(input.documentKeys)?input.documentKeys:[],notes:String(input.notes||""),createdBy:actor,updatedBy:actor});return item.toObject();
}
async function process(id,input,actor){const session=await mongoose.startSession();try{return await session.withTransaction(async()=>{const item=await Return.findOne({returnId:id}).session(session);if(!item)throw Object.assign(new Error("Return not found"),{status:404});if(!["approved","received","requested"].includes(item.status))throw Object.assign(new Error("Return cannot be processed"),{status:409});for(const line of item.lines){const outcome=String((input.outcomes||{})[line.returnLineId]||line.outcome||"pending"),allowed=item.returnType==="customer"?["sellable","damaged","replacement","credit_note","rejected"]:["supplier_return","rejected"];if(!allowed.includes(outcome))throw Object.assign(new Error(`Return outcome ${outcome} is invalid for ${item.returnType} return`),{status:400});line.outcome=outcome;if(item.returnType==="customer"&&["sellable","damaged"].includes(outcome)){const field=outcome==="sellable"?"availableQty":"damagedQty";await InventoryBalance.findOneAndUpdate({warehouseId:item.warehouseId,productId:line.productId},{$inc:{[field]:line.quantity},$set:{updatedBy:actor}},{upsert:true,new:true,session,setDefaultsOnInsert:true});await InventoryMovement.create([{warehouseId:item.warehouseId,productId:line.productId,movementType:"customer_return",quantityDelta:line.quantity,bucket:outcome==="sellable"?"available":"damaged",referenceType:"return",referenceId:item.returnId,reason:`Customer return: ${outcome}`,actorEmployeeId:actor}],{session});}
if(item.returnType==="supplier"&&outcome==="supplier_return"){const sourceBucket=String(line.sourceBucket||"available"),field={available:"availableQty",damaged:"damagedQty",returned:"returnedQty"}[sourceBucket];if(!field)throw Object.assign(new Error("Supplier return source bucket is invalid"),{status:400});const balance=await InventoryBalance.findOne({warehouseId:item.warehouseId,productId:line.productId}).session(session);if(!balance||Number(balance[field]||0)<line.quantity)throw Object.assign(new Error(`Insufficient ${sourceBucket} stock for supplier return of ${line.productName}`),{status:409});balance[field]-=line.quantity;balance.updatedBy=actor;await balance.save({session});await InventoryMovement.create([{warehouseId:item.warehouseId,productId:line.productId,movementType:"supplier_return",quantityDelta:-line.quantity,bucket:sourceBucket,referenceType:"return",referenceId:item.returnId,reason:"Stock returned to supplier",actorEmployeeId:actor}],{session});}}
item.status="processed";item.updatedBy=actor;await item.save({session});return item.toObject();});}finally{await session.endSession();}}
module.exports={list,create,process};
