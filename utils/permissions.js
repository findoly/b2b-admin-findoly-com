const PERMISSION_GROUPS = Object.freeze([
  ["dashboard", ["dashboard.view"]],
  ["customers", ["customers.view", "customers.create", "customers.edit", "customers.credit"]],
  ["products", ["products.view", "products.create", "products.edit", "products.media"]],
  ["suppliers", ["suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.pricing"]],
  ["pricing", ["pricing.view", "pricing.manage", "pricing.approve"]],
  ["procurement", ["procurement.view", "procurement.create", "procurement.approve", "procurement.receive"]],
  ["inventory", ["inventory.view", "inventory.adjust", "warehouse.manage"]],
  ["orders", ["orders.view", "orders.create", "orders.edit", "orders.approve", "orders.fulfil"]],
  ["delivery", ["delivery.view", "delivery.assign", "delivery.update"]],
  ["finance", ["finance.view", "finance.invoice", "finance.receive", "finance.pay", "finance.reconcile"]],
  ["returns", ["returns.view", "returns.manage"]],
  ["reports", ["reports.view", "reports.export"]],
  ["storage", ["storage.view", "storage.manage"]],
  ["employees", ["employees.view", "employees.create", "employees.edit"]],
  ["roles", ["roles.view", "roles.create", "roles.edit"]],
  ["audit", ["audit.view"]]
].map(([key, permissions]) => ({ key, label: key[0].toUpperCase()+key.slice(1), permissions: permissions.map(key => ({ key, label: key })) })));
const ALL_PERMISSIONS = Object.freeze(PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key)));
const GLOBAL_SCOPES=Object.freeze({customers:"all",orders:"all",warehouses:"all"});
const DEFAULT_ROLES = Object.freeze([
  { name: "Super Admin", slug: "super-admin", description: "Complete B2B access.", permissions: ["*"], isSuperAdmin: true, dataScopes:GLOBAL_SCOPES },
  { name: "Admin", slug: "admin", description: "Full operational B2B access.", permissions: [...ALL_PERMISSIONS], dataScopes:GLOBAL_SCOPES },
  { name: "Sales Manager", slug: "sales-manager", description: "Customer, pricing and order oversight.", permissions: ["dashboard.view","customers.view","customers.create","customers.edit","customers.credit","products.view","pricing.view","pricing.manage","pricing.approve","orders.view","orders.create","orders.edit","orders.approve","delivery.view","finance.view","reports.view"], dataScopes:GLOBAL_SCOPES },
  { name: "Sales Agent", slug: "sales-agent", description: "Customer and order creation with negotiated prices.", permissions: ["dashboard.view","customers.view","customers.create","customers.edit","products.view","pricing.view","pricing.manage","orders.view","orders.create","orders.edit","delivery.view","finance.view"], dataScopes:{customers:"assigned",orders:"assigned",warehouses:"all"} },
  { name: "Procurement", slug: "procurement", description: "Supplier sourcing and purchase operations.", permissions: ["dashboard.view","products.view","suppliers.view","suppliers.create","suppliers.edit","suppliers.pricing","procurement.view","procurement.create","procurement.approve","procurement.receive","inventory.view","finance.view","finance.pay","reports.view"], dataScopes:GLOBAL_SCOPES },
  { name: "Warehouse", slug: "warehouse", description: "Goods receipt, inventory, picking and packing.", permissions: ["dashboard.view","products.view","procurement.view","procurement.receive","inventory.view","inventory.adjust","warehouse.manage","orders.view","orders.fulfil","delivery.view"], dataScopes:{customers:"all",orders:"all",warehouses:"assigned"} },
  { name: "Accounts", slug: "accounts", description: "Invoices, receivables, payables and reconciliation.", permissions: ["dashboard.view","customers.view","suppliers.view","orders.view","procurement.view","finance.view","finance.invoice","finance.receive","finance.pay","finance.reconcile","reports.view"], dataScopes:GLOBAL_SCOPES },
  { name: "Delivery Manager", slug: "delivery-manager", description: "Delivery assignment and status operations.", permissions: ["dashboard.view","orders.view","delivery.view","delivery.assign","delivery.update","finance.view"], dataScopes:GLOBAL_SCOPES }
]);
function isKnownPermission(value) { return value === "*" || ALL_PERMISSIONS.includes(value); }
function hasPermission(user, permission) { const p = Array.isArray(user?.permissions) ? user.permissions : []; return p.includes("*") || p.includes(permission); }
module.exports = { PERMISSION_GROUPS, ALL_PERMISSIONS, GLOBAL_SCOPES, DEFAULT_ROLES, isKnownPermission, hasPermission };
