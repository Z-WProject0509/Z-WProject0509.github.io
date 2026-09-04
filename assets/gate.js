// 电商工作台 · 多公司门禁(普通前端门禁,配合 login.html)
// - 未登录(本地无 ds_corp) → 跳 login.html?next=当前页
// - 已登录 → window.__corp 记录公司代号, 提供 window.dataUrl() 生成公司数据路径
//   公司A(corp=a) 读根目录文件(现状不变); 公司B(corp=b) 读 b/ 子目录
(function () {
  var corp = null, user = null, name = null;
  try {
    corp = localStorage.getItem('ds_corp');
    user = localStorage.getItem('ds_user');
    name = localStorage.getItem('ds_name');
  } catch (e) {}
  window.__corp = corp && (corp === 'a' || corp === 'b') ? corp : 'a';
  window.__user = user || '';
  window.__corpName = name || '';

  if (!corp) {
    var next = location.pathname.split('/').pop() || 'index.html';
    var q = location.search;
    if (q) next = encodeURIComponent(next + q);
    location.replace('login.html?next=' + next);
    return;
  }
  // 公司数据路径: a=根(无前缀), b=b/ 子目录
  window.dataUrl = function (file) {
    return (window.__corp === 'b' ? 'b/' : '') + file;
  };
  // 已登录:更新页面品牌为公司名(可选)
  if (window.__corpName) {
    document.addEventListener('DOMContentLoaded', function () {
      var smalls = document.querySelectorAll('.brand small');
      for (var i = 0; i < smalls.length; i++) smalls[i].textContent = window.__corpName;
    });
  }
  // 退出/切换公司
  window.logoutNow = function () {
    try {
      localStorage.removeItem('ds_corp');
      localStorage.removeItem('ds_user');
      localStorage.removeItem('ds_name');
      localStorage.removeItem('ds_at');
    } catch (e) {}
    location.href = 'login.html';
  };
})();
