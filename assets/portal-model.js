(function(root){
'use strict';
function platform(v){const s=String(v||'').toLowerCase();return ({tk:'tiktok','tiktok shop':'tiktok',tiktok:'tiktok',shopee:'shopee',lazada:'lazada'})[s]||s;}
function catalog(raw){
 if(raw.schemaVersion!==2||!Array.isArray(raw.countries)||!Array.isArray(raw.platforms)||!Array.isArray(raw.stores))throw Error('店铺配置格式无效');
 const stores=raw.stores.filter(s=>s.enabled!==false),ids=new Set();
 for(const s of stores){if(!s.id||ids.has(s.id)||!raw.countries.some(c=>c.code===s.countryCode)||!raw.platforms.some(p=>p.id===s.platformId))throw Error('店铺身份或归属配置有误');ids.add(s.id);}
 return {...raw,stores};
}
function selection(reg,requested={}){
 const country=reg.countries.some(c=>c.code===requested.country)?requested.country:reg.countries[0]?.code;
 const eligible=reg.stores.filter(s=>s.countryCode===country);
 const p=requested.platform==='all'||eligible.some(s=>s.platformId===requested.platform)?requested.platform:'all';
 const store=eligible.some(s=>s.id===requested.store&&(p==='all'||s.platformId===p))?requested.store:'all';
 return {country,platform:p||'all',store};
}
function selected(reg,state){return reg.stores.filter(s=>s.countryCode===state.country&&(state.platform==='all'||s.platformId===state.platform)&&(state.store==='all'||s.id===state.store));}
function resolve(reg,row,file,module){
 let candidates=reg.stores.filter(s=>s.modules?.[module]?.file===file);
 const country=row.countryCode||row.country,plat=row.platformId||row.platform;
 if(country)candidates=candidates.filter(s=>s.countryCode===country||s.country===country);
 if(plat)candidates=candidates.filter(s=>s.platformId===platform(plat));
 const id=row.storeKey||row.shopKey;
 if(id)candidates=candidates.filter(s=>s.id===String(id));
 else if(row.storeId!=null)candidates=candidates.filter(s=>String(s.storeId)===String(row.storeId)||s.id===String(row.storeId));
 else if(row.store||row.storeName){const name=row.store||row.storeName;candidates=candidates.filter(s=>s.id===name||s.name===name||(s.aliases||[]).includes(name));}
 else {
  // 仅对显式绑定的旧账本进行兼容；不能将无身份记录分给同平台所有店铺。
  const allBindings=reg.stores.filter(s=>s.modules?.[module]?.file===file);
  candidates=candidates.filter(s=>s.modules[module].legacyPlatform?platform(s.modules[module].legacyPlatform)===platform(plat):allBindings.length===1);
 }
 return candidates.length===1?candidates[0]:null;
}
function financeRows(reg,data,file){
 const map=new Map();let unmatched=0;
 for(const kind of ['released','pending','abnormal','cancelled'])for(const row of data[kind]||[]){const store=resolve(reg,row,file,'finance');if(!store){unmatched++;continue;}const o={...row,check:row.check||({released:'ok'})[kind]||kind,storeKey:store.id,storeName:store.name,countryCode:store.countryCode,platform:reg.platforms.find(p=>p.id===store.platformId).name,currency:row.currency||store.currency};map.set(store.id+':'+String(o.sn),o);}
 return {rows:[...map.values()],unmatched};
}
const api={platform,catalog,selection,selected,resolve,financeRows};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortalModel=api;
})(typeof window==='undefined'?globalThis:window);
