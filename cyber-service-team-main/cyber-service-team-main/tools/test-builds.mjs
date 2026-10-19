// 驗證三個交付版本都能實際運作。執行：node tools/test-builds.mjs（需先 python3 tools/build.py）
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); } };

async function browser(url, { init, steps }) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'bld-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--window-size=1280,900', '--user-data-dir=' + prof, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  await sleep(4500);
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const csp = []; const errs = []; const reqs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url);
    if (m.method === 'Log.entryAdded' && /Content Security Policy|Refused/.test(m.params.entry.text)) csp.push(m.params.entry.text.slice(0, 140));
    if (m.method === 'Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  if (init) await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value ?? r.exceptionDetails?.text; };
  const nav = async (u) => { await send('Page.navigate', { url: u }); await sleep(3500); };
  await nav(url);
  try { await steps({ ev, nav, csp, errs, send, reqs }); } finally { ws.close(); proc.kill(); await sleep(1200); try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) {} }
}
const click = (s) => `document.querySelector(${JSON.stringify(s)})?.click()`;
const setv = (i, v) => `document.getElementById(${JSON.stringify(i)}).value=${JSON.stringify(v)}`;

// ================= 1. 單機版（file://） =================
console.log('\n[單機版：直接雙擊開啟的單一 HTML 檔]');
const file = path.join(DIST, 'standalone', '山城資訊工作隊-單機版.html');
const fileUrl = 'file://' + encodeURI(file);
check('單機版只有 1 個檔案，沒有外部相依', fs.readdirSync(path.join(DIST, 'standalone')).length === 1);
const sHtml = fs.readFileSync(file, 'utf8');
check('單機版的 CSP 禁止所有網路連線（connect-src none）', /connect-src 'none'/.test(sHtml));
await browser(fileUrl, { steps: async ({ ev, nav, csp, errs, reqs }) => {
  check('開啟過程中，瀏覽器沒有向任何網站發出請求（完全離線可用）', reqs.filter(u => /^https?:/.test(u)).length === 0, reqs.filter(u => /^https?:/.test(u)).join(' '));
  check('頁面正常載入並顯示團隊名稱', (await ev(`document.getElementById('home-title').textContent`)) === '山城資訊工作隊');
  check('顯示「單機版」提示橫幅', /單機版/.test(await ev(`document.getElementById('mode-banner').textContent`)));
  check('隊徽圖片有載入（內嵌，不依賴外部檔案）', await ev(`(() => { const i = document.querySelector('.brand-mark img'); return i.complete && i.naturalWidth > 0; })()`));
  check('粒子網絡畫布有繪製內容', await ev(`(() => { const c = document.getElementById('hero-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) n++; return n > 3; })()`));
  await ev(click('#btn-demo-login')); await sleep(800);
  check('可用「管理員登入（本機）」進入管理模式', (await ev(`document.querySelector('.hero-edit').classList.contains('hidden')`)) === false);
  await ev(click('.tab-btn[data-page="projects-page"]')); await sleep(300);
  const n0 = await ev(`document.querySelectorAll('#project-list .project-card').length`);
  await ev(click('[data-add="projects"]')); await sleep(300);
  await ev(setv('if-title-zh', '單機版測試作品')); await ev(setv('if-title-en', 'Local test project'));
  await ev(click('#btn-save-item')); await sleep(800);
  check('新增作品成功', (await ev(`document.querySelectorAll('#project-list .project-card').length`)) === n0 + 1);
  await nav(fileUrl);
  check('重新整理後，剛新增的內容仍然存在（已存在瀏覽器本機）', (await ev(`document.body.innerText.includes('單機版測試作品') || (document.querySelector('.tab-btn[data-page="projects-page"]').click(), document.getElementById('project-list').innerText.includes('單機版測試作品'))`)) === true);
  await ev(click('#btn-demo-login')); await sleep(600);
  await ev(click('.tab-btn[data-page="admin-page"]')); await sleep(300);
  await ev(click('[data-act="reset-local"]')); await sleep(300);
  await ev(click('#confirm-yes')); await sleep(3000);
  check('按「重設本機資料」後還原成預設內容', (await ev(`(document.querySelector('.tab-btn[data-page="projects-page"]').click(), document.getElementById('project-list').innerText.includes('單機版測試作品'))`)) === false);
  check('沒有違反 CSP 的記錄', csp.length === 0, csp.join(' | '));
  check('沒有 JavaScript 例外', errs.length === 0, errs.join(' | '));
} });

