"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const shellPages=fs.readdirSync(path.join(root,"views")).filter(p=>p.endsWith(".ejs")&&!["login.ejs","error.ejs"].includes(p));
test("N5: authenticated pages share the exact same mobile navigation shell",()=>{
  assert.ok(shellPages.length>=35);
  for(const page of shellPages){
    const s=read("views/"+page);
    for(const partial of ["head","navbar","sidebar","scripts"])assert.ok(s.includes("include('partials/"+partial+"')"),page+" "+partial);
    assert.match(s,/<body x-data="crmShell\(\)" x-init="initShell\(\)">/,page);
  }
});
test("N1/N4: sticky mobile topbar stays below drawer/overlay and appearance panels",()=>{
  const s=read("public/css/b2b-workspace.css"),a=read("public/css/app.css");
  assert.match(s,/@media\(max-width:991\.98px\)\{\s*\.crm-topbar\.navbar-static\{position:sticky;top:0;z-index:1040;overflow:visible\}/);
  assert.match(s,/\.crm-sidebar\.sidebar-main\{z-index:1060!important\}/);
  assert.match(s,/\.crm-sidebar-overlay\{z-index:1055!important\}/);
  assert.match(a,/\.crm-appearance-panel\s*\{[\s\S]*?z-index:\s*1090/);
  assert.match(s,/html\{scroll-padding-top:4\.5rem\}/);
  assert.match(s,/\.crm-topbar \.crm-mobile-menu\{display:inline-flex;min-width:44px;min-height:44px/);
});
test("N2/N3: shared responsive state is driven by one CSS-equivalent media query",()=>{
  const s=read("views/partials/scripts.ejs"),bar=read("views/partials/navbar.ejs"),menu=read("views/partials/sidebar.ejs");
  assert.match(s,/CRM_MOBILE_NAV_QUERY='\(max-width: 991\.98px\)'/);
  assert.match(s,/mobileMediaQuery=window\.matchMedia\(CRM_MOBILE_NAV_QUERY\)/);
  assert.match(s,/mobileMediaQuery\.addEventListener\('change',update\)/);
  assert.doesNotMatch(s,/window\.innerWidth<992/);
  assert.match(menu,/x-effect="syncMobileDrawer\(mobileViewport && sidebarOpen\)"/);
  assert.match(menu,/@keydown\.tab\.window="trapSidebarFocus\(\$event\)"/);
  assert.match(bar,/:aria-expanded="sidebarOpen\.toString\(\)"/);
  for(const part of [".crm-topbar",".content-wrapper"])assert.ok(s.includes("document.querySelector('"+part+"')?.toggleAttribute('inert',active)"));
});
function makeShell(){
 const handlers={},classes=new Set(),bodyClasses=new Set(),attributes=new Map(),focuses=[];
 const createEl=name=>({name,attrs:new Set(),toggleAttribute(k,on){if(on)this.attrs.add(k);else this.attrs.delete(k)},focus(){focuses.push(name);document.activeElement=this},getClientRects(){return [1]}});
 const topbar=createEl("topbar"),content=createEl("content"),trigger=createEl("trigger"),close=createEl("close"),first=createEl("first"),last=createEl("last");
 const drawer={contains:el=>el===first||el===last,querySelectorAll:()=>[first,last]};
 const document={documentElement:{classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)}},body:{classList:{toggle:(k,v)=>v?bodyClasses.add(k):bodyClasses.delete(k)}},querySelector:q=>({".crm-topbar":topbar,".content-wrapper":content,".crm-mobile-menu":trigger,".crm-sidebar-close":close})[q],getElementById:id=>id==="crmPrimaryNavigation"?drawer:null,activeElement:trigger,addEventListener:()=>{}};
 const query={matches:true,addEventListener:(name,callback)=>{handlers.query=callback}};
 const window={__crmServerAdmin:{employeeId:"employee"},matchMedia:()=>query,addEventListener:(event,callback)=>{handlers[event]=callback}};
 const context=vm.createContext({document,window,location:{pathname:"/dashboard"},localStorage:{getItem:()=>null},setTimeout:()=>{},console});
 const script=read("views/partials/scripts.ejs").replace(/<script[^>]*>/,"").replace(/<\/script>/,"");
 vm.runInContext(script,context);
 const shell=vm.runInContext("crmShell()",context);shell.$nextTick=callback=>callback();
 return {shell,handlers,query,context,topbar,content,classes,bodyClasses,focuses,first,last,trigger,close,document};
}
test("N3: open, focus trap, close and background inert state are reversible",async()=>{
 const m=makeShell();await m.shell.initShell();assert.equal(m.shell.mobileViewport,true);
 m.shell.openSidebar();assert.equal(m.shell.sidebarOpen,true);assert.equal(m.focuses.at(-1),"close");
 vm.runInContext("syncMobileDrawer(true)",m.context);
 assert.equal(m.topbar.attrs.has("inert"),true);assert.equal(m.content.attrs.has("inert"),true);assert.equal(m.classes.has("crm-mobile-drawer-open"),true);
 m.document.activeElement=m.last;let blocked=false;
 m.shell.trapSidebarFocus({shiftKey:false,preventDefault(){blocked=true}});
 assert.equal(blocked,true);assert.equal(m.focuses.at(-1),"first");
 m.shell.closeSidebar();vm.runInContext("syncMobileDrawer(false)",m.context);
 assert.equal(m.focuses.at(-1),"trigger");
 assert.equal(m.content.attrs.has("inert"),false);assert.equal(m.topbar.attrs.has("inert"),false);
 assert.equal(m.classes.has("crm-mobile-drawer-open"),false);assert.equal(m.bodyClasses.has("crm-mobile-drawer-open"),false);
});
test("N2/N3: crossing desktop breakpoint closes drawer and restores scroll without stale focus",async()=>{
 const m=makeShell();await m.shell.initShell();m.shell.openSidebar();vm.runInContext("syncMobileDrawer(true)",m.context);
 m.query.matches=false;m.handlers.query();
 assert.equal(m.shell.mobileViewport,false);assert.equal(m.shell.sidebarOpen,false);assert.equal(m.classes.has("crm-mobile-drawer-open"),false);
 assert.equal(m.topbar.attrs.has("inert"),false);assert.equal(m.content.attrs.has("inert"),false);
 const count=m.focuses.length;m.shell.openSidebar();assert.equal(m.shell.sidebarOpen,false);assert.equal(m.focuses.length,count);
 m.query.matches=true;m.handlers.query();assert.equal(m.shell.mobileViewport,true);
 m.shell.openSidebar();m.handlers.pagehide();assert.equal(m.bodyClasses.has("crm-mobile-drawer-open"),false);
 m.handlers.pageshow();assert.equal(m.bodyClasses.has("crm-mobile-drawer-open"),true);
});
