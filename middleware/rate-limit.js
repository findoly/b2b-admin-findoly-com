const {rateLimit,ipKeyGenerator}=require("express-rate-limit");
function handler(message){return(req,res)=>res.status(429).json({success:false,code:"RATE_LIMITED",message});}
function otpKey(req){
  const mobile=String(req.body?.mobile||"").replace(/\D/g,"").slice(-10);
  if(/^[6-9]\d{9}$/.test(mobile))return `mobile:${mobile}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}
const apiLimiter=rateLimit({windowMs:60*1000,limit:Number(process.env.API_RATE_LIMIT_PER_MINUTE||180),standardHeaders:"draft-8",legacyHeaders:false,handler:handler("Too many requests. Please wait a moment.")});
const sendOtpLimiter=rateLimit({windowMs:15*60*1000,limit:Number(process.env.OTP_SEND_LIMIT||5),keyGenerator:otpKey,standardHeaders:"draft-8",legacyHeaders:false,handler:handler("Too many OTP requests. Try again later.")});
const verifyOtpLimiter=rateLimit({windowMs:15*60*1000,limit:Number(process.env.OTP_VERIFY_LIMIT||10),keyGenerator:otpKey,standardHeaders:"draft-8",legacyHeaders:false,handler:handler("Too many OTP attempts. Try again later.")});
module.exports={apiLimiter,sendOtpLimiter,verifyOtpLimiter};
