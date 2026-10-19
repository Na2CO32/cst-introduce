// 前端 XSS 測試：用惡意資料餵給網站，檢查沒有任何腳本被執行、也沒有產生危險的 DOM。
// 執行：node tools/test-frontend-xss.mjs   （需要本機安裝 Google Chrome）
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE_PATH || path.join(here, '..', 'site');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const API = 'https://script.google.com/macros/s/TESTID123/exec';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); } };

// ---------- 惡意資料 ----------
const XSS = [
  '<img src=x onerror="window.__pwned=1">',
  '"><script>window.__pwned=2</script>',
  "'><svg onload=window.__pwned=3>",
  '</div><iframe srcdoc="<script>parent.__pwned=4</script>"></iframe>',
  '{{constructor.constructor("window.__pwned=5")()}}',
  '<a href="javascript:window.__pwned=6">x</a>',
  '&lt;script&gt;window.__pwned=7&lt;/script&gt;'
];
const L = s => ({ zh: s, en: s });
const evilData = {
  teamInfo: { title: L(XSS[0]), description: L(XSS.join('\n')), imageUrl: 'javascript:window.__pwned=8' },
  members: XSS.map((x, i) => ({ id: '"><img src=x onerror=window.__pwned=9>' + i, name: L(x), role: L(x), responsibilities: L(x),
    email: i % 2 ? 'a@b.co" onmouseover="window.__pwned=10' : 'x@y.z"><img src=x onerror=window.__pwned=11>',
    avatarUrl: i % 2 ? 'javascript:window.__pwned=12' : 'https://evil.example/track.png' })),
  home: { tagline: L(XSS[0]), heroTitle: L(XSS[1]),
    texts: { cta_title: L(XSS[2]), values_sub: L(XSS[3]), nav_home: L(XSS[0]), rights: L(XSS[1]), __proto__: { polluted: 1 }, constructor: { prototype: { polluted2: 1 } } } },
  extra: {
    values: XSS.map(x => ({ id: x, icon: '"><svg onload=window.__pwned=13>', title: L(x), text: L(x) })),
    timeline: XSS.map(x => ({ id: x, year: x, title: L(x), text: L(x) })),
    projects: XSS.map(x => ({ id: x, title: L(x), tag: L(x), text: L(x) })),
    photos: XSS.map((x, i) => ({ id: x, url: i === 0 ? 'https://lh3.googleusercontent.com/d/abc123' : 'javascript:window.__pwned=14', album: L(x), caption: L(x) })),
    news: XSS.map(x => ({ id: x, date: x, title: L(x), text: L(x) })),
    contact: XSS.map(x => ({ id: x, icon: x, title: L(x), text: L(x) }))
  }
};

