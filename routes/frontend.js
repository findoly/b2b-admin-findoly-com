const r=require("express").Router();
const p=require("../controllers/frontendController");
const {pageAuth,guestOnly,requirePermission}=require("../middleware/auth");
r.get("/login",guestOnly,p.login);
r.get("/",(req,res)=>res.redirect(req.admin?"/dashboard":"/login"));
r.get("/dashboard",pageAuth,requirePermission("dashboard.view"),p.dashboard);
r.get("/customers",pageAuth,requirePermission("customers.view"),p.customers);
r.get("/products",pageAuth,requirePermission("products.view"),p.products);
r.get("/products/new",pageAuth,requirePermission("products.create"),p.productNew);
r.get("/products/:productId/edit",pageAuth,requirePermission("products.edit"),p.productEdit);
r.get("/products/:productId",pageAuth,requirePermission("products.view"),p.productDetail);
r.get("/suppliers",pageAuth,requirePermission("suppliers.view"),p.suppliers);
r.get("/pricing",pageAuth,requirePermission("pricing.view"),p.pricing);

r.get("/procurement",pageAuth,requirePermission("procurement.view"),p.procurement);
r.get("/procurement/demand",pageAuth,requirePermission("procurement.view"),p.procurementDemand);
r.get("/procurement/new",pageAuth,requirePermission("procurement.create"),p.procurementNew);
r.get("/procurement/:purchaseOrderId/receive",pageAuth,requirePermission("procurement.receive"),p.procurementReceive);
r.get("/procurement/:purchaseOrderId",pageAuth,requirePermission("procurement.view"),p.procurementDetail);

r.get("/inventory",pageAuth,requirePermission("inventory.view"),p.inventory);
r.get("/inventory/movements",pageAuth,requirePermission("inventory.view"),p.inventoryMovements);
r.get("/inventory/adjust",pageAuth,requirePermission("inventory.adjust"),p.inventoryAdjust);
r.get("/warehouses",pageAuth,requirePermission("inventory.view"),p.warehouses);
r.get("/warehouses/new",pageAuth,requirePermission("warehouse.manage"),p.warehouseNew);
r.get("/warehouses/:warehouseId/edit",pageAuth,requirePermission("warehouse.manage"),p.warehouseEdit);

r.get("/orders",pageAuth,requirePermission("orders.view"),p.orders);
r.get("/orders/new",pageAuth,requirePermission("orders.create"),p.orderNew);
r.get("/orders/:salesOrderId/procurement",pageAuth,requirePermission("procurement.create"),p.orderProcurement);
r.get("/orders/:salesOrderId/fulfilment",pageAuth,requirePermission("orders.fulfil"),p.orderFulfilment);
r.get("/orders/:salesOrderId",pageAuth,requirePermission("orders.view"),p.orderDetail);

r.get("/delivery",pageAuth,requirePermission("delivery.view"),p.delivery);
r.get("/delivery/assign",pageAuth,requirePermission("delivery.assign"),p.deliveryAssign);
r.get("/delivery/:deliveryAssignmentId/update",pageAuth,requirePermission("delivery.update"),p.deliveryUpdate);
r.get("/delivery/:deliveryAssignmentId",pageAuth,requirePermission("delivery.view"),p.deliveryDetail);
r.get("/finance",pageAuth,requirePermission("finance.view"),p.finance);
r.get("/returns",pageAuth,requirePermission("returns.view"),p.returns);
r.get("/reports",pageAuth,requirePermission("reports.view"),p.reports);
r.get("/employees",pageAuth,requirePermission("employees.view"),p.employees);
r.get("/roles",pageAuth,requirePermission("roles.view"),p.roles);
r.get("/storage",pageAuth,requirePermission("storage.view"),p.storage);
r.get("/audit",pageAuth,requirePermission("audit.view"),p.audit);
r.get("/invoices/:invoiceId",pageAuth,requirePermission("finance.view"),p.invoice);
module.exports=r;
