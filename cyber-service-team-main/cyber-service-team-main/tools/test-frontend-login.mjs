// 登入流程測試：用模擬的 Google 登入與後端，驗證管理員／非管理員／過期憑證三種情況的畫面行為。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE_PATH || path.join(here, '..', 'site');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-site-'));
for (const f of fs.readdirSync(SITE)) fs.copyFileSync(path.join(SITE, f), path.join(dir, f));
fs.writeFileSync(path.join(dir, 'config.js'), `window.APP_CONFIG={MODE:'api',API_URL:'https://script.google.com/macros/s/TESTID/exec',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com'};`);
const srv = http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise(r => srv.listen(0, r));

const port = 9900 + Math.floor(Math.random() * 90);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'login-prof-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--window-size=1280,900', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
await sleep(4500);
const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errs = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const PUBLIC = { ok: true, data: { teamInfo: { title: { zh: '山城資訊工作隊', en: 'Cyber Service Team' }, description: {}, imageUrl: '' }, members: [], home: {}, extra: {} } };
const respond = (rid, obj) => send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200,
  responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') });
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
  if (m.method === 'Fetch.requestPaused') {
    const u = m.params.request.url, rid = m.params.requestId;
    if (u.startsWith('https://accounts.google.com/gsi/client')) {
      send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from("window.google={accounts:{id:{initialize:function(c){window.__cb=c.callback;},renderButton:function(){},disableAutoSelect:function(){}}}};").toString('base64') });
    } else if (u.startsWith('https://script.google.com/')) {
      let body = {}; try { body = JSON.parse(m.params.request.postData || '{}'); } catch (x) {}
      if (body.action === 'whoami') {
        if ((body.idToken || '').includes('expired')) respond(rid, { ok: false, error: '登入已失效，請重新登入。' });
        else respond(rid, { ok: true, data: { isAdmin: (body.idToken || '').includes('admin'), email: (body.idToken || '').includes('admin') ? 'owner@example.com' : 'student@example.com' } });
      } else if (body.action === 'getAdminList') respond(rid, { ok: true, data: [{ name: 'Owner', email: 'owner@example.com' }] });
      else respond(rid, PUBLIC);
    } else if (/^https?:\/\/(?!localhost)/.test(u)) send('Fetch.fulfillRequest', { requestId: rid, responseCode: 404, body: '' });
    else send('Fetch.continueRequest', { requestId: rid });
  }
};
await send('Runtime.enable'); await send('Page.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value ?? r.exceptionDetails?.text; };
const toasts = () => ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`);
const login = async (tok) => { await ev(`window.__cb({ credential: ${JSON.stringify(tok)} })`); await sleep(900); };

await send('Page.navigate', { url: 'http://localhost:' + srv.address().port + '/index.html' });
await sleep(3500);

console.log('[非管理員登入]');
await login('a.b.student');
check('沒有顯示任何「不是管理員」之類的提示訊息', (await toasts()).length === 0, JSON.stringify(await toasts()));
check('右上角顯示「一般訪客」與信箱', /一般訪客.*student@example\.com/.test(await ev(`document.getElementById('user-status').textContent`)));
check('看不到任何管理功能（新增、編輯、管理員設定頁籤）', (await ev(`document.querySelectorAll('.admin-only:not(.hidden)').length`)) === 0);
await ev(`document.getElementById('btn-logout').click()`); await sleep(500);

console.log('[管理員登入]');
await ev(`document.querySelectorAll('.toast').forEach(t => t.remove())`);
await login('a.b.admin');
check('顯示「已登入管理員身分」', (await toasts()).some(t => /已登入管理員/.test(t)), JSON.stringify(await toasts()));
check('右上角顯示「管理員」與信箱', /管理員.*owner@example\.com/.test(await ev(`document.getElementById('user-status').textContent`)));
check('出現管理功能', (await ev(`document.querySelectorAll('.admin-only:not(.hidden)').length`)) > 3);
await ev(`document.getElementById('btn-logout').click()`); await sleep(500);
check('登出後管理功能消失', (await ev(`document.querySelectorAll('.admin-only:not(.hidden)').length`)) === 0);

console.log('[憑證過期]');
await login('a.b.expired');
check('憑證過期會回到未登入狀態（不會停在管理員畫面）', (await ev(`document.querySelectorAll('.admin-only:not(.hidden)').length`)) === 0 && /訪客/.test(await ev(`document.getElementById('user-status').textContent`)));
check('沒有 JavaScript 例外', errs.length === 0, errs.join(' | '));

ws.close(); proc.kill(); srv.close(); await sleep(1500);
for (const d of [prof, dir]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) {} }
console.log('\n結果：' + pass + ' 通過，' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
