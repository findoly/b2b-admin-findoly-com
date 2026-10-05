# FEATURE_SCOPE.md

## B2B Admin scope
The application is a separate physical-product distribution CRM/operations system. Existing Findoly service CRM/provider applications are not modified.

Included:
- Employee OTP authentication, employees, roles and fine-grained permissions.
- Dashboard and operational attention metrics.
- Retailer/wholesaler/distributor customer management, multiple delivery addresses, assigned sales employee, credit terms/limit and customer portal access.
- Product/SKU catalogue with brand/category/manufacturer, HSN/GST, MRP, reference selling price, minimum permitted selling price, reorder level, multiple photos and documents in S3.
- Managed product categories and parent-bound subcategories; product assignments use named IDs.
- Sales insights by category, subcategory and SKU with distinct order/invoice counts.
- Google Maps for manually entered customer, supplier-location and warehouse addresses, reviewed geocoding and manual coordinate entry.
- Supplier management, supplier documents and multiple supplier locations.
- Many-to-many Supplier + Supplier Location + Product offers with buy price, GST charged, GST rate, MOQ, pack quantity, lead time, validity and purchase-price history.
- Customer-specific negotiated SKU prices with effective dates and approval workflow.
- Purchase orders, approval, GRN, supplier invoice/GST data and supplier bills/payables.
- Multi-warehouse-ready inventory balances and immutable movement ledger.
- Sales orders created only by Findoly employees, with product/price/tax snapshots and credit/price approval controls.
- Stock reservation, procurement-required status, supplier procurement allocations, picking, packing and ready-for-dispatch workflow.
- Delivery assignment to internal Findoly delivery or third-party logistics with external references and status history. No delivery-agent website in this release.
- HTML/print invoices only. No PDF generation in this release.
- Customer receivables, supplier payables, advances, partial/full payments, allocations, custom credit periods, ledgers and reconciliation.
- Customer/supplier returns and stock outcomes.
- Sales/procurement/gross-margin/cash reporting.
- S3 file upload/download foundation and audit trail.

Explicitly out of scope:
- Communication Center, WhatsApp/email campaign UI or automation center.
- Findoly service enquiries, lead marketplace, provider matching, lead unlocks, provider credits or service subscriptions.
- Customer-created orders, public catalogue, cart or checkout.
- Delivery-agent/driver website.
- PDF invoice generation. A later API Gateway/Lambda service may generate PDFs and save them to S3.
