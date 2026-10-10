"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module");
const otp=require("../services/access/otp-client");

async function attempt(reply,{missingEmployee=false,inactiveRole=false}={}){
  const file=path.join(__dirname,"../controllers/authController.js");
  const realRequire=Module.createRequire(file);
  const counters={cookie:0,employeeUpdate:0,defaultRoles:0};
  const employee=missingEmployee?null:{employeeId:"a".repeat(32),status:"active",name:"Test",mobile:"9876543210"};
  const fake={
    "../models/Employee":{async updateOne(){counters.employeeUpdate++;}},
    "../middleware/auth":{async createAdminSession(_res,access){counters.cookie++;return {...access,exp:Date.now()+60000};},firstAuthorizedPath(){return "/dashboard";}},
    "../utils/validation":require("../utils/validation"),
    "../services/access/otp-client":{urls(){return{verify:"local-test-url"};},async requestOtp(){return reply;},isSuccess:otp.isSuccess},
    "../services/access/access-service":{
      async ensureDefaultRoles(){counters.defaultRoles++;},
      async findActiveEmployeeByMobile(){return employee;},
      async createBootstrapEmployee(){return null;},
      async resolveEmployeeAccess(record){return inactiveRole?null:{...record,roleName:"Admin",permissions:["dashboard.view"]};}
    }
  };
  const mod=new Module(file,module);
  mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
  mod.require=name=>Object.hasOwn(fake,name)?fake[name]:realRequire(name);
  mod._compile(fs.readFileSync(file,"utf8"),file);
  const res={statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
  const originalWarn=console.warn,warnings=[];
  console.warn=(...parts)=>warnings.push(parts);
  try{await mod.exports.verifyOtp({requestId:"unit-test",body:{mobile:"9876543210",otp:"123456"}},res,e=>{throw e;});}
  finally{console.warn=originalWarn;}
  return {res,counters,warnings};
}

test("valid explicit OTP aliases establish a session",async()=>{
  for(const response of [{verify:true},{data:{verify:true}},{verified:true},{data:{verified:true}}]){
    const {res,counters,warnings}=await attempt(response);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.success,true);
    assert.equal(res.body.data.homePath,"/dashboard");
    assert.equal(counters.cookie,1);
    assert.equal(counters.employeeUpdate,1);
    assert.deepEqual(warnings,[]);
  }
});

test("ambiguous or conflicting OTP flags never establish a session",async()=>{
  for(const response of [{success:true},{verify:true,verified:false},{verify:"true"},{verify:true,status:"failed"}]){
    const {res,counters,warnings}=await attempt(response);
    assert.equal(res.statusCode,401);
    assert.equal(res.body.code,"OTP_VERIFICATION_FAILED");
    assert.equal(counters.cookie,0);
    assert.equal(counters.employeeUpdate,0);
    assert.equal(counters.defaultRoles,0);
    assert.equal(warnings[0][1].stage,"upstream-verification");
  }
});

test("employee and role access cannot be bypassed by a valid OTP",async()=>{
  for(const [opts,stage] of [[{missingEmployee:true},"employee-bootstrap"],[{inactiveRole:true},"role-resolution"]]){
    const {res,counters,warnings}=await attempt({data:{verify:true}},opts);
    assert.equal(res.statusCode,401);
    assert.equal(counters.cookie,0);
    assert.equal(warnings[0][1].stage,stage);
    assert.equal(warnings[0][1].requestId,"unit-test");
    assert.ok(!JSON.stringify(warnings).includes("123456"));
    assert.ok(!JSON.stringify(warnings).includes("9876543210"));
  }
});
