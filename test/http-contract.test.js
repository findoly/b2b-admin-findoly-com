"use strict";
process.env.SKIP_DB="true";
process.env.NODE_ENV="test";
process.env.AUTH_COOKIE_SECRET="test-secret-at-least-32-characters-long";

const test=require("node:test");
const assert=require("node:assert/strict");
const request=require("supertest");
const app=require("../app");
const {encodeSession}=require("../middleware/auth");
const {normalizedError}=require("../middleware/error");

function authCookie(permissions=[]){
  const now=Date.now();
  const token=encodeSession({v:1,employeeId:"a".repeat(32),name:"QA Employee",mobile:"9000000000",roleId:"b".repeat(32),roleName:"QA",permissions,iat:now,exp:now+60000});
  return `findoly_b2b_admin=${token}`;
}

test("health is ready without DB in test mode",async()=>{
  const r=await request(app).get("/api/health");
  assert.equal(r.status,200);
  assert.equal(r.body.data.service,"b2b-admin-findoly-com");
});

test("protected order API rejects unauthenticated access",async()=>{
  const r=await request(app).get("/api/orders");
  assert.equal(r.status,401);
});

test("browser order page redirects unauthenticated employees",async()=>{
  const r=await request(app).get("/orders");
  assert.equal(r.status,302);
  assert.match(r.headers.location,/^\/login/);
});

test("foreign-origin mutations are rejected before controller execution",async()=>{
  const r=await request(app).post("/api/auth/send-otp").set("Origin","https://evil.example").send({mobile:"9000000000"});
  assert.equal(r.status,403);
  assert.equal(r.body.code,"ORIGIN_NOT_ALLOWED");
});

test("permission middleware rejects authenticated users without feature permission",async()=>{
  const r=await request(app).get("/api/audit").set("Cookie",authCookie([]));
  assert.equal(r.status,403);
  assert.equal(r.body.code,"FORBIDDEN");
});

test("customer credit fields require customers.credit permission",async()=>{
  const r=await request(app).post("/api/customers").set("Cookie",authCookie(["customers.create"])).send({creditLimitPaise:10000});
  assert.equal(r.status,403);
  assert.match(r.body.message,/credit permission/i);
});

test("new cancellation and stock-recheck routes remain protected",async()=>{
  const id="c".repeat(32);
  const [cancel,recheck]=await Promise.all([
    request(app).post(`/api/orders/${id}/cancel`).send({reason:"test"}),
    request(app).post(`/api/orders/${id}/recheck-stock`).send({})
  ]);
  assert.equal(cancel.status,401);
  assert.equal(recheck.status,401);
});

test("product media permission does not require broad storage.manage access",async()=>{
  const r=await request(app).post("/api/products/media/upload-url").set("Cookie",authCookie(["products.media"])).send({kind:"image",fileName:"test.jpg",contentType:"image/jpeg",sizeBytes:100});
  assert.notEqual(r.status,403);
  assert.equal(r.status,503);
});

test("general storage upload still requires storage.manage",async()=>{
  const r=await request(app).post("/api/storage/upload-url").set("Cookie",authCookie(["products.media"])).send({fileName:"test.jpg",contentType:"image/jpeg",sizeBytes:100});
  assert.equal(r.status,403);
});


test("delivery workflow endpoints remain permission protected",async()=>{
  const id="d".repeat(32);
  const [options,detail,update]=await Promise.all([
    request(app).get("/api/delivery/options"),
    request(app).get(`/api/delivery/${id}`),
    request(app).post(`/api/delivery/${id}/status`).send({status:"picked_up"})
  ]);
  assert.equal(options.status,401);
  assert.equal(detail.status,401);
  assert.equal(update.status,401);
});

test("delivery assignment options do not require employee-management permission",async()=>{
  const r=await request(app).get("/api/delivery/options").set("Cookie",authCookie(["delivery.assign"]));
  assert.notEqual(r.status,403);
});

test("product gallery mutation requires products.media permission",async()=>{
  const id="e".repeat(32),mediaId="f".repeat(32);
  const r=await request(app).put(`/api/products/${id}/media/${mediaId}`).set("Cookie",authCookie(["products.view"])).send({isPrimary:true});
  assert.equal(r.status,403);
});


test("mongoose validation and duplicate errors map to client-safe HTTP statuses",()=>{
  assert.deepEqual(normalizedError({name:"ValidationError"}),{status:400,code:"VALIDATION_ERROR",message:"Request data is invalid",expose:true});
  assert.deepEqual(normalizedError({code:11000}),{status:409,code:"DUPLICATE_RESOURCE",message:"A record with the same unique value already exists",expose:true});
});
