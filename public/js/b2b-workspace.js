(function(){
 'use strict';
 const media=window.matchMedia('(max-width: 767.98px)');
 const prepared=new WeakSet();const touchedTables=new Set();let initialized=false,frame=0;
 function prepare(){
  frame=0;
  document.querySelectorAll('details.crm-progress-details').forEach(details=>{
   if(!prepared.has(details)){
    details.dataset.crmMobileOpen='0';
    details.open=!media.matches;
    details.addEventListener('toggle',()=>{if(media.matches)details.dataset.crmMobileOpen=details.open?'1':'0';});
    prepared.add(details);
   }
  });
  const tables=initialized?Array.from(touchedTables):Array.from(document.querySelectorAll('table.crm-mobile-records'));
  touchedTables.clear();initialized=true;
  tables.forEach(table=>{
   table.setAttribute('role','table');
   const headers=Array.from(table.querySelectorAll('thead tr:first-child th')).map(x=>x.textContent.trim());
   table.querySelectorAll('tbody > tr').forEach(row=>{
    row.setAttribute('role','row');const cells=Array.from(row.children).filter(x=>x.tagName==='TD');
    if(cells.some(cell=>cell.colSpan>1)){row.classList.add('crm-table-message');return;}
    cells.forEach((cell,index)=>{cell.setAttribute('role','cell');const label=headers[index]||'';if(cell.dataset.label!==label)cell.dataset.label=label;cell.querySelectorAll('input,select').forEach(input=>{if(!input.getAttribute('aria-label')&&!input.id)input.setAttribute('aria-label',label);});});
   });
  });
 }
 function schedule(mutations){
  for(const mutation of mutations){
   const origin=mutation.target.nodeType===1?mutation.target:mutation.target.parentElement;
   const table=origin?.closest?.('table.crm-mobile-records');
   if(table)touchedTables.add(table);
   for(const node of mutation.addedNodes||[]){
    if(node.nodeType!==1)continue;
    if(node.matches('table.crm-mobile-records'))touchedTables.add(node);
    node.querySelectorAll('table.crm-mobile-records').forEach(item=>touchedTables.add(item));
   }
  }
  if(!frame)frame=requestAnimationFrame(prepare);
}
 const observer=new MutationObserver(schedule);
 function start(){prepare();observer.observe(document.querySelector('.content-inner')||document.body,{subtree:true,childList:true,characterData:true});}
 function resize(){document.querySelectorAll('details.crm-progress-details').forEach(details=>{details.open=media.matches?details.dataset.crmMobileOpen==='1':true;});}
 media.addEventListener('change',resize);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.addEventListener('pagehide',()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);media.removeEventListener('change',resize);},{once:true});
})();
