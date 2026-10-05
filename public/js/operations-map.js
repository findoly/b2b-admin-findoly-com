/* Map instances stay outside Alpine reactivity; database rows remain ordinary data. */
let b2bGooglePromise;
function loadB2bGoogle(key){
 if(window.google?.maps?.importLibrary)return Promise.resolve();
 if(b2bGooglePromise)return b2bGooglePromise;
 b2bGooglePromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let timer;
  const cleanup=()=>{clearTimeout(timer);delete window.b2bMapsLoaded;};
  window.b2bMapsLoaded=()=>{cleanup();resolve();};
  window.gm_authFailure=()=>{cleanup();window.dispatchEvent(new CustomEvent('b2b:map-error'));reject(new Error('Google Maps could not authenticate. Check the map key and website restrictions.'));};
  script.nonce=document.querySelector('script[nonce]')?.nonce||'';
  script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key,v:'quarterly',loading:'async',callback:'b2bMapsLoaded',libraries:'maps,marker'});script.async=true;
  script.onerror=()=>{cleanup();reject(new Error('Google Maps could not load. You can still use the location list.'));};
  timer=setTimeout(()=>{cleanup();reject(new Error('Google Maps loading timed out. Refresh to retry; the list is still available.'));},15000);
  document.head.appendChild(script);
 });
 return b2bGooglePromise;
}
function operationsMapPage(){
 const state={map:null,markers:[],preview:null,idle:null,abort:null,alive:true,info:null};
 return{
 config:{types:[]},rows:[],types:[],search:'',filter:'all',view:'map',pages:{},totals:{},error:'',mapError:'',loading:false,busy:false,selected:null,candidates:[],candidateIndex:0,token:'',lookupMessage:'',source:'manual',latitude:'',longitude:'',request:0,recordId:'',recordType:'',
 async load(){
  this.recordId=new URLSearchParams(location.search).get('recordId')||'';this.recordType=new URLSearchParams(location.search).get('type')||'';
  try{this.config=(await apiFetch('/api/map/config')).data;this.types=this.config.types.map(x=>x.type);if(this.types.includes(this.recordType))this.types=[this.recordType];await this.loadRows();await this.startMap();}catch(e){this.error=e.message;}
 },
 async startMap(){
  if(!this.config.browserKey||!this.config.mapId){this.mapError='The Google map is not configured yet. Saved addresses and manual coordinates remain available below.';this.view='list';return;}
  try{await loadB2bGoogle(this.config.browserKey);if(!state.alive)return;const{Map}=await google.maps.importLibrary('maps');await google.maps.importLibrary('marker');state.map=new Map(document.getElementById('b2b-map'),{center:{lat:20.5937,lng:78.9629},zoom:5,mapId:this.config.mapId,mapTypeId:'roadmap',streetViewControl:false,fullscreenControl:true,gestureHandling:'cooperative'});state.info=new google.maps.InfoWindow();state.idle=state.map.addListener('idle',()=>this.drawMarkers(false));this.drawMarkers(true);}catch(e){this.mapError=e.message;this.view='list';}
 },
 get visibleRows(){return this.rows.filter(x=>this.types.includes(x.entityType)&&(this.filter!=='missing'||!x.location));},
 get missingCount(){return this.rows.filter(x=>!x.location).length;},
 get resultCount(){return Object.values(this.totals).reduce((a,b)=>a+b,0);},
 get hasMore(){return this.types.some(type=>this.pages[type]?.page<this.pages[type]?.pages);},
 typeName(type){return{customer:'Customers',warehouse:'Warehouses',supplier:'Suppliers'}[type]||type;},
 toggleType(type){this.types=this.types.includes(type)?this.types.filter(x=>x!==type):[...this.types,type];this.recordId='';return this.loadRows();},
 async loadRows(more=false){
  if(more&&this.loading)return;const version=++this.request;state.abort?.abort();state.abort=new AbortController();this.loading=true;this.error='';
  if(!more){this.rows=[];this.pages={};this.totals={};this.selected=null;this.clearPreview();}
  const types=this.types.filter(type=>!more||this.pages[type]?.page<this.pages[type]?.pages);
  const results=await Promise.allSettled(types.map(async type=>({type,data:(await apiFetch('/api/map/locations?'+new URLSearchParams({type,search:this.search,page:more?(this.pages[type]?.page||0)+1:1,recordId:this.recordId&&type===this.recordType?this.recordId:''}),{signal:state.abort.signal})).data})));
  if(version!==this.request||!state.alive)return;
  for(const result of results){if(result.status==='fulfilled'){const{type,data}=result.value;this.rows.push(...data.items);this.pages[type]={page:data.page,pages:data.pages};this.totals[type]=data.total;}else if(result.reason?.name!=='AbortError')this.error=result.reason?.message||'Some locations could not load.';}
  this.loading=false;this.drawMarkers(!more);
 },
 clearRecordFilter(){this.recordId='';return this.loadRows();},
 changeFilter(){this.drawMarkers(true);},
 select(row){this.selected=row;this.candidates=[];this.token='';this.lookupMessage='';this.source='manual';this.latitude=row.location?.source==='manual'?String(row.location.latitude):'';this.longitude=row.location?.source==='manual'?String(row.location.longitude):'';this.clearPreview();if(row.location&&state.map){state.map.panTo({lat:row.location.latitude,lng:row.location.longitude});state.map.setZoom(Math.max(state.map.getZoom(),14));}this.$nextTick(()=>document.getElementById('map-location-detail')?.scrollIntoView({behavior:'smooth',block:'nearest'}));},
 rowClass(row){return this.selected?.key===row.key?'is-selected':'';},
 googleLink(row){const query=row.location?row.location.latitude+','+row.location.longitude:row.address;return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);},
 clearPreview(){if(state.preview){state.preview.map=null;state.preview=null;}},
 async geocode(){
  if(!this.selected||this.busy)return;this.busy=true;this.error='';const selectedKey=this.selected.key;
  try{const result=(await apiFetch('/api/map/geocode',{method:'POST',body:JSON.stringify(this.selected)})).data;if(this.selected?.key!==selectedKey)return;this.candidates=result.candidates;this.token=result.token;this.lookupMessage=result.message;this.source='google';this.candidateIndex=0;this.previewCandidate();}catch(e){this.error=e.message;}finally{this.busy=false;}
 },
 candidateLabel(candidate){return candidate.label+(candidate.needsReview?' · Check approximate match':'');},
 previewCandidate(){this.clearPreview();const point=this.candidates[Number(this.candidateIndex)];if(!point||!state.map)return;const content=document.createElement('span');content.className='crm-map-pin crm-map-pin-preview';content.textContent='?';state.preview=new google.maps.marker.AdvancedMarkerElement({map:state.map,position:{lat:point.latitude,lng:point.longitude},content,title:'Suggested location — review before saving'});state.map.panTo({lat:point.latitude,lng:point.longitude});state.map.setZoom(16);this.view='map';},
 candidateLink(){const p=this.candidates[Number(this.candidateIndex)];return p?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.latitude+','+p.longitude):'#';},
 useManual(){this.source='manual';this.candidates=[];this.token='';this.latitude='';this.longitude='';this.clearPreview();},
 async savePin(){
  if(!this.selected||this.busy)return;this.busy=true;this.error='';const key=this.selected.key;
  try{const body={entityType:this.selected.entityType,entityId:this.selected.entityId,addressSlot:this.selected.addressSlot,addressHash:this.selected.addressHash,source:this.source,...(this.source==='google'?{token:this.token,candidateIndex:Number(this.candidateIndex)}:{latitude:this.latitude,longitude:this.longitude})};const result=(await apiFetch('/api/map/location',{method:'PUT',body:JSON.stringify(body)})).data;const row=this.rows.find(x=>x.key===key);if(row)row.location=result.location;if(this.selected?.key===key){this.selected=row||this.selected;this.clearPreview();this.candidates=[];this.token='';this.lookupMessage='Location saved.';}this.drawMarkers(false);showCrmToast('Location saved');}catch(e){this.error=e.message;}finally{this.busy=false;}
 },
 drawMarkers(fit=false){
  if(!state.map)return;for(const marker of state.markers){google.maps.event.clearInstanceListeners(marker);marker.map=null;}state.markers=[];
  const rows=this.visibleRows.filter(x=>x.location);if(!rows.length)return;
  if(fit){const bounds=new google.maps.LatLngBounds();rows.forEach(x=>bounds.extend({lat:x.location.latitude,lng:x.location.longitude}));state.map.fitBounds(bounds,50);if(rows.length===1)state.map.setZoom(14);}
  const zoom=state.map.getZoom()||5,scale=256*Math.pow(2,zoom),groups=new Map();
  for(const row of rows){const lat=Math.max(-85,Math.min(85,row.location.latitude))*Math.PI/180;const x=(row.location.longitude+180)/360*scale,y=(.5-Math.log((1+Math.sin(lat))/(1-Math.sin(lat)))/(4*Math.PI))*scale;const key=Math.floor(x/60)+':'+Math.floor(y/60);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  for(const group of groups.values()){
   const row=group[0],cluster=group.length>1,content=document.createElement('span');content.className='crm-map-pin '+(cluster?'crm-map-pin-cluster':'crm-map-pin-'+row.entityType);content.textContent=cluster?String(group.length):{customer:'C',warehouse:'W',supplier:'S'}[row.entityType];
   const marker=new google.maps.marker.AdvancedMarkerElement({map:state.map,position:{lat:row.location.latitude,lng:row.location.longitude},content,title:cluster?group.length+' locations':row.name,gmpClickable:true});
   marker.addListener('click',()=>{
    if(cluster&&zoom<19){const bounds=new google.maps.LatLngBounds();group.forEach(x=>bounds.extend({lat:x.location.latitude,lng:x.location.longitude}));state.map.fitBounds(bounds,60);if(state.map.getZoom()<=zoom)state.map.setZoom(zoom+2);}
    else if(cluster){const box=document.createElement('div');box.className='crm-map-cluster-list';for(const member of group){const button=document.createElement('button');button.className='btn btn-light d-block mb-2';button.textContent=member.name;button.onclick=()=>{this.select(member);state.info.close();};box.appendChild(button);}state.info.setContent(box);state.info.open({map:state.map,anchor:marker});}
    else{this.select(row);const box=document.createElement('div'),strong=document.createElement('strong'),address=document.createElement('p'),link=document.createElement('a');strong.textContent=row.name;address.textContent=row.address;link.href=row.url;link.textContent='Open record';box.append(strong,address,link);state.info.setContent(box);state.info.open({map:state.map,anchor:marker});}
   });state.markers.push(marker);
  }
 },
 destroy(){state.alive=false;this.request++;state.abort?.abort();state.idle?.remove();state.info?.close();this.clearPreview();for(const marker of state.markers){google.maps.event.clearInstanceListeners(marker);marker.map=null;}state.markers=[];if(state.map)google.maps.event.clearInstanceListeners(state.map);state.map=null;}
 };
}
