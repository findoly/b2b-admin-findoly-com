"use strict";
const mongoose=require("mongoose");
const InventoryBalance=require("../models/InventoryBalance");
const GoodsReceipt=require("../models/GoodsReceipt");
const PurchaseOrder=require("../models/PurchaseOrder");

function physicalQty(balance){
  return ["availableQty","reservedQty","pickedQty","packedQty","damagedQty","returnedQty"].reduce((sum,key)=>sum+Number(balance[key]||0),0);
}

(async()=>{
  let scanned=0,updated=0,unresolved=0;
  const cursor=InventoryBalance.find({averageCostPaise:{$lte:0}}).select({warehouseId:1,productId:1,availableQty:1,reservedQty:1,pickedQty:1,packedQty:1,damagedQty:1,returnedQty:1,averageCostPaise:1}).lean().cursor();
  for await(const balance of cursor){
    scanned+=1;
    if(physicalQty(balance)<=0)continue;
    const receipts=await GoodsReceipt.find({warehouseId:balance.warehouseId,"lines.productId":balance.productId}).sort({createdAt:1}).select({purchaseOrderId:1,lines:1}).lean();
    if(!receipts.length){unresolved+=1;console.warn(`UNRESOLVED ${balance.warehouseId} ${balance.productId}: no GRN history`);continue;}
    const poIds=[...new Set(receipts.map(x=>x.purchaseOrderId).filter(Boolean))];
    const pos=await PurchaseOrder.find({purchaseOrderId:{$in:poIds}}).select({purchaseOrderId:1,lines:1}).lean();
    const poMap=new Map(pos.map(po=>[po.purchaseOrderId,po]));
    let quantity=0,costTotal=0;
    for(const receipt of receipts){
      const po=poMap.get(receipt.purchaseOrderId);
      if(!po)continue;
      for(const receiptLine of receipt.lines||[]){
        if(receiptLine.productId!==balance.productId)continue;
        const receivedPhysical=Number(receiptLine.acceptedQty||0)+Number(receiptLine.damagedQty||0);
        if(receivedPhysical<=0)continue;
        const poLine=(po.lines||[]).find(line=>line.purchaseOrderLineId===receiptLine.purchaseOrderLineId)||(po.lines||[]).find(line=>line.productId===balance.productId);
        if(!poLine)continue;
        quantity+=receivedPhysical;
        costTotal+=receivedPhysical*Number(poLine.unitPurchasePricePaise||0);
      }
    }
    if(quantity<=0){unresolved+=1;console.warn(`UNRESOLVED ${balance.warehouseId} ${balance.productId}: GRN history has no costable receipt quantity`);continue;}
    const averageCostPaise=Math.round(costTotal/quantity);
    await InventoryBalance.updateOne({inventoryBalanceId:balance.inventoryBalanceId},{$set:{averageCostPaise,updatedBy:"cost-backfill"}});
    updated+=1;
  }
  console.log(JSON.stringify({scanned,updated,unresolved}));
  await mongoose.disconnect();
  if(unresolved>0)process.exitCode=2;
})().catch(async error=>{console.error(error);try{await mongoose.disconnect();}catch(_){}process.exit(1);});
