(function () {
  'use strict';
  const D = window.StoreTrend, $ = id => document.getElementById(id);
  const COLORS = ['#3b6cf6','#059669','#d97706','#db2777','#7c3aed','#0891b2'];
  const names = { amount:'销售额',orders:'订单数',qty:'销售件数' };
  let rows = [], shops = [], chosen = new Set(), axis = [], values = Object.create(null);
  let metric = 'amount', gran = 'day', range = null, activePreset = '30d', view = {start:0,end:0};
  let hover = -1, drag = null, initial = true, loading = false, skipped = 0;
  const canvas = $('chart'), ctx = canvas.getContext('2d');
  let W = 0, H = 360, plot = null;
  function selected() { return shops.filter(s => chosen.has(s)); }
  function currency() {
    const codes = new Set(rows.filter(r => chosen.has(r.store) && range && r.date >= range.from && r.date <= range.to).map(r => r.currency));
    return codes.size > 1 ? null : [...codes][0] || 'IDR';
  }
  function money(n) { return n == null ? '—' : (currency() === 'IDR' ? 'Rp ' : (currency() || '') + ' ') + Math.round(n).toLocaleString('en-US'); }
  function format(v, key = metric) { return v == null ? '未采集' : key === 'amount' ? money(v) : Math.round(v).toLocaleString('zh-CN') + (key === 'orders' ? ' 单' : ' 件'); }
  function color(s) { return COLORS[shops.indexOf(s) % COLORS.length]; }
  function message(text, error) { $('chartStatus').textContent = text; $('chartStatus').classList.toggle('error', !!error); }
  function visibleDates() { return axis.length ? { from:axis[view.start].start,to:axis[view.end].end } : range; }
  function syncInputs() { const v = visibleDates(); if (v) { $('fromD').value=v.from; $('toD').value=v.to; } }
  function chips() {
    $('shopGrp').innerHTML = '<span class="gl">店铺</span>' + shops.map(s => '<button data-s="' + esc(s) + '" aria-pressed="' + chosen.has(s) + '" class="' + (chosen.has(s)?'on':'') + '" style="--shop-color:' + color(s) + '">' + esc(s) + '</button>').join('');
    $('legend').innerHTML = shops.map(s => '<button class="lg ' + (chosen.has(s)?'':'off') + '" data-s="' + esc(s) + '" aria-pressed="' + chosen.has(s) + '"><i style="background:' + color(s) + '"></i>' + esc(s) + '</button>').join('');
  }
  function rangeButtons() { document.querySelectorAll('#rangeGrp button').forEach(b => { b.classList.toggle('on', b.dataset.r === activePreset); b.setAttribute('aria-pressed',b.dataset.r === activePreset); }); }
  function rebuild() {
    axis = D.buckets(range.from,range.to,gran);
    values = D.aggregate(rows,shops,axis);
    view = { start:0,end:axis.length-1 }; hover=-1;
    syncInputs(); rangeButtons(); render();
  }
  function applyPreset(name) {
    if (!rows.length) return;
    activePreset=name;
    range=D.preset(name,todayLocal(),rows[0].date,rows[rows.length-1].date);
    rebuild();
  }
  function useDates() {
    const from=$('fromD').value,to=$('toD').value;
    try { D.buckets(from,to,gran); }
    catch (e) { message(e.message,true); return; }
    range={from,to};activePreset='';rebuild();
  }
  async function loadData() {
    if (loading) return; loading=true;
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
    try {
      const res=await fetch('sales_summary.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      if (!Array.isArray(data.daily)) throw new Error('日报数据格式无效');
      const clean=D.normalize(data.daily);
      if (data.daily.length && !clean.rows.length) throw new Error('日报中没有有效日期和店铺');
      const previous=visibleDates(); const oldShops=new Set(shops);
      rows=clean.rows;skipped=clean.skipped;
      shops=[...new Set(rows.map(r=>r.store))];
      if (initial) chosen=new Set(shops);
      else { chosen=new Set([...chosen].filter(s=>shops.includes(s))); shops.filter(s=>!oldShops.has(s)).forEach(s=>chosen.add(s)); if (!chosen.size && shops.length) chosen.add(shops[0]); }
      chips(); $('footTime').textContent=data.updatedAt || '未提供更新时间';
      if (!rows.length) {
        axis=[];range=null;plot=null;view={start:0,end:0};hover=-1;
        $('sumStrip').innerHTML='';$('rangeTag').textContent='';$('pointDetail').textContent='暂无可用数据';draw();
        message('暂无店铺日报，请先同步店铺数据。',false);return;
      }
      if (initial || activePreset) { applyPreset(activePreset || '30d'); }
      else { range=previous || range; rebuild(); }
      initial=false;
    } catch (e) { message((rows.length?'刷新失败，保留上次图表。':'加载失败。')+'请启动本地中控台后重试。'+(e.name==='AbortError'?'请求超时。':''),true); }
    finally { clearTimeout(timer);loading=false; }
  }
  function sumFor(s,key) {
    let total=null,count=0,expected=0;
    for(let i=view.start;i<=view.end;i++){ const p=values[s][i];if(p[key]!=null)total=(total||0)+p[key];count+=p.coverage[key];expected+=p.expected; }
    return { total,count,expected };
  }
  function renderSummary() {
    if (!axis.length)return;
    const ss=selected(),dates=visibleDates();
    const cards=['amount','orders','qty'].map(key=>{
      let total=null,covered=0,expected=0;
      ss.forEach(s=>{const a=sumFor(s,key);if(a.total!=null)total=(total||0)+a.total;covered+=a.count;expected+=a.expected;});
      return '<div class="tot-card"><div class="tk">'+names[key]+'合计</div><div class="tv">'+(key==='amount'&&!currency()?'多币种不可相加':format(total,key))+'</div><div class="ts">'+(covered<expected?'仅汇总已采集数据':'所选店铺 · 当前区间')+'</div></div>';
    });
    ss.forEach(s=>{const a=sumFor(s,metric);cards.push('<div class="tot-card shop-total" style="--shop-color:'+color(s)+'"><div class="tk">'+esc(s)+'</div><div class="tv">'+(metric==='amount'&&!currency()?'请选择相同币种':format(a.total))+'</div><div class="ts">已采集 '+a.count+' / '+a.expected+' 天</div></div>');});
    $('sumStrip').innerHTML=cards.join('');
    $('rangeTag').textContent=dates.from+' 至 '+dates.to+' · 按'+{day:'日',week:'周',month:'月'}[gran]+'统计 · '+ss.length+' 家店铺';
    $('chartTitle').textContent=names[metric]+'趋势';
    $('chartUnit').textContent=metric==='amount'?'单位：'+(currency()||'多币种'):'单位：'+(metric==='orders'?'单':'件');
    const missing=ss.some(s=>{const a=sumFor(s,metric);return a.count<a.expected;});
    message((missing?'部分日期未采集：缺失日期留空，周／月数值仅汇总已采集天数。':'数据已覆盖当前区间。')+(dates.to>=todayLocal()?' 今日数据尚未结束。':'')+(skipped?' 已跳过 '+skipped+' 条无效记录。':''),false);
    canvas.setAttribute('aria-label',names[metric]+'折线图，'+$('rangeTag').textContent+'。使用左右方向键查看各点数值。');
  }
  function resize() {
    const width=Math.max(220,$('chartbox').clientWidth-2);
    W=width;H=width<520?300:360;
    const dpr=window.devicePixelRatio||1;
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);canvas.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);draw();
  }
  function compact(n) { const a=Math.abs(n);return a>=1e6?(n/1e6).toFixed(1)+'M':a>=1e3?(n/1e3).toFixed(1)+'k':String(Math.round(n)); }
  function draw() {
    if(!ctx||!W)return;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);plot=null;
    const showText=t=>{ctx.fillStyle='#5c6b82';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(t,W/2,H/2);};
    if(!axis.length){showText('等待店铺日报数据');return;}
    if(metric==='amount'&&!currency()){showText('请选择相同币种的店铺进行比较');return;}
    const all=[];selected().forEach(s=>{for(let i=view.start;i<=view.end;i++)if(values[s][i][metric]!=null)all.push(values[s][i][metric]);});
    if(!all.length){showText('该区间暂无已采集数据');return;}
    let low=Math.min(0,...all),high=Math.max(0,...all);if(high===low)high=low+1;
    const raw=(high-low)/4,power=Math.pow(10,Math.floor(Math.log10(raw))),unit=raw/power;
    let step=(unit<=1?1:unit<=2?2:unit<=5?5:10)*power;
    if(metric!=='amount')step=Math.max(1,step);
    low=Math.floor(low/step)*step;high=Math.ceil(high/step)*step;
    const left=W<520?52:66,right=22,top=30,bottom=38,n=view.end-view.start+1;
    const X=i=>n===1?(left+W-right)/2:left+(i-view.start)/(n-1)*(W-left-right);
    const Y=v=>top+(high-v)/(high-low)*(H-top-bottom);
    plot={left,right,top,bottom,X,Y};
    ctx.lineWidth=1;ctx.font='12px sans-serif';
    for(let v=low;v<=high+step*.01;v+=step){const y=Y(v);ctx.strokeStyle='#e9eef5';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(W-right,y);ctx.stroke();ctx.fillStyle='#66758c';ctx.textAlign='right';ctx.fillText(compact(v),left-9,y+4);}
    ctx.textAlign='center';
    const stride=Math.max(1,Math.ceil(n/Math.max(2,Math.floor((W-left-right)/85))));
    for(let i=view.start;i<=view.end;i+=stride)ctx.fillText(axis[i].label,X(i),H-12);
    const showLabels=$('showValues').checked&&n<=14;
    $('labelHint').textContent=$('showValues').checked&&n>14?'放大到14个点以内可显示数值':'';
    selected().forEach(s=>{
      const c=color(s);ctx.strokeStyle=c;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
      // 缺失日断线，避免把未采集误画成0；单点也绘制圆点。
      ctx.beginPath();let started=false;
      for(let i=view.start;i<=view.end;i++){const v=values[s][i][metric];if(v==null){started=false;continue;}if(!started){ctx.moveTo(X(i),Y(v));started=true;}else ctx.lineTo(X(i),Y(v));}
      ctx.stroke();
      for(let i=view.start;i<=view.end;i++){
        const point=values[s][i],v=point[metric];if(v==null)continue;
        const isolated=(i===view.start||values[s][i-1][metric]==null)&&(i===view.end||values[s][i+1][metric]==null);
        if(n<=45||i===hover||isolated){ctx.beginPath();ctx.arc(X(i),Y(v),i===hover?5:3.5,0,Math.PI*2);ctx.fillStyle=point.coverage[metric]<point.expected?'#fff':c;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();}
        if(showLabels){ctx.font='12px sans-serif';ctx.textAlign=i===view.start?'left':i===view.end?'right':'center';ctx.fillStyle=c;ctx.fillText(compact(v),X(i),Y(v)-11);}
      }
    });
    if(hover>=view.start&&hover<=view.end){ctx.strokeStyle='#a3afc0';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(X(hover),top);ctx.lineTo(X(hover),H-bottom);ctx.stroke();ctx.setLineDash([]);}
  }
  function detail() {
    if(!axis.length)return;
    const i=hover>=view.start&&hover<=view.end?hover:view.end,p=axis[i];
    $('pointDetail').innerHTML='<strong>'+p.start+(p.end!==p.start?' 至 '+p.end:'')+'</strong>'+selected().map(s=>{
      const v=values[s][i];return '<span><i style="background:'+color(s)+'"></i>'+esc(s)+' <b>'+(metric==='amount'&&!currency()?'币种不同':format(v[metric]))+'</b>'+(v[metric]!=null&&v.coverage[metric]<v.expected?' <small>仅'+v.coverage[metric]+'/'+v.expected+'天</small>':'')+'</span>';
    }).join('');
  }
  function render() { renderSummary();draw();detail(); }
  function toggleShop(event) {
    const b=event.target.closest('button[data-s]');if(!b)return;const s=b.dataset.s;
    if(chosen.has(s)){if(chosen.size===1)return;chosen.delete(s);}else chosen.add(s);
    chips();render();
  }
  $('shopGrp').addEventListener('click',toggleShop);$('legend').addEventListener('click',toggleShop);
  ['metric','gran'].forEach(kind=>$(kind==='metric'?'metricGrp':'granGrp').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(kind==='metric')metric=b.dataset.m;
    else {gran=b.dataset.g;if(axis.length){range=visibleDates();rebuild();}}
    e.currentTarget.querySelectorAll('button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b);});render();
  }));
  $('rangeGrp').addEventListener('click',e=>{const b=e.target.closest('button');if(b)applyPreset(b.dataset.r);});
  $('fromD').addEventListener('change',useDates);$('toD').addEventListener('change',useDates);
  $('showValues').addEventListener('change',draw);
  $('resetView').addEventListener('click',()=>{if(!axis.length)return;view={start:0,end:axis.length-1};hover=-1;syncInputs();render();});
  $('retryData').addEventListener('click',loadData);
  function indexAt(e) {
    const rect=canvas.getBoundingClientRect();const x=(e.clientX-rect.left)*W/rect.width;
    if(!plot)return -1;
    return Math.max(view.start,Math.min(view.end,Math.round(view.start+(x-plot.left)/(W-plot.left-plot.right)*(view.end-view.start))));
  }
  canvas.addEventListener('pointerdown',e=>{if(!plot)return;hover=indexAt(e);detail();draw();if(e.pointerType==='mouse'&&e.button===0){drag={x:e.clientX,start:view.start,end:view.end};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';}});
  canvas.addEventListener('pointermove',e=>{
    if(!plot)return;
    if(drag){const span=drag.end-drag.start+1,shift=Math.round((drag.x-e.clientX)/Math.max(1,W-plot.left-plot.right)*Math.max(1,span-1));const start=Math.max(0,Math.min(axis.length-span,drag.start+shift));view={start,end:start+span-1};activePreset='';rangeButtons();hover=-1;syncInputs();render();}
    else {hover=indexAt(e);draw();detail();}
  });
  function endDrag(){drag=null;canvas.style.cursor='crosshair';}
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
  canvas.addEventListener('pointerleave',()=>{if(!drag){hover=-1;draw();detail();}});
  canvas.addEventListener('wheel',e=>{
    if(!plot||axis.length<2)return;e.preventDefault();
    const old=view.end-view.start+1,anchor=indexAt(e),ratio=old>1?(anchor-view.start)/(old-1):.5;
    const count=Math.max(1,Math.min(axis.length,old+(e.deltaY>0?1:-1)*Math.max(1,Math.round(old*.2))));
    const start=Math.max(0,Math.min(axis.length-count,Math.round(anchor-ratio*(count-1))));
    view={start,end:start+count-1};hover=-1;activePreset='';rangeButtons();syncInputs();render();
  },{passive:false});
  canvas.addEventListener('keydown',e=>{if(!axis.length||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const current=hover<0?view.end:hover;hover=e.key==='Home'?view.start:e.key==='End'?view.end:Math.max(view.start,Math.min(view.end,current+(e.key==='ArrowRight'?1:-1)));draw();detail();});
  window.addEventListener('resize',resize);
  if(window.ResizeObserver)new ResizeObserver(resize).observe($('chartbox'));
  initSyncPill();resize();loadData();setInterval(loadData,5*60*1000);
})();
