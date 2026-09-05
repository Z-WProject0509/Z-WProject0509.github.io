(function () {
  'use strict';
  const D = window.StoreTrend, $ = id => document.getElementById(id);
  const COLORS = ['#3b6cf6','#059669','#d97706','#db2777','#7c3aed','#0891b2'];
  const names = { amount:'销售额',orders:'订单数',qty:'销售件数' };
  const METS = ['amount','orders','qty'];
  const MCOL = { amount:'#3b6cf6', orders:'#059669', qty:'#d97706' };
  let rows = [], shops = [], chosen = new Set(), axis = [], values = Object.create(null);
  let metric = 'amount', gran = 'day', range = null, activePreset = '30d', view = {start:0,end:0};
  let hover = -1, drag = null, initial = true, loading = false, skipped = 0;
  let ctyF = 'all'; // 国家母分组: all / 印尼 / 泰国(与订单发货页一致)
  const metrics = new Set(['amount','orders','qty']); // 指标可多选(默认全选 → 相对走势对比)
  function metricList() { return METS.filter(m => metrics.has(m)); }
  function multiMode() { return metrics.size > 1; }
  let singleMode = false;                        // false=多选(点哪家加/减), true=单选(点谁只看谁)
  const mods = new Set(['sum','chart','table']); // 模块自选: 汇总卡/趋势图/每日一览
  const canvas = $('chart'), ctx = canvas.getContext('2d');
  // 浮动数据提示框(跟随鼠标/键盘)
  const chartbox = $('chartbox'), tip = document.createElement('div');
  tip.className = 'chart-tip'; chartbox.appendChild(tip);
  function hideTip() { tip.style.display = 'none'; }
  function tipContent(i) {
    if (i == null || !axis.length || !plot || i < view.start || i > view.end) return '';
    const ss = selected(); if (!ss.length) return '';
    const tipDate = '<div class="tip-d">' + axis[i].label + '</div>';
    if (multiMode()) {
      const mixed = metricList().includes('amount') && !currency();
      const rows = metricList().map(m => {
        const a = metricAt(m, i), base = metricBase(m);
        const idx = (a.sum != null && base) ? (a.sum / base.base * 100).toFixed(0) + '%' : '—';
        const rawTxt = a.sum == null ? '—' : (m === 'amount' && mixed ? Math.round(a.sum).toLocaleString('en-US') : fmtMetricVal(m, a.sum));
        return '<div class="tip-row"><i style="background:' + MCOL[m] + '"></i>' + names[m] + '<b>' + idx + '</b><small>' + rawTxt + '</small></div>';
      }).join('');
      const note = mixed ? '<div class="tip-note">币种不同：销售额只列原值、不合并</div>' : '<div class="tip-note">相对走势 · 区间首日=100 · 数值为实际合计</div>';
      return tipDate + rows + note;
    }
    const multi = metric === 'amount' && !currency();
    const rows = ss.map(s => {
      const v = values[s][i], val = v[metric];
      const txt = val == null ? '—' : (multi ? Math.round(val).toLocaleString('en-US') : format(val));
      const cov = v.coverage[metric] < v.expected ? ' <small>·' + v.coverage[metric] + '/' + v.expected + '天</small>' : '';
      return '<div class="tip-row"><i style="background:' + color(s) + '"></i>' + esc(lbl(s)) + '<b>' + txt + '</b>' + cov + '</div>';
    }).join('');
    const note = multi ? '<div class="tip-note">多币种仅逐店显示，不可相加</div>' : '';
    return tipDate + rows + note;
  }
  function placeTip(clientX, clientY, i) {
    const html = tipContent(i);
    if (!html) { hideTip(); return; }
    tip.innerHTML = html; tip.style.display = '';
    const r = chartbox.getBoundingClientRect();
    let x = clientX - r.left + 16, y = clientY - r.top + 14;
    if (x + tip.offsetWidth > r.width - 4) x = clientX - r.left - tip.offsetWidth - 16;
    if (y + tip.offsetHeight > r.height - 4) y = Math.max(4, r.height - tip.offsetHeight - 4);
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(2, y) + 'px';
  }
  function placeTipAtPoint(i) { // 键盘逐点时把框放在该数据点旁
    if (!plot || !tipContent(i)) { hideTip(); return; }
    tip.innerHTML = tipContent(i); tip.style.display = '';
    const r = chartbox.getBoundingClientRect();
    const px = plot.X(i), py = plot.top + 2;
    let lx = px + 10;
    if (lx + tip.offsetWidth > r.width - 4) lx = px - tip.offsetWidth - 10;
    tip.style.left = Math.max(4, lx) + 'px'; tip.style.top = Math.max(2, py) + 'px';
  }
  let W = 0, H = 360, plot = null;
  function selected() { return shops.filter(s => chosen.has(s)); }
  function shopCountry(s) { return /泰|THB|thai/i.test(s || '') ? '泰国' : '印尼'; }
  function visibleShops() { return ctyF === 'all' ? shops : shops.filter(s => shopCountry(s) === ctyF); }
  function ctySync() {
    const btns = document.querySelectorAll('#ctyGrp button');
    btns.forEach(b => { const on = b.dataset.cty === ctyF; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const nId = shops.filter(s => shopCountry(s) === '印尼').length, nTh = shops.length - nId;
    const note = $('ctyNote'); if (note) note.textContent = '🇮🇩 印尼 ' + nId + ' 店 · 🇹🇭 泰国 ' + nTh + ' 店' + (ctyF !== 'all' ? ' · 当前只看 ' + ctyF : '');
  }
  function currency() {
    const codes = new Set(rows.filter(r => chosen.has(r.store) && range && r.date >= range.from && r.date <= range.to).map(r => r.currency));
    return codes.size > 1 ? null : [...codes][0] || 'IDR';
  }
  function money(n) { return n == null ? '—' : (currency() === 'IDR' ? 'Rp ' : (currency() || '') + ' ') + Math.round(n).toLocaleString('en-US'); }
  function format(v, key = metric) { return v == null ? '未采集' : key === 'amount' ? money(v) : Math.round(v).toLocaleString('zh-CN') + (key === 'orders' ? ' 单' : ' 件'); }
  function color(s) { return COLORS[shops.indexOf(s) % COLORS.length]; }
  // 多指标聚合助手: 某日某指标 在所选店铺上的合计(同币种才可加)与覆盖
  function metricAt(m, i) { let sum = null; const ss = selected(); for (const s of ss) { const v = values[s][i][m]; if (v != null) sum = sum == null ? v : sum + v; } return { sum }; }
  function metricBase(m) { for (let i = view.start; i <= view.end; i++) { const a = metricAt(m, i); if (a.sum != null) return { i, base: a.sum }; } return null; }
  function fmtMetricVal(m, v) {
    if (v == null) return '—';
    if (m === 'amount') return currency() ? money(v) : Math.round(v).toLocaleString('en-US');
    return Math.round(v).toLocaleString('zh-CN') + (m === 'orders' ? ' 单' : ' 件');
  }
  function message(text, error) { $('chartStatus').textContent = text; $('chartStatus').classList.toggle('error', !!error); }
  function visibleDates() { return axis.length ? { from:axis[view.start].start,to:axis[view.end].end } : range; }
  function syncInputs() { const v = visibleDates(); if (v) { $('fromD').value=v.from; $('toD').value=v.to; } }
  function chipIcon(s) { return window.platLogo ? window.platLogo(s) : ''; } // 按店名自动识别平台(品牌-平台命名)
  function lbl(s) { return window.storeBrand ? window.storeBrand(s) : s; }  // 显示只留品牌名
  function metricSync() { document.querySelectorAll('#metricGrp button[data-m]').forEach(b => { const on = metrics.has(b.dataset.m); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
  function chips() {
    const mode = (singleMode
      ? '<button class="shop-mini" data-mo="multi">多选</button><button class="shop-mini on" data-mo="single" style="color:var(--primary);font-weight:800">单选</button>'
      : '<button class="shop-mini on" data-mo="multi" style="color:var(--primary);font-weight:800">多选</button><button class="shop-mini" data-mo="single">单选</button>');
    const acts = '<button class="shop-mini sep" data-act="all">全选</button><button class="shop-mini" data-act="none">清空</button>';
    const vis = visibleShops();
    $('shopGrp').innerHTML = '<span class="gl">🏪 店铺</span>' + mode + acts + vis.map(s => '<button data-s="' + esc(s) + '" aria-pressed="' + chosen.has(s) + '" class="' + (chosen.has(s)?'on':'') + '" style="--shop-color:' + color(s) + '">' + chipIcon(s) + esc(lbl(s)) + '</button>').join('');
    // 图例: 单选指标时=店铺开关; 多选指标时=指标开关(店由店铺条选)
    $('legend').innerHTML = multiMode()
      ? metricList().map(m => '<button class="lg" data-mm="' + m + '" aria-pressed="' + metrics.has(m) + '"><i style="background:' + MCOL[m] + '"></i>' + names[m] + '</button>').join('')
      : vis.map(s => '<button class="lg ' + (chosen.has(s)?'':'off') + '" data-s="' + esc(s) + '" aria-pressed="' + chosen.has(s) + '">' + (chipIcon(s) || '<i style="background:' + color(s) + '"></i>') + esc(lbl(s)) + '</button>').join('');
    metricSync();
    ctySync();
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
      if (initial) {
        // 默认只选同币种组(通常印尼 IDR), 避免一打开就是"多币种不可相加"; 混币种可自行勾选
        const curBy = new Map(rows.map(r => [r.store, r.currency || 'IDR']));
        const groups = {};
        shops.forEach(s => { const c = curBy.get(s) || 'IDR'; (groups[c] = groups[c] || []).push(s); });
        chosen = new Set(groups['IDR'] || groups[Object.keys(groups)[0]] || shops);
      } else { chosen=new Set([...chosen].filter(s=>shops.includes(s))); shops.filter(s=>!oldShops.has(s)).forEach(s=>chosen.add(s)); if (!chosen.size && shops.length) chosen.add(shops[0]); }
      if (ctyF !== 'all') { chosen = new Set([...chosen].filter(s => shopCountry(s) === ctyF)); if (!chosen.size) chosen = new Set(visibleShops()); }
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
    const ml=metricList(), mm=multiMode();
    const cards=ml.map(key=>{
      let total=null,covered=0,expected=0;
      ss.forEach(s=>{const a=sumFor(s,key);if(a.total!=null)total=(total||0)+a.total;covered+=a.count;expected+=a.expected;});
      return '<div class="tot-card"><div class="tk">'+names[key]+'合计</div><div class="tv">'+(key==='amount'&&!currency()?'多币种不可相加':format(total,key))+'</div><div class="ts">'+(covered<expected?'仅汇总已采集数据':'所选店铺 · 当前区间')+'</div></div>';
    });
    if (!mm && ss.length) {
      ss.forEach(s=>{const a=sumFor(s,metric);cards.push('<div class="tot-card shop-total" style="--shop-color:'+color(s)+'"><div class="tk">'+esc(lbl(s))+'</div><div class="tv">'+(metric==='amount'&&!currency()?'请选择相同币种':format(a.total))+'</div><div class="ts">已采集 '+a.count+' / '+a.expected+' 天</div></div>');});
    } else if (mm) {
      cards.push('<div class="tot-card"><div class="tk">📈 相对走势</div><div class="tv" style="font-size:14px">多指标同图对比</div><div class="ts">以区间首日=100 归一</div></div>');
    }
    $('sumStrip').innerHTML=cards.join('');
    $('rangeTag').textContent=dates.from+' 至 '+dates.to+' · 按'+{day:'日',week:'周',month:'月'}[gran]+'统计 · '+ss.length+' 家店铺 · '+(mm?('指标 '+ml.length+' 项'):names[metric]);
    const calLblEl=$('calLbl'); if (calLblEl) calLblEl.textContent=(dates.from||'').slice(5).replace('-','/')+' ~ '+(dates.to||'').slice(5).replace('-','/');
    $('chartTitle').textContent=mm?'指标相对走势（区间首日=100）':names[metric]+'趋势';
    $('chartUnit').textContent=mm?'相对指数':'单位：'+(metric==='amount'?(currency()||'多币种'):(metric==='orders'?'单':'件'));
    let missing=false; ml.forEach(k=>{ ss.forEach(s=>{ const a=sumFor(s,k); if(a.count<a.expected) missing=true; }); });
    message((missing?'部分日期未采集：缺失日期留空，周／月数值仅汇总已采集天数。':'数据已覆盖当前区间。')+(dates.to>=todayLocal()?' 今日数据尚未结束。':'')+(skipped?' 已跳过 '+skipped+' 条无效记录。':''),false);
    canvas.setAttribute('aria-label',$('chartTitle').textContent+'，'+$('rangeTag').textContent+'。使用左右方向键查看各点数值。');
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
    if(multiMode()){ drawMulti(showText); return; }
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
  // 多指标同图: 各指标=所选店铺合计 → 区间首日=100 的相对走势
  function drawMulti(showText) {
    const ss = selected(); if (!ss.length) { showText('请先选择店铺'); return; }
    if (metricList().includes('amount') && !currency()) { showText('币种不同不能合并销售额；可去掉金额指标或只选同币种店铺'); return; }
    const series = [];
    for (const m of metricList()) {
      const raw = new Array(axis.length).fill(null); let has = false;
      for (let i = view.start; i <= view.end; i++) { const a = metricAt(m, i); raw[i] = a.sum; if (a.sum != null) has = true; }
      if (!has) continue;
      const base = metricBase(m).base || 1;
      const idx = new Array(axis.length).fill(null);
      for (let i = view.start; i <= view.end; i++) if (raw[i] != null) idx[i] = raw[i] / base * 100;
      series.push({ m, color: MCOL[m], raw, idx });
    }
    if (!series.length) { showText('该区间暂无已采集数据'); return; }
    const vals = [];
    series.forEach(sr => { for (let i = view.start; i <= view.end; i++) if (sr.idx[i] != null) vals.push(sr.idx[i]); });
    let low = Math.min(0, ...vals), high = Math.max(0, ...vals); if (high === low) high = low + 1;
    const rawRange = (high - low) / 5, power = Math.pow(10, Math.floor(Math.log10(rawRange))), unit = rawRange / power;
    let step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power; step = Math.max(1, step);
    low = Math.floor(low / step) * step; high = Math.ceil(high / step) * step;
    const left = W < 520 ? 52 : 66, right = 22, top = 30, bottom = 38, n = view.end - view.start + 1;
    const X = i => n === 1 ? (left + W - right) / 2 : left + (i - view.start) / (n - 1) * (W - left - right);
    const Y = v => top + (high - v) / (high - low) * (H - top - bottom);
    plot = { left, right, top, bottom, X, Y };
    ctx.lineWidth = 1; ctx.font = '12px sans-serif';
    for (let v = low; v <= high + step * .01; v += step) { const y = Y(v); ctx.strokeStyle = '#e9eef5'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - right, y); ctx.stroke(); ctx.fillStyle = '#66758c'; ctx.textAlign = 'right'; ctx.fillText(Math.round(v), left - 9, y + 4); }
    ctx.textAlign = 'center';
    const stride = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - left - right) / 85))));
    for (let i = view.start; i <= view.end; i += stride) ctx.fillText(axis[i].label, X(i), H - 12);
    const showLabels = $('showValues').checked && n <= 14;
    series.forEach(sr => {
      ctx.strokeStyle = sr.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); let started = false;
      for (let i = view.start; i <= view.end; i++) { const v = sr.idx[i]; if (v == null) { started = false; continue; } if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v)); }
      ctx.stroke();
      for (let i = view.start; i <= view.end; i++) {
        const v = sr.idx[i]; if (v == null) continue;
        if (n <= 45 || i === hover) { ctx.beginPath(); ctx.arc(X(i), Y(v), i === hover ? 5 : 3.5, 0, Math.PI * 2); ctx.fillStyle = sr.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        if (showLabels) { ctx.font = '12px sans-serif'; ctx.textAlign = i === view.start ? 'left' : i === view.end ? 'right' : 'center'; ctx.fillStyle = sr.color; ctx.fillText(Math.round(v), X(i), Y(v) - 11); }
      }
    });
    if (hover >= view.start && hover <= view.end) { ctx.strokeStyle = '#a3afc0'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(hover), top); ctx.lineTo(X(hover), H - bottom); ctx.stroke(); ctx.setLineDash([]); }
    $('labelHint').textContent = $('showValues').checked && n > 14 ? '放大到14个点以内可显示数值' : '';
  }
  function detail() {
    if (!axis.length) return;
    const i = hover >= view.start && hover <= view.end ? hover : view.end, p = axis[i];
    if (multiMode()) {
      $('pointDetail').innerHTML = '<strong>' + p.start + (p.end !== p.start ? ' 至 ' + p.end : '') + '</strong>' + metricList().map(m => {
        const a = metricAt(m, i), base = metricBase(m);
        const idx = (a.sum != null && base) ? (a.sum / base.base * 100).toFixed(0) + '%' : '—';
        return '<span><i style="background:' + MCOL[m] + '"></i>' + names[m] + ' <b>' + idx + '</b><small>' + (m === 'amount' && !currency() ? '多币种' : fmtMetricVal(m, a.sum)) + '</small></span>';
      }).join('');
      return;
    }
    $('pointDetail').innerHTML = '<strong>' + p.start + (p.end !== p.start ? ' 至 ' + p.end : '') + '</strong>' + selected().map(s => {
      const v = values[s][i]; return '<span><i style="background:' + color(s) + '"></i>' + esc(lbl(s)) + ' <b>' + (metric === 'amount' && !currency() ? '币种不同' : format(v[metric])) + '</b>' + (v[metric] != null && v.coverage[metric] < v.expected ? ' <small>仅' + v.coverage[metric] + '/' + v.expected + '天</small>' : '') + '</span>';
    }).join('');
  }
  function applyMods() {
    const vis = (id, on) => { const el = $(id); if (el) el.style.display = on ? '' : 'none'; };
    vis('sumStrip', mods.has('sum'));
    ['chartHead','chartbox','legend','pointDetail','chartHint','labelHint','chartStatus'].forEach(id => vis(id, mods.has('chart')));
    vis('tableZone', mods.has('table'));
  }
  function pctCell(v, p) {
    if (v == null || p == null || p === 0 || v === p) return '';
    const d = v - p, up = d > 0;
    return ' <small style="color:' + (up ? 'var(--green)' : 'var(--red)') + '">' + (up ? '▲' : '▼') + Math.abs(d / p * 100).toFixed(0) + '%</small>';
  }
  function tableForMetric(m) {
    const ss = selected(), cur = currency(), mixed = m === 'amount' && !cur;
    let h = '<div class="tbl-sub" style="font-weight:750;color:var(--text);margin:10px 0 4px;font-size:13px">' +
      (multiMode() ? '<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + MCOL[m] + ';margin-right:6px"></i>' : '') + names[m] +
      (multiMode() ? '（所选店铺合计/逐店）' : '') + '</div>';
    h += '<table><thead><tr><th>周期（最新在上）</th>' + ss.map(s => '<th style="border-top:3px solid ' + color(s) + '">' + chipIcon(s) + esc(lbl(s)) + '</th>').join('') +
      (mixed ? '' : '<th>合计</th>') + '</tr></thead><tbody>';
    for (let i = view.end; i >= view.start; i--) {
      const lab = axis[i].start === axis[i].end ? axis[i].start : axis[i].label;
      h += '<tr><td>' + lab + '</td>';
      let sum = 0, any = false;
      ss.forEach(s => {
        const v = values[s][i][m], p = i > view.start ? values[s][i - 1][m] : null;
        if (v == null) { h += '<td class="na">—</td>'; return; }
        const cov = values[s][i].coverage[m] < values[s][i].expected;
        any = true; if (!mixed) sum += v;
        h += '<td class="' + (cov ? 'cov' : '') + '">' + (mixed ? Math.round(v).toLocaleString('en-US') : format(v, m)) + pctCell(v, p) + '</td>';
      });
      h += (mixed || !any) ? '<td class="na">—</td>' : '<td><b>' + format(sum, m) + '</b></td>';
      h += '</tr>';
    }
    h += '</tbody></table>';
    return h;
  }
  function renderTable() {
    const zone = $('tableZone');
    if (!mods.has('table') || !axis.length) { if (zone) zone.style.display = 'none'; return; }
    const ss = selected(), ml = metricList(), vd = visibleDates();
    $('tableHead').innerHTML = '📋 每日一览：' + (multiMode() ? ml.map(m => names[m]).join(' · ') : names[metric]) +
      ' · ' + ss.length + ' 家店铺 · ' + (vd ? vd.from + ' 至 ' + vd.to : '') +
      (metricList().includes('amount') && !currency() ? ' · ⚠ 币种不同仅逐店看金额' : '') + ' · 最新日期在最上 · 每格小标 = 较前一个日期 ▲升 ▼降';
    $('tableBody').innerHTML = ml.map(m => tableForMetric(m)).join('');
  }
  function render() { renderSummary(); draw(); detail(); renderTable(); applyMods(); hideTip(); }
  function toggleStore(s) {
    if (singleMode) { chosen = new Set([s]); }
    else if (chosen.has(s)) { if (chosen.size === 1) return; chosen.delete(s); }
    else chosen.add(s);
    chips(); render();
  }
  function shopGrpClick(event) {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.mo) { singleMode = b.dataset.mo === 'single'; chips(); render(); return; }
    if (b.dataset.act) {
      chosen = b.dataset.act === 'all' ? new Set(shops) : new Set();
      chips(); render(); return;
    }
    if (b.dataset.s) toggleStore(b.dataset.s);
  }
  $('shopGrp').addEventListener('click', shopGrpClick);
  $('ctyGrp').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-cty]'); if (!b) return;
    ctyF = b.dataset.cty;
    const vis = visibleShops();
    if (ctyF === 'all') { const idr = vis.filter(s => shopCountry(s) === '印尼'); chosen = new Set(idr.length ? idr : vis); }
    else { chosen = new Set(vis.filter(s => chosen.has(s) && shopCountry(s) === ctyF)); if (!chosen.size) chosen = new Set(vis); }
    chips(); render();
  });
  function toggleMetricMM(m) {
    if (metrics.has(m)) { if (metrics.size === 1) return; metrics.delete(m); } else metrics.add(m);
    if (metrics.size === 1) metric = [...metrics][0];
    else if (!metrics.has(metric)) metric = [...metrics][0];
    chips(); render();
  }
  $('legend').addEventListener('click', function (event) {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.mm) toggleMetricMM(b.dataset.mm);
    else if (b.dataset.s && !multiMode()) toggleStore(b.dataset.s);
  });
  $('metricGrp').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-m]'); if (!b) return;
    toggleMetricMM(b.dataset.m);
  });
  $('modGrp').addEventListener('click',function (event) {
    const b = event.target.closest('button'); if (!b || !b.dataset.mod) return;
    const m = b.dataset.mod;
    if (mods.has(m) && mods.size === 1) return; // 至少保留一个模块
    if (mods.has(m)) mods.delete(m); else mods.add(m);
    document.querySelectorAll('#modGrp button').forEach(x => { x.classList.toggle('on', mods.has(x.dataset.mod)); x.setAttribute('aria-pressed', mods.has(x.dataset.mod)); });
    render();
  });
  $('fromD').addEventListener('change',useDates);$('toD').addEventListener('change',useDates);
  $('showValues').addEventListener('change',draw);
  $('resetView').addEventListener('click',()=>{if(!axis.length)return;view={start:0,end:axis.length-1};hover=-1;syncInputs();render();});
  $('retryData').addEventListener('click',loadData);
  function indexAt(e) {
    const rect=canvas.getBoundingClientRect();const x=(e.clientX-rect.left)*W/rect.width;
    if(!plot)return -1;
    return Math.max(view.start,Math.min(view.end,Math.round(view.start+(x-plot.left)/(W-plot.left-plot.right)*(view.end-view.start))));
  }
  canvas.addEventListener('pointerdown',e=>{if(!plot)return;hideTip();hover=indexAt(e);detail();draw();if(e.pointerType==='mouse'&&e.button===0){drag={x:e.clientX,start:view.start,end:view.end};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';}});
  canvas.addEventListener('pointermove',e=>{
    if(!plot)return;
    if(drag){const span=drag.end-drag.start+1,shift=Math.round((drag.x-e.clientX)/Math.max(1,W-plot.left-plot.right)*Math.max(1,span-1));const start=Math.max(0,Math.min(axis.length-span,drag.start+shift));view={start,end:start+span-1};activePreset='';rangeButtons();hover=-1;hideTip();syncInputs();render();}
    else {hover=indexAt(e);draw();detail();placeTip(e.clientX,e.clientY,hover);}
  });
  function endDrag(){drag=null;canvas.style.cursor='crosshair';}
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
  canvas.addEventListener('pointerleave',()=>{hideTip();if(!drag){hover=-1;draw();detail();}});
  canvas.addEventListener('wheel',e=>{
    if(!plot||axis.length<2)return;e.preventDefault();
    const old=view.end-view.start+1,anchor=indexAt(e),ratio=old>1?(anchor-view.start)/(old-1):.5;
    const count=Math.max(1,Math.min(axis.length,old+(e.deltaY>0?1:-1)*Math.max(1,Math.round(old*.2))));
    const start=Math.max(0,Math.min(axis.length-count,Math.round(anchor-ratio*(count-1))));
    view={start,end:start+count-1};hover=-1;activePreset='';rangeButtons();syncInputs();render();
  },{passive:false});
  canvas.addEventListener('keydown',e=>{if(!axis.length||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const current=hover<0?view.end:hover;hover=e.key==='Home'?view.start:e.key==='End'?view.end:Math.max(view.start,Math.min(view.end,current+(e.key==='ArrowRight'?1:-1)));draw();detail();placeTipAtPoint(hover);});
  window.addEventListener('resize',resize);
  if(window.ResizeObserver)new ResizeObserver(resize).observe($('chartbox'));
  initSyncPill();resize();loadData();setInterval(loadData,5*60*1000);
})();
