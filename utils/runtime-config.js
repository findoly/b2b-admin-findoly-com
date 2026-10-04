function assertProductionConfig(){
  if(process.env.NODE_ENV!=="production")return;
  if(process.env.SKIP_DB==="true")throw new Error("SKIP_DB cannot be enabled in production");
  const secret=String(process.env.AUTH_COOKIE_SECRET||"");
  if(secret.length<32||secret.includes("change-me"))throw new Error("AUTH_COOKIE_SECRET must be a strong production secret of at least 32 characters");
  if(!String(process.env.MONGODB_URI||"").trim())throw new Error("MONGODB_URI is required in production");
  const otp=String(process.env.B2B_OTP_BASE_URL||"https://api.findoly.com/otp");
  if(!otp.startsWith("https://"))throw new Error("B2B OTP service must use HTTPS in production");
  const trustProxy=String(process.env.TRUST_PROXY??"").trim();
  if(!/^\d+$/.test(trustProxy))throw new Error("TRUST_PROXY must be explicitly configured as a non-negative integer in production");
}
module.exports={assertProductionConfig};
