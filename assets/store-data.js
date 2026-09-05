/* 店铺趋势：纯数据计算，日期使用 UTC 运算以避免夏令时影响。 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  function validDate(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  }
  function addDays(s, n) { return new Date(Date.parse(s) + n * DAY).toISOString().slice(0, 10); }
  function days(from, to) { return Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1; }
  function number(v) { return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; }
  function normalize(rows) {
    const byKey = new Map(); let skipped = 0;
    for (const row of rows) {
      if (!row || !validDate(row.date) || typeof row.store !== 'string' || !row.store.trim()) { skipped++; continue; }
      // 每行是店铺当天快照；重复日期取最后一份，避免累计两次。
      const clean = { date: row.date, store: row.store.trim(), currency: row.currency || 'IDR', amount: number(row.amountLocal), orders: number(row.orders), qty: number(row.totalQty) };
      byKey.set(clean.store + '\0' + clean.date, clean);
    }
    return { rows: [...byKey.values()].sort((a,b) => a.date.localeCompare(b.date)), skipped };
  }
  function buckets(from, to, gran) {
    if (!validDate(from) || !validDate(to) || from > to || days(from,to) > 3660) throw new Error('请选择有效日期范围（最多10年），开始日期不能晚于结束日期。');
    const out = [];
    for (let start = from; start <= to;) {
      const d = new Date(start); let end = start;
      if (gran === 'week') end = addDays(start, 6 - ((d.getUTCDay() + 6) % 7));
      if (gran === 'month') end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0,10);
      if (end > to) end = to;
      out.push({ start, end, label: gran === 'month' ? start.slice(0,7) : start.slice(5) });
      start = addDays(end, 1);
    }
    return out;
  }
  function aggregate(rows, shops, axis) {
    const daily = new Map(rows.map(r => [r.store + '\0' + r.date, r]));
    const output = Object.create(null);
    for (const shop of shops) output[shop] = axis.map(point => {
      const v = { amount: null, orders: null, qty: null, coverage: {amount:0,orders:0,qty:0}, expected: days(point.start,point.end) };
      for (let d = point.start; d <= point.end; d = addDays(d,1)) {
        const row = daily.get(shop + '\0' + d); if (!row) continue;
        for (const k of ['amount','orders','qty']) if (row[k] != null) { v[k] = (v[k] || 0) + row[k]; v.coverage[k]++; }
      }
      return v;
    });
    return output;
  }
  function preset(name, today, min, max) {
    if (name === 'all') return { from: min, to: max };
    const count = { '7d':7, '30d':30, '90d':90 }[name] || 30;
    return { from: addDays(today,1-count), to:today };
  }
  const api = { validDate,addDays,days,normalize,buckets,aggregate,preset };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StoreTrend = api;
})(typeof window === 'undefined' ? globalThis : window);
