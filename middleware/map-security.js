"use strict";
const helmet=require("helmet");
// Google Maps needs additional origins only on its dedicated page.
module.exports=helmet.contentSecurityPolicy({directives:{
 defaultSrc:["'self'"],
 scriptSrc:["'self'",(req,res)=>`'nonce-${res.locals.cspNonce}'`,"https://*.googleapis.com","https://*.gstatic.com","'unsafe-eval'"],
 styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],
 imgSrc:["'self'","data:","https:"],
 connectSrc:["'self'","https://*.googleapis.com","https://*.google.com","https://*.gstatic.com","data:","blob:"],
 fontSrc:["'self'","https://fonts.gstatic.com","data:"],
 frameSrc:["https://*.google.com"],workerSrc:["'self'","blob:"],objectSrc:["'none'"],frameAncestors:["'none'"]
}});