async function runScenario(label, { stripCsp }) {
  console.log('\n[' + label + ']');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xss-site-'));
  for (const f of fs.readdirSync(SITE)) fs.copyFileSync(path.join(SITE, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'config.js'), `window.APP_CONFIG={MODE:'api',API_URL:'${API}',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com'};`);
  if (stripCsp) {
    const h = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    fs.writeFileSync(path.join(dir, 'index.html'), h);
  }
  const srv = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    const ext = path.extname(p);
    res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;

  const port2 = 9400 + Math.floor(Math.random() * 400);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'xss-prof-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port2, '--window-size=1280,900', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  await sleep(4500);
  const tabs = await (await fetch('http://127.0.0.1:' + port2 + '/json')).json();
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const dialogs = []; const jsErrors = []; const blocked = [];
  const reqPaused = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
    if (m.method === 'Runtime.exceptionThrown') jsErrors.push(JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
    if (m.method === 'Log.entryAdded' && /Content Security Policy/.test(m.params.entry.text)) blocked.push(m.params.entry.text.slice(0, 120));
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url;
      reqPaused.push(u);
      if (u.startsWith('https://script.google.com/')) {
        send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
          body: Buffer.from(JSON.stringify({ ok: true, data: evilData })).toString('base64') });
      } else if (u.startsWith('https://lh3.googleusercontent.com/') || /^https?:\/\/(?!localhost|127\.)/.test(u)) {
        send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 404, body: '' });
      } else send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value ?? r.exceptionDetails?.text; };

  await send('Page.navigate', { url: 'http://localhost:' + port + '/index.html' });
  await sleep(3500);
  // 逐頁瀏覽、切換語言、打開成員詳細頁與燈箱，盡量觸發所有渲染路徑
  for (const pg of ['team-page', 'members-page', 'projects-page', 'gallery-page', 'news-page', 'contact-page', 'home-page']) {
    await ev(`document.querySelector('.tab-btn[data-page="${pg}"]')?.click()`); await sleep(250);
  }
  await ev(`document.querySelector('.tab-btn[data-page="members-page"]').click()`); await sleep(200);
  for (let i = 0; i < 7; i++) {
    await ev(`document.querySelectorAll('#member-list .member-card')[${i}]?.click()`); await sleep(150);
    await ev(`document.querySelector('[data-act="back-members"]')?.click()`); await sleep(100);
  }
  await ev(`document.querySelector('.tab-btn[data-page="gallery-page"]').click()`); await sleep(200);
  await ev(`document.querySelector('#gallery-list .photo')?.click()`); await sleep(300);
  await ev(`document.getElementById('lb-close')?.click()`);
  await ev(`document.getElementById('btn-lang').click()`); await sleep(400);
  for (const pg of ['team-page', 'members-page', 'projects-page', 'news-page', 'contact-page']) { await ev(`document.querySelector('.tab-btn[data-page="${pg}"]').click()`); await sleep(150); }
  await ev(`document.getElementById('btn-theme').click()`); await sleep(200);

  const pwned = await ev('window.__pwned');
  check('沒有任何注入的腳本被執行（window.__pwned 未被設定）', pwned === undefined || pwned === null, String(pwned));
  check('沒有跳出 alert／confirm／prompt 對話框', dialogs.length === 0, dialogs.join('|'));
  const dom = await ev(`(() => {
    const bad = [];
    document.querySelectorAll('script').forEach(s => { if (!s.src) bad.push('inline script'); else if (!/theme-init|config|app\\.js|accounts\\.google\\.com/.test(s.src)) bad.push('script ' + s.src); });
    document.querySelectorAll('*').forEach(el => { for (const a of el.attributes) { if (/^on/i.test(a.name)) bad.push('handler ' + el.tagName + '.' + a.name); if (/^javascript:/i.test(a.value.trim())) bad.push('js-url ' + el.tagName + '.' + a.name); } });
    document.querySelectorAll('iframe,object,embed,form,base,link[rel=import]').forEach(el => bad.push(el.tagName));
    document.querySelectorAll('img').forEach(i => { const s = i.getAttribute('src') || ''; if (s === '') return; if (!/^(data:image\\/svg\\+xml|logo\\.png|favicon\\.png|https:\\/\\/lh3\\.googleusercontent\\.com\\/d\\/[A-Za-z0-9_-]+$|blob:)/.test(s)) bad.push('img ' + s.slice(0, 60)); });
    document.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href'); if (!/^(mailto:|#|https:\\/\\/)/.test(h)) bad.push('a ' + h.slice(0, 60)); });
    return bad;
  })()`);
  check('DOM 中沒有注入的 script／事件屬性／javascript: 網址／iframe／表單', Array.isArray(dom) && dom.length === 0, JSON.stringify(dom));
  const mails = await ev(`[...document.querySelectorAll('a[href^="mailto:"]')].map(a => a.getAttribute('href'))`);
  check('不合法的成員 Email 不會變成 mailto 連結', Array.isArray(mails) && mails.length === 0, JSON.stringify(mails));
  const txt = await ev(`document.body.innerText`);
  check('攻擊字串以「純文字」顯示（看得到原始內容，而不是被解析成標籤）', typeof txt === 'string' && txt.includes('<img src=x onerror') && txt.includes('<script>'));
  const proto = await ev(`({}).polluted === undefined && ({}).polluted2 === undefined`);
  check('原型汙染（__proto__／constructor）沒有生效', proto === true);
  check('不會向攻擊者指定的外部網址發出請求（只允許 Google 登入／後端網域與本站）',
    reqPaused.every(u => /^(http:\/\/localhost|https:\/\/script\.google\.com|https:\/\/accounts\.google\.com\/gsi\/|https:\/\/lh3\.googleusercontent\.com|data:|blob:)/.test(u)), reqPaused.filter(u => !/^(http:\/\/localhost|https:\/\/script\.google\.com|https:\/\/accounts\.google\.com\/gsi\/|https:\/\/lh3\.googleusercontent\.com|data:|blob:)/.test(u)).join(' '));
  check('頁面沒有因惡意資料而發生未處理的 JS 例外', jsErrors.length === 0, jsErrors.join(' | '));
  if (!stripCsp) console.log('  （CSP 另外攔截了 ' + blocked.length + ' 次違規行為記錄）');

  ws.close(); proc.kill(); srv.close();
  await sleep(1500);
  for (const d of [prof, dir]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) { /* 暫存目錄清不掉不影響測試結果 */ } }
}

await runScenario('有 CSP（正式環境的樣子）', { stripCsp: false });
await runScenario('移除 CSP 後（證明僅靠輸出編碼也安全，不依賴 CSP）', { stripCsp: true });
console.log('\n結果：' + pass + ' 通過，' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
