"use strict";
const sanitizeHtml=require("sanitize-html");

const ALLOWED_TAGS=[
  "p","br","h1","h2","h3","h4","h5","h6","ul","ol","li","strong","b","em","i","u","s",
  "blockquote","pre","code","hr","a","img","table","thead","tbody","tfoot","tr","th","td","div","span"
];

function sanitizeProductHtml(value){
  const source=String(value||"").trim();
  if(!source)return "";
  if(source.length>100000)throw Object.assign(new Error("Product HTML description cannot exceed 100000 characters"),{status:400});
  return sanitizeHtml(source,{
    allowedTags:ALLOWED_TAGS,
    allowedAttributes:{
      a:["href","title","target","rel"],
      img:["src","alt","title","width","height"],
      th:["colspan","rowspan","scope"],
      td:["colspan","rowspan"]
    },
    allowedSchemes:["http","https","mailto"],
    allowedSchemesByTag:{img:["https"]},
    allowProtocolRelative:false,
    enforceHtmlBoundary:true,
    transformTags:{
      a(tagName,attribs){
        const next={...attribs};
        if(next.target==="_blank")next.rel="noopener noreferrer";
        return{tagName,attribs:next};
      }
    }
  });
}

function plainTextFromHtml(value){
  return sanitizeHtml(String(value||""),{allowedTags:[],allowedAttributes:{}})
    .replace(/\s+/g," ").trim().slice(0,20000);
}

module.exports={sanitizeProductHtml,plainTextFromHtml,ALLOWED_TAGS};
