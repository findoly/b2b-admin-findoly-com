const Employee=require("../models/Employee"); const {mobileValue,textValue}=require("../utils/validation"); const {setAdminCookie,clearAdminCookie,firstAuthorizedPath}=require("../middleware/auth"); const access=require("../services/access/access-service"); const otp=require("../services/access/otp-client");
async function sendOtp(req,res,next){try{const mobile=mobileValue(req.body?.mobile); const employee=await access.findActiveEmployeeByMobile(mobile); const bootstrap=employee?false:await access.canUseBootstrap(mobile); if(!employee&&!bootstrap)return res.json({success:true,data:{message:"If this mobile number is authorized, an OTP will be sent.",mobile}}); const response=await otp.requestOtp(otp.urls().send,{mobile}); return res.json({success:true,data:{message:"If this mobile number is authorized, an OTP will be sent.",mobile,sessionId:response?.data?.sessionId||response?.sessionId||""}});}catch(error){if([429,502,504].includes(Number(error.status)))return res.status(error.status===429?429:503).json({success:false,code:error.status===429?"OTP_RATE_LIMIT":"OTP_SERVICE_UNAVAILABLE",message:error.message});return next(error);}}
async function verifyOtp(req,res,next){
  // The public error remains generic; diagnostic stages never contain OTPs or mobile numbers.
  let stage="input-validation";
  try{
    const mobile=mobileValue(req.body?.mobile);
    const code=textValue(req.body?.otp,{label:"OTP",required:true,minLength:4,maxLength:8});
    if(!/^\d{4,8}$/.test(code))throw Object.assign(new Error("OTP must contain 4 to 8 digits"),{status:400});
    stage="upstream-verification";
    const result=await otp.requestOtp(otp.urls().verify,{mobile,otp:code});
    if(!otp.isSuccess(result))throw Object.assign(new Error("Invalid or expired OTP"),{status:401});
    stage="default-role-setup";
    await access.ensureDefaultRoles();
    stage="employee-lookup";
    let employee=await access.findActiveEmployeeByMobile(mobile);
    if(!employee){
      stage="employee-bootstrap";
      employee=await access.createBootstrapEmployee(mobile);
    }
    if(!employee)throw Object.assign(new Error("Employee access is unavailable"),{status:401});
    stage="role-resolution";
    const resolved=await access.resolveEmployeeAccess(employee.toObject?employee.toObject():employee);
    if(!resolved)throw Object.assign(new Error("Employee access is unavailable"),{status:403});
    stage="session-creation";
    await Employee.updateOne({employeeId:resolved.employeeId},{$set:{lastLoginAt:new Date()}});
    const session=setAdminCookie(res,resolved);
    return res.json({success:true,data:{employeeId:session.employeeId,name:session.name,roleName:session.roleName,permissions:session.permissions,homePath:firstAuthorizedPath(session),expiresAt:new Date(session.exp).toISOString()}});
  }catch(error){
    if([400,401,403].includes(Number(error.status))){
      console.warn("B2B OTP login rejected",{requestId:String(req.requestId||"unknown").slice(0,64),stage});
      return res.status(401).json({success:false,code:"OTP_VERIFICATION_FAILED",message:"OTP verification failed or employee access is unavailable"});
    }
    return next(error);
  }
}
function me(req,res){return res.json({success:true,data:req.admin});} function logout(req,res){clearAdminCookie(res);return res.json({success:true});}
module.exports={sendOtp,verifyOtp,me,logout};
