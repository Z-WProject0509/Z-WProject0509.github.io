(async function(){
'use strict';const P=window.Portal,$=id=>document.getElementById(id);await P.ready;let revision=0;
const status=s=>({'Awaiting shipment':'待处理','To Ship':'待发货','To ship':'待发货',Shipped:'已发货',Completed:'已完成',Cancelled:'已取消',Canceled:'已取消',Unpaid:'未付款','Return/refund':'退货/退款',Pending:'处理中'}[s]||s||'—');
const card=(label,value)=>'<div class="card"><div class="k">'+label+'</div><div class="v">'+value+'</div></div>';
function table(data,pending,currency){
 if(!data.length)return '<div class="empty">'+(pending?'暂无待处理订单':'暂无最近订单')+'</div>';
 return '<div class="table-scroll"><table><thead><tr><th>下单时间</th><th>订单号</th><th>SKU</th><th>件数</th><th>销售金额</th><th>预计到账</th><th>状态</th></tr></thead><tbody>'+data.map(o=>'<tr><td>'+esc(o.d||o.date||'—')+'</td><td>'+esc(o.id||o.sn)+(o.sample?' <span class="sample-tag">样品</span>':'')+'</td><td>'+esc(o.sku||'—')+'</td><td>'+esc(o.q??o.qty??'—')+'</td><td>'+P.money(o.amt,currency)+'</td><td>'+P.money(o.inc,currency)+'</td><td class="'+(pending||/cancel|unpaid|fail|refund/i.test(o.st)?'red':'')+'">'+esc(pending?'待处理':status(o.st))+'</td></tr>').join('')+'</tbody></table></div>';
}
function fx(data){
 const rates=data.find(x=>x.data?.fx?.list)?.data.fx;
 if(!rates){$('orderFx').innerHTML='<div class="empty">当前店铺快照未提供汇率</div>';return;}
 $('orderFx').innerHTML='<div class="fx-tools"><label>币种 <select id="fxCurrency">'+rates.list.map(r=>'<option value="'+esc(r.code)+'">'+esc(r.label||r.code)+'</option>').join('')+'</select></label><label>金额 <input type="number" id="fxAmount" value="100" step="any"></label><strong id="fxValue"></strong></div><p class="aux">汇率更新时间：'+esc(rates.updatedAt||'—')+' · 折算仅供参考</p>';
 const calc=()=>{const item=rates.list.find(x=>x.code===$('fxCurrency').value),amount=Number($('fxAmount').value);$('fxValue').textContent='≈ '+P.money($('fxAmount').value===''?null:amount*(item?.cnyPer??(item?.code==='CNY'?1:NaN)),'CNY');};$('fxCurrency').onchange=calc;$('fxAmount').oninput=calc;calc();
}
async function load(){
 const rev=++revision,stores=P.selected();$('orderSummary').innerHTML='';$('orderStores').innerHTML='<div class="panel empty">正在读取所选店铺…</div>';$('orderFx').innerHTML='';
 const results=await Promise.all(stores.map(async store=>{const file=store.modules.orders?.file;if(!file)return {store,pending:true};try{const data=await P.json(file);if(!data.orders||typeof data.orders!=='object')throw Error('invalid');return {store,data};}catch(_){return {store,error:true};}}));if(rev!==revision)return;
 let orders=0,qty=0,wait=0,loaded=0;const amounts=new Map();
 results.forEach(({store,data})=>{if(!data)return;loaded++;orders+=data.orders.count||0;qty+=data.orders.totalQty||0;wait+=data.toshipCount??data.toship?.length??0;const c=data.currency||store.currency;if(data.orders.amountLocal!=null)amounts.set(c,(amounts.get(c)||0)+data.orders.amountLocal);});
 $('orderSummary').innerHTML=loaded?card('快照订单数',orders+' 单')+card('待处理 / 待发货',wait+' 单')+card('销售件数',qty+' 件')+card('快照销售额',[...amounts].map(([c,n])=>P.money(n,c)).join('<br>')||'—'):'';
 $('orderNotice').textContent='已载入 '+loaded+' / '+stores.length+' 家店铺。各店数据以其快照更新时间为准；未接入和加载失败的店铺不计入汇总。';
 $('orderStores').innerHTML=results.map(({store,data,pending})=>{
 const heading='<h2>'+esc(store.name)+' <span class="tag">'+esc(store.country)+' · '+esc(P.platformName(store.platformId))+'</span></h2>';
 if(!data)return '<section class="panel">'+heading+'<div class="empty">'+(pending?'订单数据待接入':'订单数据加载失败，请重试')+'</div></section>';
 const c=data.currency||store.currency,stats=data.orders||{};return '<section class="panel">'+heading+'<p class="aux">更新于 '+esc(data.generatedAt||'—')+'</p><div class="cards">'+card('订单数',(stats.count??'—')+' 单')+card('销售额',P.money(stats.amountLocal,c))+card('取消订单',((data.statusAgg?.Cancelled||0)+(data.statusAgg?.Canceled||0))+' 单')+card('待处理',(data.toshipCount??data.toship?.length??0)+' 单')+'</div><details '+(stores.length===1?'open':'')+'><summary>待处理订单（'+(data.toshipCount??data.toship?.length??0)+'）</summary>'+table(data.toship||[],true,c)+'</details><details '+(stores.length===1?'open':'')+'><summary>最近订单（'+(data.recent?.length||0)+'）</summary>'+table(data.recent||[],false,c)+'</details></section>';
 }).join('')||'<div class="panel empty">当前范围没有已注册店铺</div>';fx(results);
}
P.onChange(load);$('orderRefresh').onclick=()=>P.refresh(true);load();
})().catch(()=>{});
