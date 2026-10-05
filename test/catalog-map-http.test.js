"use strict";
process.env.NODE_ENV='test';process.env.SKIP_DB='true';process.env.AUTH_COOKIE_SECRET='test-secret-at-least-32-characters-long';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const app=require('../app'),{encodeSession,csrfTokenForSession}=require('../middleware/auth');
const catalog=require('../services/catalog-service'),location=require('../services/location-service'),audit=require('../services/audit-service');
function headers(permissions){const now=Date.now(),session={v:1,employeeId:'a'.repeat(32),permissions,iat:now,exp:now+60000};return{Cookie:'findoly_b2b_admin='+encodeSession(session),'X-CSRF-Token':csrfTokenForSession(session)};}
test('catalogue access requires product view and catalogue writes require management permission',async(t)=>{
 t.mock.method(catalog,'list',async()=>({items:[],page:1,pages:1}));
 assert.equal((await request(app).get('/api/catalog/categories')).status,401);
 assert.equal((await request(app).get('/api/catalog/categories').set(headers(['customers.view']))).status,403);
 assert.equal((await request(app).get('/api/catalog/categories').set(headers(['products.view']))).status,200);
 assert.equal((await request(app).post('/api/catalog/categories').set(headers(['products.view'])).send({name:'Food'})).status,403);
});
test('map listing does not expose supplier or warehouse data to customer-only viewers',async()=>{
 assert.equal((await request(app).get('/api/map/locations?type=supplier').set(headers(['customers.view']))).status,403);
 assert.equal((await request(app).get('/api/map/locations?type=warehouse').set(headers(['customers.view']))).status,403);
 const response=await request(app).get('/api/map/config').set(headers(['customers.view']));
 assert.deepEqual(response.body.data.types,[{type:'customer',canEdit:false}]);assert.equal(response.body.data.serverKey,undefined);
});
test('map writes require CSRF and editing permission even when the map page is visible',async()=>{
 const h=headers(['customers.view']);const input={entityType:'customer',entityId:'b'.repeat(32),addressSlot:'billing',latitude:19,longitude:73,source:'manual'};
 assert.equal((await request(app).put('/api/map/location').set('Cookie',h.Cookie).send(input)).status,403);
 assert.equal((await request(app).put('/api/map/location').set(h).send(input)).status,403);
});
test('authorized map save connects HTTP input, employee identity, response and audit',async(t)=>{
 let received,audited;
 t.mock.method(location,'save',async(actor,input)=>{received={actor,input};return{mapLocationId:'c'.repeat(32),key:'customer:record:billing',location:{latitude:19,longitude:73,source:'manual'}};});
 t.mock.method(audit,'record',async(req,data)=>{audited=data;});
 const input={entityType:'customer',entityId:'b'.repeat(32),addressSlot:'billing',addressHash:'hash',latitude:19,longitude:73,source:'manual'};
 const response=await request(app).put('/api/map/location').set(headers(['customers.view','customers.edit'])).send(input);
 assert.equal(response.status,200);assert.equal(received.actor.employeeId,'a'.repeat(32));assert.deepEqual(received.input,input);assert.equal(response.body.data.location.latitude,19);assert.equal(audited.action,'map.pin_save');assert.equal(audited.after.source,'manual');
});
test('Google script policy is confined to the map page; other pages retain the existing CSP',async()=>{
 const h=headers(['*']);const map=await request(app).get('/operations-map').set(h),catalogue=await request(app).get('/categories').set(h);
 assert.equal(map.status,200);assert.equal(catalogue.status,200);assert.match(map.headers['content-security-policy'],/googleapis\.com/);assert.doesNotMatch(catalogue.headers['content-security-policy'],/googleapis\.com|unsafe-eval/);
});
