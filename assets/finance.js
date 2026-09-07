(async function(){
'use strict';const P=window.Portal,$=id=>document.getElementById(id);await P.ready;let revision=0,rows=[],filter='all',limit=200,exportRows=[];
const checks={ok:'已到账',pending:'跟踪中',abnormal:'异常待核对',cancelled:'取消'};
const card=(name,value,note='')=>'<div class="card"><div class="k">'+name+'</div><div class="v">'+value+'</div><div class="m">'+note+'</div></div>';
const empty=text=>'<div class="empty">'+text+'</div>';
function sum(list,key){return list.reduce((a,o)=>a+(Number.isFinite(o[key])?o[key]:0),0);}
function display(){
 const visible=rows.filter(o=>filter==='all'||o.check===filter).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 exportRows=visible.map(o=>[o.countryCode,o.platform,o.storeName,o.currency,o.date,o.sn,o.sku,o.qty,o.amount,o.check==='ok'?o.payAmt:null,o.cost,o.check==='ok'?o.profit:null,o.status,o.payDate,checks[o.check]||o.check]);
 $('exportBtn').disabled=!visible.length;
 const counts=Object.fromEntries(Object.keys(checks).map(k=>[k,rows.filter(o=>o.check===k).length]));
 let html='<div class="cards">'+card('跟踪订单',rows.length+' 单')+Object.entries(checks).map(([k,name])=>card(name,counts[k]+' 单')).join('')+'</div>';
 if(!visible.length){$('checkBox').innerHTML=html+empty(rows.length?'当前状态没有匹配订单':'当前店铺暂无已接入账本');return;}
 html+='<div class="table-scroll"><table><thead><tr>'+['店铺','平台','下单日期','订单号','SKU','件数','销售额','实际到账','商品成本','到账减成本','状态','到账日期','核对'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+visible.slice(0,limit).map(o=>'<tr><td>'+esc(o.storeName)+'</td><td>'+esc(o.platform)+'</td><td>'+esc(o.date)+'</td><td>'+esc(o.sn)+'</td><td>'+esc(o.sku)+'</td><td>'+esc(o.qty)+'</td><td>'+P.money(o.amount,o.currency)+'</td><td>'+P.money(o.check==='ok'?o.payAmt:null,o.currency)+'</td><td title="'+esc(o.costIssue||'')+'">'+(o.cost==null?'待核成本':P.money(o.cost,o.currency))+'</td><td>'+P.money(o.check==='ok'?o.profit:null,o.currency)+'</td><td>'+esc(o.status)+'</td><td>'+esc(o.payDate||'—')+'</td><td>'+esc(checks[o.check]||o.check)+'</td></tr>').join('')+'</tbody></table></div>';
 if(visible.length>limit)html+='<button class="btn" id="financeMore">显示更多（'+Math.min(limit,visible.length)+' / '+visible.length+'）</button>';
 $('checkBox').innerHTML=html;if($('financeMore'))$('financeMore').onclick=()=>{limit+=200;display();};
}
function profit(){
 if(!rows.length){$('profitBox').innerHTML=empty('所选店铺暂无已接入账本，不能计算收益');return;}
 const currencies=[...new Set(rows.map(o=>o.currency))];
 $('profitBox').innerHTML=currencies.map(c=>{
 const all=rows.filter(o=>o.currency===c),released=all.filter(o=>o.check==='ok'),complete=released.filter(o=>o.cost!=null&&o.profit!=null),missing=released.length-complete.length;
 return '<h3>'+esc(c)+' · 到账与商品成本</h3><div class="cards">'+card('有效订单',all.filter(o=>o.check!=='cancelled').length+' 单')+card('未到账跟踪',all.filter(o=>['pending','abnormal'].includes(o.check)).length+' 单')+card('已到账金额',P.money(sum(released,'payAmt'),c))+card('已录全商品成本',P.money(sum(complete,'cost'),c))+card('到账减商品成本',P.money(sum(complete,'profit'),c),missing?missing+' 笔已到账单成本不完整，未计入收益':'仅汇总已到账且成本完整的订单')+'</div>';
 }).join('')+'<p class="section-note">广告支出单列，未分摊到订单；本页收益不代表完整净利润。未到账订单持续跟踪。</p>';
}
async function load(){
 const rev=++revision,stores=P.selected();rows=[];exportRows=[];limit=200;display();for(const id of ['profitBox','incomeOverview','adsVsIncome'])$(id).innerHTML=empty('正在读取当前业务范围…');
 const files=[...new Set(stores.flatMap(s=>['finance','income','ads'].map(k=>s.modules[k]?.file)).filter(Boolean))];
 const result=new Map(await Promise.all(files.map(async file=>{try{return [file,{data:await P.json(file)}];}catch(_){return [file,{error:true}];}})));if(rev!==revision)return;
 let unmatched=0;const ids=new Set(stores.map(s=>s.id)),loaded=[],pending=[],failed=[];
 for(const s of stores){const cfg=s.modules.finance;if(!cfg)pending.push(s.name+' · '+P.platformName(s.platformId));else if(result.get(cfg.file)?.error)failed.push(s.name);else loaded.push(s);}
 for(const file of new Set(loaded.map(s=>s.modules.finance.file))){const data=result.get(file).data;
 if(!['released','pending','abnormal','cancelled'].some(k=>Array.isArray(data[k]))){failed.push(file);continue;}
 const parsed=P.model.financeRows(P.registry,data,file);rows.push(...parsed.rows.filter(o=>ids.has(o.storeKey)));unmatched+=parsed.unmatched;}
 profit();display();
 const notice=[pending.length?'财务待接入：'+pending.join('、'):'',failed.length?'加载失败：'+failed.join('、'):'',unmatched?unmatched+' 条记录无法唯一识别店铺，未计入汇总':''].filter(Boolean).join('。');
 if(notice)$('profitBox').insertAdjacentHTML('afterbegin','<p class="scope-warning">'+esc(notice)+'</p>');
 $('incomeOverview').innerHTML=stores.map(s=>{const cfg=s.modules.income,item=cfg&&result.get(cfg.file);const title=esc(s.name)+' · '+esc(P.platformName(s.platformId));if(!cfg)return '<div class="source-row"><b>'+title+'</b><span>放款流水待接入</span></div>';if(item.error)return '<div class="source-row"><b>'+title+'</b><span class="red">流水加载失败</span></div>';const data=item.data;
 return '<div class="source-row"><b>'+title+'</b><span>流水实收 '+P.money(sum(data.released||[],'amt'),s.currency)+' · 待放款 '+P.money(sum(data.pending||[],'amt'),s.currency)+'</span><small>采集于 '+esc(data.generatedAt||'—')+'</small></div>';}).join('')||empty('当前范围没有店铺');
 $('adsVsIncome').innerHTML=stores.map(s=>{const cfg=s.modules.ads,item=cfg&&result.get(cfg.file),y=item?.data?.periods?.yesterday;return '<div class="source-row"><b>'+esc(s.name)+' · '+esc(P.platformName(s.platformId))+'</b><span>'+(item?.error?'广告加载失败':!cfg?'广告数据待接入':!y?'暂无昨日广告数据':'昨日支出 '+P.money(y[cfg.costField],s.currency)+' · 广告销售 '+P.money(y[cfg.salesField],s.currency))+'</span></div>';}).join('')||empty('暂无广告数据');
 $('footTime').textContent=[...new Set(loaded.map(s=>result.get(s.modules.finance.file)?.data?.summary?.generatedAt).filter(Boolean))].join(' / ')||'暂无账本';
}
$('checkFilt').onclick=e=>{const b=e.target.closest('button[data-c]');if(!b)return;filter=b.dataset.c;limit=200;$('checkFilt').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));display();};
$('exportBtn').onclick=()=>{if(exportRows.length)exportCSV('财务明细_'+todayLocal()+'.csv',['国家','平台','店铺','币种','下单时间','订单号','SKU','件数','销售金额','真实到账','成本','到账减成本','状态','到账时间','核对'],exportRows);};
P.onChange(load);load();
})().catch(()=>{});
