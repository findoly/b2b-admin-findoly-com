"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assertProductionConfig}=require("../utils/runtime-config");

function withEnv(values,fn){
  const previous={};
  for(const [key,value] of Object.entries(values)){previous[key]=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  try{return fn();}finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}

test("non-production configuration does not require production secrets",()=>withEnv({NODE_ENV:"test",AUTH_COOKIE_SECRET:undefined,MONGODB_URI:undefined},()=>assert.doesNotThrow(assertProductionConfig)));

test("production rejects missing or weak auth cookie secrets",()=>{
  withEnv({NODE_ENV:"production",SKIP_DB:undefined,AUTH_COOKIE_SECRET:"short",MONGODB_URI:"mongodb://example/b2b",B2B_OTP_BASE_URL:"https://api.findoly.com/otp"},()=>assert.throws(assertProductionConfig,/AUTH_COOKIE_SECRET/));
});

test("production requires MongoDB configuration",()=>{
  withEnv({NODE_ENV:"production",SKIP_DB:undefined,AUTH_COOKIE_SECRET:"a".repeat(40),MONGODB_URI:"",B2B_OTP_BASE_URL:"https://api.findoly.com/otp"},()=>assert.throws(assertProductionConfig,/MONGODB_URI/));
});

test("production requires HTTPS OTP service",()=>{
  withEnv({NODE_ENV:"production",SKIP_DB:undefined,AUTH_COOKIE_SECRET:"a".repeat(40),MONGODB_URI:"mongodb://example/b2b",B2B_OTP_BASE_URL:"http://api.findoly.com/otp"},()=>assert.throws(assertProductionConfig,/HTTPS/));
});

test("production rejects SKIP_DB bypass",()=>{
  withEnv({NODE_ENV:"production",SKIP_DB:"true",AUTH_COOKIE_SECRET:"a".repeat(40),MONGODB_URI:"mongodb://example/b2b",B2B_OTP_BASE_URL:"https://api.findoly.com/otp"},()=>assert.throws(assertProductionConfig,/SKIP_DB/));
});

test("valid production configuration passes",()=>{
  withEnv({NODE_ENV:"production",SKIP_DB:undefined,AUTH_COOKIE_SECRET:"a".repeat(40),MONGODB_URI:"mongodb://example/b2b",B2B_OTP_BASE_URL:"https://api.findoly.com/otp"},()=>assert.doesNotThrow(assertProductionConfig));
});
