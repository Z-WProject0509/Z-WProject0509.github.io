(function(){
'use strict';
const M=window.PortalModel,labels={orders:'订单发货',sales:'店铺数据',finance:'财务'},listeners=[];
let registry,state,snapshot,refreshing;const module=document.body.dataset.module;
const P=window.Portal={model:M,get batchId(){return snapshot?.batchId;},get registry(){return registry;},get state(){return state;},selected:()=>M.selected(registry,state),store:id=>registry.stores.find(s=>s.id===id),onChange:fn=>listeners.push(fn),platformName:id=>registry.platforms.find(p=>p.id===id)?.name||id,money:(n,c)=>n==null||!Number.isFinite(Number(n))?'—':({IDR:'Rp ',THB:'฿ ',CNY:'¥ '}[c]||c+' ')+Number(n).toLocaleString('en-US',{maximumFractionDigits:2})};
P.rawJson=async function(file){if(!file||/^(?:[a-z]+:|\/)|(^|\/)\.\.(\/|$)|\\/i.test(file))throw Error('数据文件路径无效');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(file+'?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}};
P.json=async function(file){if(!snapshot)throw Error('完整批次未载入');if(file==='stores.json')return snapshot.registry;if(!(file in snapshot.data))throw Error('当前批次未接入此数据源');return snapshot.data[file];};
function validate(batch){if(batch.schemaVersion!==1||!batch.batchId||!batch.registry||!batch.data)throw Error('完整批次格式无效');const reg=M.catalog(batch.registry);for(const s of reg.stores)for(const cfg of Object.values(s.modules||{}))if(cfg.file&&!(cfg.file in batch.data))throw Error('批次缺少已接入店铺数据');return reg;}
function badge(text){const el=document.getElementById('syncPill');el.textContent=text;el.title=snapshot?'批次 '+snapshot.batchId+' · '+snapshot.publishedAt:'';}
function showBatch(){badge((snapshot.mode==='imported'?'上传包快照':'统一批次')+' · '+new Date(snapshot.publishedAt).toLocaleString('zh-CN'));}
P.refresh=function(force=false){if(refreshing)return refreshing;refreshing=(async()=>{try{
 const next=await P.rawJson('dataset.json'),reg=validate(next);
 if(next.batchId!==snapshot.batchId||force===true){snapshot=next;registry=reg;state=M.selection(registry,state);paint();listeners.forEach(fn=>fn(state));}
 showBatch();
 try{const attempt=await P.rawJson('sync_status.json');if(attempt.status==='failed'&&attempt.finishedAt>snapshot.publishedAt)badge('本轮失败 · 保留上批数据');else if(attempt.status==='running'&&attempt.startedAt>snapshot.publishedAt)badge('正在统一同步 · 当前为上批数据');}catch(_){}
 }catch(e){badge('刷新失败 · 保留当前完整批次');}finally{refreshing=null;}})();return refreshing;};
function paint(){
 const country=registry.countries.find(c=>c.code===state.country),ss=P.selected();
 const options=(list,key,label,value)=>list.map(x=>'<option value="'+esc(x[key])+'"'+(x[key]===value?' selected':'')+'>'+esc(x[label])+'</option>').join('');
 document.getElementById('scopeCountry').innerHTML=options(registry.countries,'code','name',state.country);
 const platforms=registry.platforms.filter(p=>registry.stores.some(s=>s.countryCode===state.country&&s.platformId===p.id));
 document.getElementById('scopePlatform').innerHTML=options([{id:'all',name:'全部平台'},...platforms],'id','name',state.platform);
 const stores=registry.stores.filter(s=>s.countryCode===state.country&&(state.platform==='all'||s.platformId===state.platform)).map(s=>({id:s.id,name:s.name+(state.platform==='all'?' · '+P.platformName(s.platformId):'')}));
 document.getElementById('scopeStore').innerHTML=options([{id:'all',name:'全部店铺'},...stores],'id','name',state.store);
 document.getElementById('scopePath').textContent=country.name+' / '+(state.platform==='all'?'全部平台':P.platformName(state.platform))+' / '+(state.store==='all'?'全部店铺':P.store(state.store).name);
 const ready=ss.filter(s=>s.modules?.[module]);
 document.getElementById('scopeNote').textContent='当前 '+ss.length+' 家店铺 · '+ready.length+' 家已配置'+labels[module]+'数据源'+(ss.length>ready.length?' · '+(ss.length-ready.length)+' 家待接入':'');
 try{localStorage.setItem('ecommerce.scope.v2',JSON.stringify(state));}catch(_){}
 const params=new URLSearchParams(state);try{history.replaceState(null,'','?'+params);}catch(_){}
 document.querySelectorAll('.areanav a').forEach(a=>{a.href=a.getAttribute('href').split('?')[0]+'?'+params;});
}
P.set=function(next){state=M.selection(registry,{...state,...next});paint();listeners.forEach(fn=>fn(state));};
P.ready=(async()=>{
 snapshot=await P.rawJson('dataset.json');registry=validate(snapshot);
 let saved={};try{saved=JSON.parse(localStorage.getItem('ecommerce.scope.v2')||'{}');}catch(_){}
 const query=new URLSearchParams(location.search);for(const k of ['country','platform','store'])if(query.has(k))saved[k]=query.get(k);
 state=M.selection(registry,saved);paint();showBatch();setInterval(()=>P.refresh(),60000);
 for(const [id,key] of [['scopeCountry','country'],['scopePlatform','platform'],['scopeStore','store']])document.getElementById(id).addEventListener('change',e=>P.set({[key]:e.target.value,...(key==='country'?{platform:'all',store:'all'}:key==='platform'?{store:'all'}:{})}));
 return P;
})().catch(e=>{document.getElementById('scopeNote').textContent='配置加载失败，请刷新重试。';throw e;});
})();
