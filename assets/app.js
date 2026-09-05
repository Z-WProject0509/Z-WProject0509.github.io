// 电商工作台 · 共享 JS v2
(function () {
  'use strict';
  window.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  window.fmtRp = function (n) { return n == null || isNaN(n) ? '—' : 'Rp ' + Math.round(n).toLocaleString('en-US'); };
  window.fmtCny = function (n) { return n == null || isNaN(n) ? '—' : '≈ ¥' + Math.round(n).toLocaleString('en-US'); };
  window.fmtK = function (n) {
    if (n == null) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'm';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(Math.round(n));
  };
  window.todayLocal = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  window.addDay = function (y, n) { var d = new Date(y + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  window.mondayOf = function (y) { var d = new Date(y + 'T00:00:00'); var w = (d.getDay() + 6) % 7; return addDay(y, -w); };
  window.monthFirst = function (y) { return y.slice(0, 8) + '01'; };
  window.prevMonthRange = function (f) { var fd = new Date(f + 'T00:00:00'); fd.setMonth(fd.getMonth() - 1); var pf = fd.getFullYear() + '-' + String(fd.getMonth() + 1).padStart(2, '0') + '-01'; return { from: pf, to: addDay(f, -1) }; };
  window.presetRange = function (p) {
    var t = todayLocal();
    if (p === 'today') return { from: t, to: t, label: '今天' };
    if (p === 'yesterday') { var y = addDay(t, -1); return { from: y, to: y, label: '昨日' }; }
    if (p === '7d') return { from: addDay(t, -6), to: t, label: '近7天' };
    if (p === '30d') return { from: addDay(t, -29), to: t, label: '近30天' };
    if (p === 'thisWeek') { var mw = mondayOf(t); return { from: mw, to: t, label: '本周' }; }
    if (p === 'lastWeek') { var lw = addDay(mondayOf(t), -1); return { from: addDay(lw, -6), to: lw, label: '上周' }; }
    if (p === 'thisMonth') return { from: monthFirst(t), to: t, label: '本月' };
    if (p === 'lastMonth') { var pm = prevMonthRange(t); pm.label = '上月'; return pm; }
    return null;
  };
  // 相对时间（xx分钟前）
  window.relTime = function (s) {
    if (!s) return '';
    var d = new Date(String(s).replace(/-/g, '/'));
    if (isNaN(d)) return esc(s);
    var diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    return Math.floor(diff / 86400) + ' 天前';
  };
  // 骨架屏
  window.skeletonCards = function (n) {
    n = n || 4; var h = '<div class="cards">';
    for (var i = 0; i < n; i++) h += '<div class="card"><span class="sk sk-line" style="width:60%"></span><div class="v"><span class="sk sk-line" style="width:80%"></span></div></div>';
    return h + '</div>';
  };
  window.skeletonBlock = function () { return '<div><span class="sk sk-line" style="width:30%"></span><span class="sk sk-line" style="width:90%"></span><span class="sk sk-line" style="width:75%"></span></div>'; };
  // CSV 导出（带 BOM，Excel 友好）
  window.exportCSV = function (filename, headers, rows) {
    var esc2 = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = [headers.map(esc2).join(',')].concat(rows.map(function (r) { return r.map(esc2).join(','); })).join('\r\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  };
  // 同步状态胶囊（15 分钟节奏）
  window.initSyncPill = function () {
    var el = document.getElementById('syncPill');
    if (!el) return;
    function tick() {
      var now = new Date();
      var next = new Date(now); next.setMinutes((Math.floor(now.getMinutes() / 15) + 1) * 15, 0, 0);
      var sec = Math.max(0, Math.floor((next - now) / 1000));
      var m = Math.floor(sec / 60), s = sec % 60;
      el.innerHTML = '<span class="dot"></span>下次计划同步 <b>' + m + ':' + String(s).padStart(2, '0') + '</b>';
    }
    tick(); setInterval(tick, 1000);
  };
  window.refreshNow = function () { location.reload(); };
  // 店铺显示名 = 只留品牌(去掉 虾皮/抖店/拉赞达/Shopee/TikTok 等平台词; 平台用 logo 表示)
  // 内部数据键仍为 "品牌-平台"; 泰国店自动补 "·泰" 以示区别。
  window.storeBrand = function (s) {
    var v = String(s || '');
    var th = false;
    if (/泰国|泰-|泰$|THB|thai/i.test(v)) { th = true; v = v.replace(/泰国/g, '').replace(/泰-?/g, ''); }
    v = v.replace(/(?:虾皮|抖店|拉赞达|Shopee|Tiktok|TikTok|Tokopedia|Lazada)/gi, '');
    v = v.replace(/[【】]/g, '').replace(/^[\s\-—–_]+|[\s\-—–_]+$/g, '');
    return (v || '店铺') + (th ? '·泰' : '');
  };
  // 平台品牌 Logo(全站带平台的标识统一用它): 直接吃店名/平台名自动识别
  //   店名=品牌-平台: 虾皮/Shopee → shopee, 抖店/TikTok/Tokopedia → tk; 拉赞达/Lazada 暂无素材返回空
  window.platLogo = function (p) {
    var s = String(p || '');
    if (/(?:虾皮|Shopee)/i.test(s)) return '<img class="plogo" src="assets/logo-shopee.png" alt="Shopee">';
    if (/(?:抖店|TikTok|Tiktok|Tokopedia)/i.test(s)) return '<img class="plogo" src="assets/logo-tk.png" alt="TikTok">';
    return '';
  };
  // 店铺选择条(三页共用): 虾皮一排 / TikTok 一排, 排内按品牌首字母 A→Z
  // items = [{key,label,pend}]; activeKeys = 已选key集合(仅非pend可on)
  window.storeGroup = function (items, activeKeys) {
    var act = activeKeys || {};
    var by = { Shopee: [], TikTok: [] };
    (items || []).forEach(function (it) {
      var p = /抖店|TikTok|Tiktok|Tokopedia/i.test(it.key || '') ? 'TikTok' : 'Shopee';
      by[p].push(it);
    });
    function sortRow(a, b) { return String(a.label || '').localeCompare(String(b.label || ''), 'zh-CN'); }
    by.Shopee.sort(sortRow); by.TikTok.sort(sortRow);
    function rowOf(p, logoP) {
      var arr = by[p];
      if (!arr.length) return '';
      var cls = p === 'Shopee' ? 'spill2' : 'spill2';
      var btns = arr.map(function (it) {
        var on = !it.pend && act[it.key];
        return '<button type="button" class="spill2' + (on ? ' on' : '') + (it.pend ? ' pend' : '') + '" data-key="' + it.key + '">' + (it.label || '') + (it.pend ? '<span class="n">待接入</span>' : '') + '</button>';
      }).join('');
      return '<div class="shop-line"><span class="sl-t">' + window.platLogo(logoP) + p + '店</span>' + btns + '</div>';
    }
    return rowOf('Shopee', 'Shopee') + rowOf('TikTok', 'TikTok');
  };
})();
