// 防止被其他網站用 iframe 嵌入（點擊劫持）。靜態主機（如 GitHub Pages）無法設定 X-Frame-Options，
// 且 <meta> 的 CSP 不支援 frame-ancestors，所以在這裡以腳本防護：被嵌入時隱藏內容並嘗試跳出框架。
/*FRAME_GUARD_START*/
(function() {
  try {
    if (window.top !== window.self) {
      document.documentElement.style.display = 'none';
      window.top.location.href = window.self.location.href;
    }
  } catch (e) {
    // 無法存取上層視窗（跨來源嵌入）時，直接隱藏整個頁面。
    document.documentElement.style.display = 'none';
  }
})();
/*FRAME_GUARD_END*/

// 在頁面繪製前先套用主題與語言，避免閃爍。
(function() {
  var theme = '', lang = '';
  try { theme = localStorage.getItem('theme') || ''; lang = localStorage.getItem('lang') || ''; } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  if (lang !== 'zh' && lang !== 'en') {
    lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
})();
