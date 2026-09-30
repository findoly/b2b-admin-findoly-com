function normalizeScope(value, fallback="all"){
  return ["all","assigned"].includes(String(value||""))?String(value):fallback;
}
function scopesFor(access={}){
  const raw=access.dataScopes||{};
  return {
    customers:normalizeScope(raw.customers,"all"),
    orders:normalizeScope(raw.orders,"all"),
    warehouses:normalizeScope(raw.warehouses,"all")
  };
}
function warehouseIdsFor(access={}){
  return [...new Set((Array.isArray(access.warehouseIds)?access.warehouseIds:[]).map(String).filter(Boolean))];
}
function applyScope(filter={},access,domain,{assignedField="assignedEmployeeId",warehouseField="warehouseId"}={}){
  if(!access||access.permissions?.includes("*"))return filter;
  const scopes=scopesFor(access);
  if((domain==="customers"||domain==="orders")&&scopes[domain]==="assigned")filter[assignedField]=access.employeeId;
  if(domain==="warehouses"&&scopes.warehouses==="assigned"){
    const ids=warehouseIdsFor(access);
    filter[warehouseField]=ids.length?{$in:ids}:{$in:[]};
  }
  return filter;
}
function assertAssignedEmployee(access,employeeId,label="record"){
  if(!access||access.permissions?.includes("*"))return;
  const scopes=scopesFor(access);
  if((scopes.customers==="assigned"||scopes.orders==="assigned")&&employeeId&&employeeId!==access.employeeId){
    throw Object.assign(new Error(`You can only assign ${label} to yourself`),{status:403,code:"DATA_SCOPE_VIOLATION"});
  }
}
function assertWarehouse(access,warehouseId){
  if(!access||access.permissions?.includes("*"))return;
  if(scopesFor(access).warehouses!=="assigned")return;
  if(!warehouseIdsFor(access).includes(String(warehouseId||"")))throw Object.assign(new Error("You do not have access to this warehouse"),{status:403,code:"WAREHOUSE_SCOPE_VIOLATION"});
}
module.exports={normalizeScope,scopesFor,warehouseIdsFor,applyScope,assertAssignedEmployee,assertWarehouse};
