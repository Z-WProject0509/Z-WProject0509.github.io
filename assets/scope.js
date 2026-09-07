(function () {
  'use strict';
  const api = window.ShopScope = {};
  api.platform = p => /^(tiktok shop|tiktok|tk)$/i.test(p) ? 'TikTok' : /^shopee$/i.test(p) ? 'Shopee' : p;
  api.ready = fetch('stores.json', {cache:'no-store'}).then(r => {
    if (!r.ok) throw Error('店铺配置读取失败');
    return r.json();
  }).then(data => {
    const keys = new Set();
    api.stores = data.stores.filter(s => s.enabled !== false).map(s => {
      if (!s.country || !s.platform || !s.key || !/^[a-zA-Z0-9_-]+$/.test(s.key) || keys.has(s.key)) throw Error('店铺配置缺少国家、平台或唯一标识');
      keys.add(s.key);
      return {...s, platform:api.platform(s.platform), name:s.displayName || (s.brand || s.label) + (s.alias || ''), currency:s.currency || (data.countries.find(c => c.name === s.country) || {}).currency};
    });
    api.countries = [...new Set([...data.countries.map(c => c.name), ...api.stores.map(s => s.country)])];
    api.find = key => api.stores.find(s => s.key === key || s.storeName === key || (s.dataNames || []).includes(key));
    return api;
  });
  api.mount = function (host, onChange, options = {}) {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('shop-scope-v1')) || {}; } catch (_) {}
    const state = {country:saved.country, platform:saved.platform, store:saved.store};
    host.className = 'scope-panel';
    const title = document.createElement('div'); title.className = 'scope-title'; title.textContent = '国家'; host.append(title);
    const tree = document.createElement('div'); tree.className = 'scope-tree'; host.append(tree);
    const fields = document.createElement('div'); fields.className = 'scope-fields'; fields.style.display='none'; host.append(fields);
    const selects = {};
    [['country','01 国家'],['platform','02 平台'],['store','03 店铺']].forEach(([key,label]) => {
      const wrap = document.createElement('label'); wrap.textContent = label;
      const select = document.createElement('select'); select.id = 'scope-' + key; selects[key] = select; wrap.append(select); fields.append(wrap);
      select.addEventListener('change', () => {state[key] = select.value; if (key === 'country') {state.platform = null; state.store = null;} if (key === 'platform') state.store = null; update();});
    });
    const path = document.createElement('div'); path.className = 'scope-path'; host.append(path);
    const labelName = s => { const n = String(s.name || s.displayName || s.label || s.storeName || s.key).replace(/[【】]/g,''); return `<span>${n}</span>`; };
    let ovByKey = {}; try { ovByKey = JSON.parse(localStorage.getItem('shop-status-cache')) || {}; } catch (_) {}
    const relabel = () => { try { if (typeof update === 'function') update(); } catch (_) {} };
    fetch('overview_today.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(o => { if (o && Array.isArray(o.rows)) { const m = {}; o.rows.forEach(r => { if (r && r.key) { m[r.key] = r.status || 'off'; m[r.key+'_m'] = (r.syncMinutes != null ? r.syncMinutes + ' 分钟前' : ''); } }); ovByKey = m; try { localStorage.setItem('shop-status-cache', JSON.stringify(m)); } catch (_) {} } })
      .catch(() => {})
      .finally(() => relabel());
    const sdot = s => { const st = ovByKey[s.key] || 'off'; const col = st === 'off' ? '#12213a' : st === 'green' ? '#16a34a' : st === 'yellow' ? '#e0a41b' : '#e11d48'; let tip = '待接入'; if (st !== 'off') tip = (st === 'green' ? '正常(' : st === 'yellow' ? '较慢(' : '过久未更新(') + (ovByKey[s.key+'_m'] || '') + ')'; return '<i class="scope-dot" style="background:' + col + '" title="' + tip + '"></i>'; };
    function drawTree(countries, currentCountry, currentPlatform, currentStore, allMode) {
      tree.replaceChildren();
      const countryRow=document.createElement('div'); countryRow.className='scope-country-row';
      countries.forEach(c=>{const b=document.createElement('button'); b.className='scope-country'+(c===currentCountry?' on':''); b.textContent=c; b.onclick=()=>{state.country=c;state.platform=null;state.store=null;update();}; countryRow.append(b);}); tree.append(countryRow);
      const list=api.stores.filter(s=>s.country===currentCountry); const order=['Shopee','TikTok','Lazada'];
      [...new Set([...order,...list.map(s=>s.platform)])].forEach(p=>{const stores=list.filter(s=>s.platform===p);if(!stores.length)return;const row=document.createElement('div');row.className='scope-platform-row';const pl=document.createElement('div');pl.className='scope-platform-name';const img=document.createElement('img');img.className='scope-platform-logo';img.alt='';const imgName=p==='Shopee'?'logo-shopee.png':p==='TikTok'?'logo-tk.png':p==='Lazada'?'logo-lazada.png':'';if(imgName){img.src='assets/'+imgName;pl.prepend(img);}pl.appendChild(document.createTextNode(p));row.append(pl);const shops=document.createElement('div');shops.className='scope-shop-buttons';stores.forEach(s=>{const b=document.createElement('button');b.className='scope-shop'+((currentStore===s.key||(!currentStore&&currentPlatform===p&&stores[0].key===s.key))?' on':'')+(s.live?'':' pending');b.innerHTML=sdot(s)+labelName(s)+(s.live?'':'<small>待接入</small>');b.onclick=()=>{state.platform=p;state.store=s.key;update();};shops.append(b);});if(allMode){const b=document.createElement('button');b.className='scope-shop all'+(currentStore==='all'&&currentPlatform===p?' on':'');b.textContent='全部';b.onclick=()=>{state.platform=p;state.store='all';update();};shops.prepend(b);}row.append(shops);tree.append(row);});
    }
    function fill(select, entries, value) {
      select.replaceChildren(...entries.map(([key,label]) => {const o = document.createElement('option'); o.value = key; o.textContent = label; return o;}));
      select.value = entries.some(e => e[0] === value) ? value : (entries[0]?.[0] || ''); return select.value;
    }
    function update() {
      state.country = fill(selects.country, api.countries.map(c => [c,c]), state.country);
      const countries = api.stores.filter(s => s.country === state.country);
      const platforms = [...new Set(countries.map(s => s.platform))].sort((a,b) => ({TikTok:0,Shopee:1}[a] ?? 2) - ({TikTok:0,Shopee:1}[b] ?? 2));
      state.platform = fill(selects.platform, platforms.map(p => [p,p]), state.platform);
      const stores = countries.filter(s => s.platform === state.platform);
      const entries = stores.map(s => [s.key,s.name + (s.live ? '' : ' · 待接入')]);
      if (options.multiple) entries.unshift(['all','全部店铺（可在下方多选）']);
      state.store = fill(selects.store, entries, state.store);
      path.textContent = [state.country,state.platform,state.store === 'all' ? '全部店铺' : api.find(state.store)?.name].filter(Boolean).join(' → ');
      drawTree(api.countries,state.country,state.platform,state.store,!!options.multiple);
      try {localStorage.setItem('shop-scope-v1',JSON.stringify(state));} catch (_) {}
      onChange({...state}, api.find(state.store), stores);
    }
    update();
    return {state, update};
  };
})();
