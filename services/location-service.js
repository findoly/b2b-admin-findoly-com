"use strict";
const crypto=require("crypto");
const Customer=require("../models/Customer");const Warehouse=require("../models/Warehouse");const SupplierLocation=require("../models/SupplierLocation");const Supplier=require("../models/Supplier");const MapLocation=require("../models/MapLocation");
const {hasPermission}=require("../utils/permissions");const{requiredUuid}=require("../utils/validation");const{escapedRegex}=require("../utils/pagination");
const RULES={customer:{view:"customers.view",edit:"customers.edit"},warehouse:{view:"inventory.view",edit:"warehouse.manage"},supplier:{view:"suppliers.view",edit:"suppliers.edit"}};
const GOOGLE_CACHE_MS=29*86400000;
function access(actor,type,write=false){const rule=Object.hasOwn(RULES,type)?RULES[type]:null;if(!rule)throw Object.assign(new Error("Invalid location type"),{status:400});if(!hasPermission(actor,rule.view)||(write&&!hasPermission(actor,rule.edit)))throw Object.assign(new Error("You do not have permission for these locations"),{status:403});}
function addressText(address={}){return [address.line1,address.line2,address.city,address.state,address.pincode,"India"].map(x=>String(x||"").trim()).filter(Boolean).join(", ");}
function addressHash(address){return crypto.createHash("sha256").update(addressText(address).normalize("NFKC").toLowerCase()).digest("hex");}
function identity(type,id,slot){return`${type}:${id}:${slot}`;}
function item(type,id,slot,name,address,url){return{key:identity(type,id,slot),entityType:type,entityId:id,addressSlot:slot,name,address:addressText(address),city:address?.city||"",addressHash:addressHash(address),url};}
function coordinates(input){
 for(const key of ["latitude","longitude"])if(input[key]===null||input[key]===undefined||typeof input[key]==="boolean"||String(input[key]).trim()==="")throw Object.assign(new Error("Enter both latitude and longitude"),{status:400});
 const latitude=Number(input.latitude),longitude=Number(input.longitude);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Object.assign(new Error("Latitude or longitude is outside its valid range"),{status:400});return{latitude,longitude};
}
function publicConfig(actor){return{browserKey:String(process.env.GOOGLE_MAPS_BROWSER_KEY||""),mapId:String(process.env.GOOGLE_MAPS_MAP_ID||""),geocodingConfigured:Boolean(process.env.GOOGLE_MAPS_GEOCODING_KEY),types:Object.entries(RULES).filter(([,r])=>hasPermission(actor,r.view)).map(([type,r])=>({type,canEdit:hasPermission(actor,r.edit)}))};}
async function target(actor,input,write=true){
 const type=String(input.entityType||""),entityId=requiredUuid(input.entityId,"Location record"),slot=String(input.addressSlot||"");access(actor,type,write);
 let row,address,name,url;
 if(type==="customer"){
  row=await Customer.findOne({customerId:entityId}).select({businessName:1,billingAddress:1,deliveryAddresses:1}).lean();
  if(row){if(slot==="billing")address=row.billingAddress;else if(/^delivery:\d{1,5}$/.test(slot))address=row.deliveryAddresses?.[Number(slot.split(":")[1])];name=row.businessName+(slot==="billing"?" · Billing":" · Delivery");url="/customers?customerId="+entityId;}
 }else if(type==="warehouse"){
  row=await Warehouse.findOne({warehouseId:entityId}).select({name:1,address:1}).lean();if(slot==="main")address=row?.address;name=row?.name;url="/warehouses/"+entityId+"/edit";
 }else{
  row=await SupplierLocation.findOne({supplierLocationId:entityId}).lean();if(slot==="main")address=row;const supplier=row?await Supplier.findOne({supplierId:row.supplierId}).select({businessName:1}).lean():null;name=[supplier?.businessName,row?.name].filter(Boolean).join(" · ");url="/suppliers?supplierId="+row?.supplierId;
 }
 if(!row||!address)throw Object.assign(new Error("Address not found. Refresh the location list."),{status:404});
 if(!address.line1||!address.city||!address.pincode)throw Object.assign(new Error("Complete the street, city and pincode on the record before mapping it."),{status:400});
 return{...item(type,entityId,slot,name,address,url),rawAddress:address};
}
async function list(actor,query={}){
 const type=String(query.type||"customer");access(actor,type);
 const page=Math.max(1,Math.min(10000,Math.trunc(Number(query.page)||1))),limit=50;
 const search=String(query.search||"").trim().slice(0,120),rx=new RegExp(escapedRegex(search),"i");
 const recordId=query.recordId?requiredUuid(query.recordId,"Record"):"";let rows=[],total=0;
 if(type==="customer"){
  const match=recordId?{customerId:recordId}:{};
  const stages=[{$match:match},{$project:{customerId:1,businessName:1,addresses:{$concatArrays:[[{slot:"billing",address:"$billingAddress"}],{$map:{input:{$range:[0,{$size:{$ifNull:["$deliveryAddresses",[]]}}]},as:"i",in:{slot:{$concat:["delivery:",{$toString:"$$i"}]},address:{$arrayElemAt:["$deliveryAddresses","$$i"]}}}}]}}},{$unwind:"$addresses"}];
  if(search)stages.push({$match:{$or:[{businessName:rx},{"addresses.address.city":rx},{"addresses.address.pincode":rx},{"addresses.address.line1":rx}]}});
  stages.push({$facet:{items:[{$sort:{businessName:1,customerId:1,"addresses.slot":1}},{$skip:(page-1)*limit},{$limit:limit}],count:[{$count:"total"}]}});
  const [result]=await Customer.aggregate(stages).option({maxTimeMS:10000});total=result?.count?.[0]?.total||0;
  rows=(result?.items||[]).map(x=>item(type,x.customerId,x.addresses.slot,x.businessName+" · "+(x.addresses.slot==="billing"?"Billing":x.addresses.address?.label||"Delivery"),x.addresses.address||{},"/customers?customerId="+x.customerId));
 }else if(type==="warehouse"){
  const filter=recordId?{warehouseId:recordId}:{};if(search)filter.$or=[{name:rx},{"address.city":rx},{"address.pincode":rx},{"address.line1":rx}];
  const [items,count]=await Promise.all([Warehouse.find(filter).sort({name:1,warehouseId:1}).skip((page-1)*limit).limit(limit).lean(),Warehouse.countDocuments(filter)]);total=count;
  rows=items.map(x=>item(type,x.warehouseId,"main",x.name,x.address||{},hasPermission(actor,"warehouse.manage")?"/warehouses/"+x.warehouseId+"/edit":"/warehouses"));
 }else{
  const filter=recordId?{supplierId:recordId}:{};
  if(search){const suppliers=await Supplier.find({businessName:rx}).select({supplierId:1}).limit(500).lean();filter.$or=[{name:rx},{city:rx},{pincode:rx},{line1:rx},{supplierId:{$in:suppliers.map(x=>x.supplierId)}}];}
  const [items,count]=await Promise.all([SupplierLocation.find(filter).sort({name:1,supplierLocationId:1}).skip((page-1)*limit).limit(limit).lean(),SupplierLocation.countDocuments(filter)]);total=count;
  const ids=[...new Set(items.map(x=>x.supplierId))];const suppliers=await Supplier.find({supplierId:{$in:ids}}).select({supplierId:1,businessName:1}).limit(ids.length||1).lean();const names=new Map(suppliers.map(x=>[x.supplierId,x.businessName]));
  rows=items.map(x=>item(type,x.supplierLocationId,"main",[names.get(x.supplierId),x.name].filter(Boolean).join(" · "),x,"/suppliers?supplierId="+x.supplierId));
 }
 const conditions=rows.map(x=>({entityId:x.entityId,addressSlot:x.addressSlot,addressHash:x.addressHash}));
 const pins=conditions.length?await MapLocation.find({entityType:type,$or:conditions,$and:[{$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]}]}).limit(rows.length).lean():[];
 const byKey=new Map(pins.map(x=>[identity(type,x.entityId,x.addressSlot),x]));
 return{items:rows.map(x=>{const pin=byKey.get(x.key);return{...x,canEdit:hasPermission(actor,RULES[type].edit),location:pin?{latitude:pin.latitude,longitude:pin.longitude,source:pin.source,confirmedAt:pin.confirmedAt,expiresAt:pin.expiresAt}:null};}),page,pages:Math.max(1,Math.ceil(total/limit)),total,limit};
}
function tokenSecret(){return String(process.env.AUTH_COOKIE_SECRET||"findoly-b2b-development-cookie-secret-change-me");}
function signPreview(payload){const body=Buffer.from(JSON.stringify(payload)).toString("base64url");return body+"."+crypto.createHmac("sha256",tokenSecret()).update(body).digest("base64url");}
function readPreview(token){
 const [body,signature,extra]=String(token||"").split(".");if(!body||!signature||extra||body.length>16000)throw Object.assign(new Error("Location preview has expired. Geocode again."),{status:400});
 const expected=crypto.createHmac("sha256",tokenSecret()).update(body).digest("base64url"),a=Buffer.from(signature),b=Buffer.from(expected);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Object.assign(new Error("Location preview is invalid"),{status:400});
 let payload;try{payload=JSON.parse(Buffer.from(body,"base64url").toString());}catch(_){throw Object.assign(new Error("Location preview is invalid"),{status:400});}
 if(!Number.isFinite(payload.exp)||payload.exp<Date.now())throw Object.assign(new Error("Location preview has expired. Geocode again."),{status:400});return payload;
}
async function preview(actor,input){
 const row=await target(actor,input);if(input.addressHash!==row.addressHash)throw Object.assign(new Error("The address changed. Refresh before geocoding."),{status:409});
 const key=String(process.env.GOOGLE_MAPS_GEOCODING_KEY||"");if(!key)throw Object.assign(new Error("Google address lookup is not configured. You can enter coordinates manually."),{status:503,code:"GEOCODING_NOT_CONFIGURED"});
 const url=new URL("https://maps.googleapis.com/maps/api/geocode/json");url.search=new URLSearchParams({address:row.address,components:"country:IN",region:"in",key}).toString();
 let response,data;try{response=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();data=await response.json();}catch(_){throw Object.assign(new Error("Google address lookup is temporarily unavailable. Your address was not changed."),{status:503});}
 if(data.status==="ZERO_RESULTS")return{candidates:[],token:"",message:"No matching location. Check the manually entered address or enter coordinates."};
 if(data.status!=="OK")throw Object.assign(new Error("Google address lookup could not complete. Try later or ask an administrator to check Maps configuration."),{status:503,code:"GEOCODING_UNAVAILABLE"});
 const candidates=(data.results||[]).slice(0,5).map(x=>{const point=coordinates({latitude:x.geometry?.location?.lat,longitude:x.geometry?.location?.lng});const pin=x.address_components?.find(y=>y.types?.includes("postal_code"))?.long_name;return{...point,placeId:String(x.place_id||"").slice(0,512),label:String(x.formatted_address||""),needsReview:Boolean(x.partial_match)||x.geometry?.location_type!=="ROOFTOP"||pin!==row.rawAddress.pincode};});
 const token=signPreview({key:row.key,addressHash:row.addressHash,employeeId:actor.employeeId,exp:Date.now()+10*60000,candidates:candidates.map(({label,...point})=>point)});
 return{candidates,token,message:"Review the pin on Google Maps before saving. Your entered address stays unchanged."};
}
async function save(actor,input){
 const row=await target(actor,input);if(input.addressHash!==row.addressHash)throw Object.assign(new Error("The address changed. Refresh before saving a pin."),{status:409});
 let point,source,placeId="",expiresAt=null;
 if(input.source==="google"){
  const token=readPreview(input.token);if(token.employeeId!==actor.employeeId||token.key!==row.key||token.addressHash!==row.addressHash)throw Object.assign(new Error("This preview belongs to a different address or user"),{status:409});
  const index=Number(input.candidateIndex);if(!Number.isInteger(index)||!token.candidates?.[index])throw Object.assign(new Error("Select a preview location"),{status:400});
  point=coordinates(token.candidates[index]);placeId=token.candidates[index].placeId;source="google";expiresAt=new Date(Date.now()+GOOGLE_CACHE_MS);
 }else if(input.source==="manual"){point=coordinates(input);source="manual";}else throw Object.assign(new Error("Choose Google lookup or manual coordinates"),{status:400});
 const stored=await MapLocation.findOneAndUpdate({entityType:row.entityType,entityId:row.entityId,addressSlot:row.addressSlot},{$set:{addressHash:row.addressHash,...point,source,placeId,confirmedAt:new Date(),expiresAt,updatedBy:actor.employeeId}},{new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}).lean();
 return{mapLocationId:stored.mapLocationId,key:row.key,location:{...point,source,confirmedAt:stored.confirmedAt,expiresAt}};
}
module.exports={publicConfig,list,preview,save,coordinates,addressHash,addressText,readPreview,signPreview,access};
