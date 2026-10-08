"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const otp=require("../services/access/otp-client");
const storage=require("../services/storage/s3-service");
const report=require("../services/report-service");

test("negative OTP verification cannot be overridden by a generic success flag",()=>{
  assert.equal(otp.isSuccess({success:true,data:{verified:false}}),false);
  assert.equal(otp.isSuccess({status:"success",verified:false}),false);
  assert.equal(otp.isSuccess({success:true,data:{verified:true}}),true);
});

test("S3 POST policy restricts key, type, expiry, and actual multipart request size",()=>{
  const cfg={
    region:"ap-south-1",bucket:"qa-test-bucket",
    credentials:{accessKeyId:"TESTACCESSKEY",secretAccessKey:"test-secret-for-signing",sessionToken:""},
    maxUploadBytes:1048576
  };
  const signed=storage.presignedPost(cfg,"private/b2b/invoices/file.pdf","application/pdf",{expiresIn:300});
  assert.equal(signed.method,"POST");
  assert.equal(signed.url,"https://qa-test-bucket.s3.ap-south-1.amazonaws.com/");
  assert.equal(signed.fields.key,"private/b2b/invoices/file.pdf");
  assert.equal(signed.fields["Content-Type"],"application/pdf");
  assert.match(signed.fields["x-amz-signature"],/^[a-f0-9]{64}$/);
  const policy=JSON.parse(Buffer.from(signed.fields.policy,"base64").toString("utf8"));
  assert.deepEqual(policy.conditions.find(c=>Array.isArray(c)&&c[0]==="content-length-range"),["content-length-range",1,1048576]);
  for(const field of ["key","Content-Type","x-amz-algorithm","x-amz-credential","x-amz-date"]){
    assert.ok(policy.conditions.some(c=>!Array.isArray(c)&&c[field]===signed.fields[field]),field);
  }
  assert.ok(Date.parse(policy.expiration)>Date.now());
});

test("CSV exports neutralize spreadsheet formulas from supplier and employee names",()=>{
  const csv=report.toCsv({
    from:new Date("2026-01-01T00:00:00Z"),to:new Date("2026-01-02T00:00:00Z"),
    agentPerformance:[{employeeName:"=1+1",employeeId:"abc",orderCount:1,netSalesPaise:0,stockCostPaise:0,procurementCostPaise:0,cogsPaise:0,grossMarginPaise:0}],
    supplierPerformance:[{supplierId:"xyz",supplierName:"  +SUM(1,2)",allocationCount:0,quantity:0,procurementCostPaise:0}]
  });
  assert.ok(csv.includes("'=1+1,abc"));
  assert.ok(csv.includes("'  +SUM(1,2)"));
});

test("workflow-managed inventory is unavailable to manual adjustments",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../services/inventory-service.js"),"utf8");
  assert.match(source,/WORKFLOW_STOCK_ADJUSTMENT_FORBIDDEN/);
  for(const name of ["reserved","incoming","picked","packed"])assert.match(source,new RegExp('\"'+name+'\"'));
});

test("payment replay normalizes an omitted paidAt to the persisted payment date",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../services/finance-service.js"),"utf8");
  assert.equal((source.match(/input\.paidAt\?intentSignature:paymentIntent\(existing\.paidAt\)/g)||[]).length,2);
});
