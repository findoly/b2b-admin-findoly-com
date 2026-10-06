# DATA_MODEL_RULES.md

## Canonical application IDs

| Collection | Application ID |
|---|---|
| `b2bemployees` | `employeeId` |
| `b2broles` | `roleId` |
| `b2bauditlogs` | `auditLogId` |
| `b2bcustomers` | `customerId` |
| `b2bcustomerusers` | `customerUserId` |
| `b2bproducts` | `productId` |
| `b2bcategories` | `categoryId` |
| `b2bsubcategories` | `subcategoryId` |
| `b2bmaplocations` | `mapLocationId` |
| `b2bsuppliers` | `supplierId` |
| `b2bsupplierlocations` | `supplierLocationId` |
| `b2bsupplierproductoffers` | `supplierProductOfferId` |
| `b2bpurchasepricehistory` | `purchasePriceHistoryId` |
| `b2bcustomerproductprices` | `customerProductPriceId` |
| `b2bcustomerproductmappings` | `customerProductMappingId` |
| `b2bwarehouses` | `warehouseId` |
| `b2binventorybalances` | `inventoryBalanceId` |
| `b2binventorymovements` | `inventoryMovementId` |
| `b2bpurchaseorders` | `purchaseOrderId` |
| `b2bgoodsreceipts` | `goodsReceiptId` |
| `b2bsalesorders` | `salesOrderId` |
| `b2bprocurementallocations` | `procurementAllocationId` |
| `b2binvoices` | `invoiceId` |
| `b2bsupplierbills` | `supplierBillId` |
| `b2bpayments` | `paymentId` |
| `b2bdeliveryassignments` | `deliveryAssignmentId` |
| `b2breturns` | `returnId` |

Embedded line/event/media records also use named UUID identifiers where identity is required (`salesOrderLineId`, `purchaseOrderLineId`, `productMediaId`, `paymentAllocationId`, etc.).

## Relationship rule
Relationships are plain indexed named IDs. There are no Mongoose refs, ObjectId foreign keys, `populate()` calls or `$lookup` stages. Historical records keep required snapshots so old records remain correct after master-data changes.
