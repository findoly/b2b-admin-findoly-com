"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../public/js/operations-map.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../views/operations-map.ejs"),"utf8");

async function mapPage(){
 let map;
 class Bounds{
  constructor(sw,ne){this.sw=sw;this.ne=ne;this.points=[];}
  extend(point){this.points.push(point);}
 }
 class FakeMap{
  constructor(){this.centre={lat:21,lng:77};this.zoom=5;this.fits=[];this.pans=[];map=this;}
  addListener(){return{remove(){}};}
  getCenter(){return{lat:()=>this.centre.lat,lng:()=>this.centre.lng};}
  getZoom(){return this.zoom;}
  setZoom(value){this.zoom=value;}
  setCenter(point){this.centre=point;}
  panTo(point){this.centre=point;this.pans.push(point);}
  fitBounds(bounds,padding){this.fits.push({bounds,padding});}
 }
 class Marker{addListener(){}}
 const maps={
  importLibrary:async()=>({Map:FakeMap}),
  LatLngBounds:Bounds,
  InfoWindow:class{close(){}},
  marker:{AdvancedMarkerElement:Marker},
  event:{clearInstanceListeners(){}}
 };
 const context=vm.createContext({
  window:{google:{maps}},google:{maps},
  document:{getElementById:()=>null,createElement:()=>({})},
  apiFetch(){throw Error("Zoom must not call backend APIs");}
 });
 vm.runInContext(source,context);
 const page=vm.runInContext("operationsMapPage()",context);
 page.config={browserKey:"mock-key",mapId:"mock-id",types:[]};
 await page.startMap();
 assert.equal(page.mapReady,true);
 return{page,map};
}
function halfLatitude(bounds){return(bounds.ne.lat-bounds.sw.lat)/2;}
function near(actual,expected,tolerance=0.01){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should be near ${expected}`);}

test("dropdown exposes accessible, fixed kilometre presets and cache-busted script",()=>{
 assert.match(view,/for="map-zoom-range"/);
 assert.match(view,/id="map-zoom-range"/);
 assert.match(view,/@change="setZoomRange\(\)"/);
 assert.match(view,/:disabled="!mapReady"/);
 for(const value of ["all","1","2","5","10","25","50","100","250","500"]){
  assert.ok(view.includes(`<option value="${value}">`),value);
 }
 assert.match(view,/operations-map\.js\?v=20261011-km-range/);
});

test("kilometre presets fit geographic viewport without requesting new locations",async()=>{
 const {page,map}=await mapPage();
 const initial=map.fits.length;
 page.zoomRangeKm="1";
 page.setZoomRange();
 near(halfLatitude(map.fits.at(-1).bounds),1/6371*180/Math.PI,0.001);
 assert.equal(map.fits.at(-1).padding,16);
 page.zoomRangeKm="500";
 page.setZoomRange();
 near(halfLatitude(map.fits.at(-1).bounds),500/6371*180/Math.PI,0.001);
 assert.equal(map.fits.length,initial+2);
});

test("range uses selected pin coordinates and persists when markers redraw",async()=>{
 const {page,map}=await mapPage();
 const row={key:"customer:test:billing",entityType:"customer",name:"Customer",location:{latitude:19.12,longitude:72.88}};
 page.types=["customer"];page.rows=[row];page.selected=row;
 page.zoomRangeKm="10";page.setZoomRange();
 const bounds=map.fits.at(-1).bounds;
 near((bounds.sw.lat+bounds.ne.lat)/2,19.12,0.000001);
 near((bounds.sw.lng+bounds.ne.lng)/2,72.88,0.000001);
 const fits=map.fits.length;
 page.drawMarkers(true);
 assert.equal(map.fits.length,fits,"marker redraw must not overwrite active range");
 assert.equal(page.rows.length,1);
});

test("selecting another location retains the configured distance",async()=>{
 const {page,map}=await mapPage();
 page.zoomRangeKm="25";page.$nextTick=()=>{};
 page.select({key:"warehouse:test:main",entityType:"warehouse",location:{latitude:12.95,longitude:77.6}});
 near((map.fits.at(-1).bounds.ne.lat+map.fits.at(-1).bounds.sw.lat)/2,12.95,0.000001);
 assert.equal(page.zoomRangeKm,"25");
});

test("All locations fits loaded visible markers, preserving all records",async()=>{
 const {page,map}=await mapPage();
 page.types=["customer"];
 page.rows=[
  {key:"c1",entityType:"customer",name:"One",location:{latitude:12,longitude:77}},
  {key:"c2",entityType:"customer",name:"Two",location:{latitude:22,longitude:78}},
  {key:"s1",entityType:"supplier",name:"Supplier",location:{latitude:30,longitude:80}}
 ];
 page.zoomRangeKm="all";page.setZoomRange();
 assert.equal(map.fits.at(-1).bounds.points.length,2);
 assert.equal(page.rows.length,3);
 assert.equal(page.zoomRangeKm,"all");
});

test("missing map and missing pins are safe fallback states",async()=>{
 const context=vm.createContext({});
 vm.runInContext(source,context);
 const empty=vm.runInContext("operationsMapPage()",context);
 empty.zoomRangeKm="2";
 assert.doesNotThrow(()=>empty.setZoomRange());
 const {page,map}=await mapPage();
 page.zoomRangeKm="all";page.setZoomRange();
 assert.equal(map.zoom,5);
 assert.equal(map.centre.lat,20.5937);
});