// ---- 單機版：本機儲存被竄改成惡意內容時，也不能執行腳本 ----
console.log('\n[單機版：本機儲存被竄改成惡意內容]');
const evil = '<img src=x onerror="window.__pwned=1">';
const L2 = x => ({ zh: x, en: x });
const poison = { team: { title: L2(evil), description: L2('<script>window.__pwned=2</script>'), imageUrl: 'javascript:window.__pwned=3' },
  home: { tagline: L2(evil), texts: { cta_title: L2(evil) } },
  collections: { members: [{ id: '"><img src=x onerror=window.__pwned=4>', name: L2(evil), role: L2(evil), email: 'a@b.co"><img src=x onerror=window.__pwned=5>', avatarUrl: 'javascript:window.__pwned=6' }],
    projects: [{ id: 'p', title: L2(evil), tag: L2(evil), text: L2(evil) }], photos: [{ id: 'x', url: 'javascript:window.__pwned=7', album: L2(evil), caption: L2(evil) }],
    news: [{ id: 'n', date: evil, title: L2(evil), text: L2(evil) }], timeline: [{ id: 't', year: evil, title: L2(evil), text: L2(evil) }],
    contact: [{ id: 'c', icon: evil, title: L2(evil), text: L2(evil) }], values: [{ id: 'v', icon: evil, title: L2(evil), text: L2(evil) }] },
  admins: [{ name: evil, email: evil }] };
await browser(fileUrl, { init: `try{localStorage.setItem('team-site-local-v1', ${JSON.stringify(JSON.stringify(poison))});}catch(e){}`, steps: async ({ ev, csp, errs }) => {
  await ev(click('#btn-demo-login')); await sleep(600);
  for (const pg of ['team-page', 'members-page', 'projects-page', 'gallery-page', 'news-page', 'contact-page', 'admin-page', 'home-page']) { await ev(click('.tab-btn[data-page="' + pg + '"]')); await sleep(200); }
  await ev(click('#member-list .member-card')); await sleep(300);
  check('被竄改的本機資料沒有執行任何腳本', (await ev('window.__pwned')) == null, String(await ev('window.__pwned')));
  check('被竄改的本機資料沒有產生危險的 DOM', (await ev(`document.querySelectorAll('[onerror],[onload],iframe,img[src="x"],a[href^="javascript:"]').length`)) === 0);
  check('被竄改的資料以純文字顯示', (await ev(`document.body.innerText.includes('<img src=x onerror')`)) === true);
  check('沒有 JavaScript 例外', errs.length === 0, errs.join(' | '));
} });

