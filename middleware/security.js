"use strict";
const crypto=require("crypto");
const SAFE_METHODS=new Set(["GET","HEAD","OPTIONS"]);

function deny(res,code,message){
  return res.status(403).json({success:false,code,message});
}

function requireSameOriginMutation(req,res,next){
  if(SAFE_METHODS.has(req.method))return next();
  const origin=String(req.get("origin")||"");
  if(origin){
    try{
      const allowed=new URL(origin).host===req.get("host");
      if(!allowed)return deny(res,"ORIGIN_NOT_ALLOWED","Request origin is not allowed");
    }catch(_){
      return deny(res,"ORIGIN_NOT_ALLOWED","Request origin is not allowed");
    }
    return next();
  }
  const fetchSite=String(req.get("sec-fetch-site")||"").toLowerCase();
  if(fetchSite&&!["same-origin","same-site","none"].includes(fetchSite)){
    return deny(res,"ORIGIN_NOT_ALLOWED","Request origin is not allowed");
  }
  return next();
}

function safeEqual(a,b){
  const left=Buffer.from(String(a||""));
  const right=Buffer.from(String(b||""));
  return left.length===right.length&&left.length>0&&crypto.timingSafeEqual(left,right);
}

function requireCsrfMutation(req,res,next){
  if(SAFE_METHODS.has(req.method)||!req.admin)return next();
  const expected=String(res.locals.csrfToken||"");
  const provided=String(req.get("x-csrf-token")||"");
  if(!safeEqual(expected,provided)){
    return deny(res,"CSRF_TOKEN_INVALID","Security token is missing or invalid. Refresh the page and try again.");
  }
  return next();
}

module.exports={requireSameOriginMutation,requireCsrfMutation};
