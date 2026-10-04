const crypto=require("crypto");
const {rateLimit,ipKeyGenerator}=require("express-rate-limit");
const OtpRateLimit=require("../models/OtpRateLimit");
const uuid=require("../utils/uuid");

function handler(message){return(req,res)=>res.status(429).json({success:false,code:"RATE_LIMITED",message});}
const apiLimiter=rateLimit({windowMs:60*1000,limit:Number(process.env.API_RATE_LIMIT_PER_MINUTE||180),standardHeaders:"draft-8",legacyHeaders:false,handler:handler("Too many requests. Please wait a moment.")});

const testBuckets=new Map();
function otpIdentity(req){
  const mobile=String(req.body?.mobile||"").replace(/\D/g,"").slice(-10);
  if(/^[6-9]\d{9}$/.test(mobile))return `mobile:${mobile}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}
function bucketKey(kind,identity,bucket){
  return crypto.createHash("sha256").update(`${kind}:${identity}:${bucket}`).digest("hex");
}
function sharedOtpLimiter(kind,limitEnv,message){
  const windowMs=15*60*1000;
  return async(req,res,next)=>{
    const limit=Number(process.env[limitEnv]||(kind==="send"?5:10));
    const bucket=Math.floor(Date.now()/windowMs);
    const key=bucketKey(kind,otpIdentity(req),bucket);
    if(process.env.NODE_ENV==="test"&&process.env.SKIP_DB==="true"){
      const count=(testBuckets.get(key)||0)+1;testBuckets.set(key,count);
      if(count>limit)return res.status(429).json({success:false,code:"RATE_LIMITED",message});
      return next();
    }
    const expiresAt=new Date((bucket+1)*windowMs+60*1000);
    try{
      let row;
      try{
        row=await OtpRateLimit.findOneAndUpdate(
          {bucketKey:key},
          {$inc:{count:1},$setOnInsert:{otpRateLimitId:uuid(),expiresAt}},
          {upsert:true,new:true,setDefaultsOnInsert:true}
        ).lean();
      }catch(error){
        if(error?.code!==11000)throw error;
        row=await OtpRateLimit.findOneAndUpdate({bucketKey:key},{$inc:{count:1}},{new:true}).lean();
      }
      if(Number(row?.count||0)>limit)return res.status(429).json({success:false,code:"RATE_LIMITED",message});
      return next();
    }catch(error){
      console.error("OTP rate-limit store failed",error);
      return res.status(503).json({success:false,code:"OTP_RATE_LIMIT_UNAVAILABLE",message:"OTP protection is temporarily unavailable. Try again shortly."});
    }
  };
}
const sendOtpLimiter=sharedOtpLimiter("send","OTP_SEND_LIMIT","Too many OTP requests. Try again later.");
const verifyOtpLimiter=sharedOtpLimiter("verify","OTP_VERIFY_LIMIT","Too many OTP attempts. Try again later.");
module.exports={apiLimiter,sendOtpLimiter,verifyOtpLimiter};