// ================= 2. GitHub 版（靜態伺服器） =================
console.log('\n[GitHub 版：靜態網站，設定檔尚未填入後端時]');
const ghReal = fs.readFileSync(path.join(DIST, 'github', 'config.js'), 'utf8');
if (fs.existsSync(path.join(here, '..', 'deploy.config.json'))) {
  const dc = JSON.parse(fs.readFileSync(path.join(here, '..', 'deploy.config.json'), 'utf8'));
  check('GitHub 版設定檔已填入正式的後端網址與用戶端 ID', ghReal.includes(dc.api_url) && ghReal.includes(dc.client_id));
}
// 以下測試「設定未填」的情境，所以用暫存複本並換成空白設定
const ghDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-blank-'));
for (const f of fs.readdirSync(path.join(DIST, 'github'))) fs.copyFileSync(path.join(DIST, 'github', f), path.join(ghDir, f));
fs.writeFileSync(path.join(ghDir, 'config.js'), 'window.APP_CONFIG={MODE:"api",API_URL:"https://script.google.com/macros/s/請換成你的部署ID/exec",GOOGLE_CLIENT_ID:"請換成你的ClientID.apps.googleusercontent.com",ADMIN_URL:""};');
const srv = http.createServer((req, res) => {
  const p = path.join(ghDir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ghDir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise(r => srv.listen(0, r));
const ghUrl = 'http://localhost:' + srv.address().port + '/index.html';
check('GitHub 版設定檔為 api 模式，且沒有任何密鑰', /MODE: "api"/.test(ghReal) && !/secret/i.test(ghReal));
await browser(ghUrl, { steps: async ({ ev, csp, errs }) => {
  check('設定未填時退回示範資料，而不是對任意網址送出請求', /示範資料/.test(await ev(`document.getElementById('mode-banner').textContent`)));
  check('頁面正常載入', (await ev(`document.getElementById('home-title').textContent`)) === '山城資訊工作隊');
  check('沒有違反 CSP 的記錄', csp.length === 0, csp.join(' | '));
  check('沒有 JavaScript 例外', errs.length === 0, errs.join(' | '));
} });
srv.close();

// ================= 3. Apps Script 內嵌頁面 =================
console.log('\n[Apps Script 版：由 Apps Script 提供的唯讀頁面（以模擬的 google.script.run 測試）]');
const asHtml = fs.readFileSync(path.join(DIST, 'apps-script', 'Index.html'), 'utf8');
check('Index.html 的 <script>／<link>／<img> 都沒有指向外部檔案（全部內嵌）', !/<(script|link|img)\b[^>]*\s(src|href)\s*=\s*["'](?!data:)[^"']+["']/i.test(asHtml));
const mock = `window.google = { script: { run: (function(){ function mk(){ let ok, fail; const o = { withSuccessHandler(f){ ok = f; return o; }, withFailureHandler(f){ fail = f; return o; },
  getPublicDataForPage(){ setTimeout(() => ok({ teamInfo: { title: { zh: '山城資訊工作隊', en: 'Cyber Service Team' }, description: { zh: '測試', en: 'test' }, imageUrl: '' },
    members: [{ id: 'm1', name: { zh: '測試成員', en: 'Test' }, role: { zh: '隊員', en: 'Member' }, responsibilities: { zh: 'x', en: 'x' }, avatarUrl: '' }],
    home: {}, extra: { values: [], timeline: [], projects: [{ id: 'p1', title: { zh: '真實後端的作品', en: 'Real project' }, tag: { zh: 'a', en: 'a' }, text: { zh: 'b', en: 'b' } }], photos: [], news: [], contact: [] } }), 50); } }; return o; } return { withSuccessHandler: (f) => mk().withSuccessHandler(f), withFailureHandler: (f) => mk().withFailureHandler(f) }; })() } };`;
const asDir = path.join(DIST, 'apps-script');
const srv2 = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(asDir, 'Index.html'))); });
await new Promise(r => srv2.listen(0, r));
await browser('http://localhost:' + srv2.address().port + '/', { init: mock, steps: async ({ ev, csp, errs, reqs }) => {
  await sleep(500);
  check('Apps Script 版不會載入 Google 登入腳本（沒有登入功能）', reqs.every(u => !/accounts\.google\.com/.test(u)), reqs.filter(u => /accounts\.google\.com/.test(u)).join(' '));
  check('透過 google.script.run 讀到後端資料並顯示（作品名稱來自後端）', (await ev(`(document.querySelector('.tab-btn[data-page="projects-page"]').click(), document.getElementById('project-list').innerText.includes('真實後端的作品'))`)) === true);
  check('顯示「唯讀檢視」提示', /唯讀/.test(await ev(`document.getElementById('mode-banner').textContent`)));
  check('沒有登入按鈕，也看不到任何管理功能', (await ev(`!document.getElementById('btn-demo-login') && document.querySelectorAll('[data-add]:not(.hidden), .hero-edit:not(.hidden)').length === 0 && document.getElementById('g-signin').children.length === 0`)) === true);
  check('頁面在 iframe 沙盒內不會被隱藏（防嵌入腳本在此版本停用）', (await ev(`getComputedStyle(document.documentElement).display !== 'none'`)) === true);
  check('沒有 JavaScript 例外', errs.length === 0, errs.join(' | '));
} });
srv2.close();

console.log('\n結果：' + pass + ' 通過，' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
