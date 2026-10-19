// 後端資安測試：在模擬的 Apps Script 環境中執行 Code.gs，嘗試各種攻擊情境。
// 執行：node tools/test-backend.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CODE = fs.readFileSync(process.env.CODE_PATH || path.join(here, '..', 'apps-script', 'Code.gs'), 'utf8');
const CLIENT = 'test-client.apps.googleusercontent.com';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra) {
  if (cond) { pass++; results.push('  PASS  ' + name); }
  else { fail++; results.push('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

// ---------- 模擬 Apps Script 服務 ----------
function makeEnv() {
  const sheets = new Map();
  const props = { SPREADSHEET_ID: 'sheet-id', GOOGLE_CLIENT_ID: CLIENT };
  const cache = new Map();
  const stats = { fetch: 0, lock: 0, mail: [], files: [], trashed: [] };
  const tokenInfo = new Map();     // token -> tokeninfo 回應（或 null 代表無效）
  let internalFailure = false;
  const sess = { active: '', effective: 'owner@example.com' };
  const created = [];

  function makeSheet(name) {
    const data = [];
    const sh = {
      name,
      getLastRow: () => data.length,
      getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
      appendRow: (row) => { data.push(row.slice()); },
      deleteRow: (n) => { data.splice(n - 1, 1); },
      insertSheet: null,
      getRange: (r, c, nr = 1, nc = 1) => {
        if (typeof r === 'string') {            // A1 表示法，只支援 A2/C2 這類單格
          const m = r.match(/^([A-Z])(\d+)$/); c = m[1].charCodeAt(0) - 64; r = Number(m[2]); nr = 1; nc = 1;
        }
        return {
          getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((data[r - 1 + i] || [])[c - 1 + j] ?? ''); out.push(row); } return out; },
          getValue: () => ((data[r - 1] || [])[c - 1] ?? ''),
          setValue: (v) => { while (data.length < r) data.push([]); data[r - 1][c - 1] = v; },
          setValues: (vals) => { vals.forEach((row, i) => { while (data.length < r + i) data.push([]); row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }); }
        };
      },
      _data: data
    };
    return sh;
  }
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.set(n, s); return s; }
  };

  const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, Set, Map, Error, RegExp, Promise,
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    Session: { getActiveUser: () => ({ getEmail: () => sess.active }), getEffectiveUser: () => ({ getEmail: () => sess.effective }) },
    SpreadsheetApp: { create: (name) => { created.push(name); return { getId: () => 'new-sheet-id', getUrl: () => 'https://docs.google.com/spreadsheets/d/new-sheet-id' }; }, openById: () => { if (internalFailure) throw new Error('Exception: 存取遭拒：SpreadsheetApp 內部細節 abc123'); return ss; } },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => { cache.set(k, v); }, remove: (k) => { cache.delete(k); } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { stats.lock++; }, releaseLock: () => {} }) },
    UrlFetchApp: { fetch: (url) => {
      stats.fetch++;
      const tok = decodeURIComponent(url.split('id_token=')[1] || '');
      const info = tokenInfo.get(tok);
      return { getResponseCode: () => info ? 200 : 400, getContentText: () => JSON.stringify(info || { error: 'invalid_token' }) };
    } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }) },
    MailApp: { sendEmail: (to, subj, body) => { stats.mail.push({ to, subj, body }); } },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      createFolder: (name) => { stats.folders = (stats.folders || []).concat(name); return { getId: () => 'folder1', createFile: (blob) => { const id = 'file' + (stats.files.length + 1); const f = { id, name: blob._name, type: blob._type, folder: 'folder1' }; stats.files.push(f); return { getId: () => id, setSharing() {} }; } }; },
      getFolderById: (fid) => ({ getId: () => fid, createFile: (blob) => { const id = 'file' + (stats.files.length + 1); const f = { id, name: blob._name, type: blob._type, folder: fid }; stats.files.push(f); return { getId: () => id, setSharing() {} }; } }),
      getFileById: (id) => ({ setTrashed: () => { stats.trashed.push(id); } })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map(b => b & 255)).toString('base64url'),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map(b => (b > 127 ? b - 256 : b)),
      base64DecodeWebSafe: (s) => Array.from(Buffer.from(s, 'base64url')).map(b => (b > 127 ? b - 256 : b)),
      newBlob: (bytes, type, name) => ({ _bytes: bytes, _type: type, _name: name, getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }),
      getUuid: () => crypto.randomUUID()
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);

  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  function makeToken({ email = 'user@example.com', aud = CLIENT, exp = Math.floor(Date.now() / 1000) + 3600, valid = true, verified = 'true', iss = 'https://accounts.google.com' } = {}) {
    const tok = [b64u({ alg: 'RS256', typ: 'JWT' }), b64u({ aud, exp, email }), crypto.randomBytes(24).toString('base64url')].join('.');
    if (valid) tokenInfo.set(tok, { aud, exp: String(exp), iss, email, email_verified: verified });
    return tok;
  }
  const call = (obj) => JSON.parse(ctx.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj) } }).getContent());
  const get = (params) => JSON.parse(ctx.doGet({ parameter: params }).getContent());
  const addAdminRow = (name, email) => { (sheets.get('Admins') || ss.insertSheet('Admins')); if (!sheets.get('Admins')._data.length) sheets.get('Admins')._data.push(['Name', 'Email']); sheets.get('Admins')._data.push([name, email]); };
  return { ctx, sheets, stats, props, sess, created, call, get, makeToken, addAdminRow, setInternalFailure: (v) => { internalFailure = v; } };
}

function adminEnv() {
  const e = makeEnv();
  e.addAdminRow('Owner', 'owner@example.com');
  e.admin = e.makeToken({ email: 'owner@example.com' });
  return e;
}

// ================= 測試 =================
let e;

// --- 未授權存取 / 驗證 ---
e = makeEnv();
check('公開資料可讀取，且不含管理員資訊', (() => { const r = e.get({ action: 'public' }); return r.ok && !JSON.stringify(r).match(/admin|email_verified|owner@/i); })());
check('未知的 GET action 被拒絕', e.get({ action: 'getAdminList' }).ok === false);
check('GET 無法執行任何寫入', e.get({ action: 'saveItem' }).ok === false);
check('POST 內容不是 JSON → 通用錯誤', e.call('not json').ok === false);
check('POST 內容是陣列 → 拒絕', e.call('[1,2,3]').ok === false);
check('沒有 token → 請先登入', e.call({ action: 'whoami' }).error === '請先登入。');
check('action 不是字串 → 拒絕', e.call({ action: { a: 1 }, idToken: 'x' }).ok === false);

e = makeEnv();
let r = e.call({ action: 'whoami', idToken: 'abc' });
check('格式錯誤的 token 被拒絕，且沒有呼叫 Google', r.ok === false && e.stats.fetch === 0);
r = e.call({ action: 'whoami', idToken: e.makeToken({ aud: 'attacker-client' }) });
check('aud 不符的 token（別人的 OAuth client）被拒絕，且沒有呼叫 Google', r.ok === false && e.stats.fetch === 0);
r = e.call({ action: 'whoami', idToken: e.makeToken({ exp: Math.floor(Date.now() / 1000) - 10 }) });
check('已過期的 token 被拒絕，且沒有呼叫 Google', r.ok === false && e.stats.fetch === 0);
const forged = e.makeToken({ valid: false });
r = e.call({ action: 'whoami', idToken: forged });
const f1 = e.stats.fetch;
e.call({ action: 'whoami', idToken: forged });
check('偽造的 token（Google 判定無效）被拒絕', r.ok === false);
check('同一個無效 token 重複送出，只會向 Google 驗證一次（負快取）', e.stats.fetch === f1);
r = e.call({ action: 'whoami', idToken: e.makeToken({ verified: 'false' }) });
check('Email 未驗證的 token 被拒絕', r.ok === false);
r = e.call({ action: 'whoami', idToken: e.makeToken({ iss: 'https://evil.example.com' }) });
check('issuer 不是 Google 的 token 被拒絕', r.ok === false);

// 配額保護
e = makeEnv();
let blocked = false;
for (let i = 0; i < 100; i++) { const rr = e.call({ action: 'whoami', idToken: e.makeToken({ valid: false }) }); if (rr.error === '系統忙碌中，請稍後再試。') blocked = true; }
check('大量不同的偽造 token 會觸發全站限流（保護 UrlFetch 配額）', blocked && e.stats.fetch <= 90, 'fetch=' + e.stats.fetch);

// --- 存取控制 ---
e = adminEnv();
const user = e.makeToken({ email: 'student@example.com' });
check('一般登入者 whoami → isAdmin=false', e.call({ action: 'whoami', idToken: user }).data.isAdmin === false);
const lockBefore = e.stats.lock;
const writeActions = [
  { action: 'saveItem', collection: 'projects', item: { title: { zh: 'x', en: 'x' } } },
  { action: 'deleteItem', collection: 'projects', id: 'x' },
  { action: 'moveItem', collection: 'projects', id: 'x', dir: 'up' },
  { action: 'saveTeam', team: { title: { zh: 'x', en: 'x' } } },
  { action: 'saveHomeContent', home: { texts: {} } },
  { action: 'addAdmin', name: 'Evil', email: 'evil@example.com' },
  { action: 'removeAdmin', email: 'owner@example.com' },
  { action: 'getAdminList' }
];
check('非管理員無法執行任何寫入或讀取管理員名單（8 種操作全被拒）', writeActions.every(a => e.call({ ...a, idToken: user }).error === '權限不足：只有管理員可以執行此操作。'));
check('非管理員的請求不會取得鎖（無法靠大量請求佔住鎖）', e.stats.lock === lockBefore);
check('非管理員沒有被加進管理員名單', !JSON.stringify(e.sheets.get('Admins')._data).includes('evil'));

// --- 輸入驗證：集合名稱、原型汙染 ---
for (const bad of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'Admins', '../x', '']) {
  const rr = e.call({ action: 'saveItem', collection: bad, item: { title: { zh: 'x', en: '' } }, idToken: e.admin });
  if (rr.ok !== false) { check('集合名稱 "' + bad + '" 被拒絕', false); }
}
check('危險的集合名稱（__proto__、constructor 等）全被拒絕', true);
check('未建立 Content 以外的工作表', [...e.sheets.keys()].every(k => ['Admins', 'Content', 'AuditLog'].includes(k)));

r = e.call({ action: 'saveItem', collection: 'projects', idToken: e.admin,
  item: { title: { zh: 'T', en: 'T' }, __proto__: { polluted: true }, isAdmin: true, role: 'admin', 'constructor': { prototype: { x: 1 } } } });
const stored = JSON.parse(e.sheets.get('Content')._data.find(x => x[0] === 'projects')[1]);
check('多餘的欄位（isAdmin、__proto__、constructor）不會被儲存', r.ok && !('isAdmin' in stored[0]) && !('role' in stored[0]) && !('polluted' in stored[0]) && !({}.polluted));
check('Object.prototype 沒有被汙染', ({}).polluted === undefined && ({}).x === undefined);

// --- XSS / SQL 注入 payload：後端當純文字儲存，輸出由前端 escape；JSON 回應不會被當成 HTML ---
const payloads = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', "' OR 1=1 --", "1'; DROP TABLE users;--", '{{7*7}}', 'javascript:alert(1)', '‮\u0000'];
let allStored = true;
for (const p of payloads) {
  const rr = e.call({ action: 'saveItem', collection: 'news', idToken: e.admin, item: { date: '2026-01-01', title: { zh: p, en: p }, text: { zh: p, en: p } } });
  if (!rr.ok) allStored = false;
}
const pub = e.get({ action: 'public' });
check('XSS／SQL 注入字串被當作純文字儲存（沒有被執行、也沒有造成錯誤）', allStored && pub.data.extra.news.length === payloads.length);
check('API 一律回傳 JSON 格式（不會被瀏覽器當成 HTML 執行）', (() => { const o = e.ctx.doGet({ parameter: { action: 'public' } }); return typeof o.getContent() === 'string'; })());

// --- 長度、日期、icon、型別 ---
r = e.call({ action: 'saveItem', collection: 'projects', idToken: e.admin, item: { title: { zh: 'x'.repeat(101), en: '' } } });
check('超過長度上限被拒絕', r.ok === false);
r = e.call({ action: 'saveItem', collection: 'news', idToken: e.admin, item: { date: '2026-13-99; DROP', title: { zh: 'x', en: '' } } });
check('日期格式不符被拒絕', r.ok === false);
r = e.call({ action: 'saveItem', collection: 'values', idToken: e.admin, item: { icon: '<script>', title: { zh: 'x', en: '' } } });
const vals = JSON.parse(e.sheets.get('Content')._data.find(x => x[0] === 'values')[1]);
check('不在白名單的 icon 被改成預設值', r.ok && vals[0].icon === 'target');
r = e.call({ action: 'saveItem', collection: 'projects', idToken: e.admin, item: { title: { zh: { evil: 1 }, en: 5 } } });
check('欄位型別錯誤（物件、數字）不會造成例外洩漏', r.ok === false || typeof JSON.parse(e.sheets.get('Content')._data.find(x => x[0] === 'projects')[1]).slice(-1)[0].title.zh === 'string');
r = e.call({ action: 'saveItem', collection: 'projects', idToken: e.admin, item: { title: { zh: '', en: '' } } });
check('必填欄位為空被拒絕', r.ok === false);
r = e.call({ action: 'saveItem', collection: 'members', idToken: e.admin, item: { name: { zh: 'a', en: 'a' }, email: '=cmd|calc@evil.com' } });
check('成員 Email 含公式字元被拒絕', r.ok === false);
r = e.call({ action: 'saveItem', collection: 'members', idToken: e.admin, item: { name: { zh: 'a', en: 'a' }, email: 'a@b.co<script>' } });
check('成員 Email 含 HTML 被拒絕', r.ok === false);
r = e.call({ action: 'saveItem', collection: 'members', idToken: e.admin, item: { name: { zh: 'a', en: 'a' }, email: 'Good.Name@Example.com' } });
check('合法 Email 通過並轉小寫', r.ok && JSON.parse(e.sheets.get('Content')._data.find(x => x[0] === 'members')[1]).slice(-1)[0].email === 'good.name@example.com');

// --- 試算表公式注入 ---
r = e.call({ action: 'addAdmin', name: '=HYPERLINK("http://evil","x")', email: 'new1@example.com', idToken: e.admin });
const adminRows = e.sheets.get('Admins')._data;
check('管理員姓名的公式字元被中和（以單引號開頭）', r.ok && adminRows.slice(-1)[0][0].startsWith("'="));
for (const bad of ['=1+1@a.com', '+1@a.com', '-1@a.com', '@a.com', 'a b@c.com', 'a@b', 'a@b.c', '<x>@a.com', 'a@@b.com']) {
  const rr = e.call({ action: 'addAdmin', name: 'x', email: bad, idToken: e.admin });
  if (rr.ok) check('管理員 Email "' + bad + '" 被拒絕', false);
}
check('開頭為符號、含空白或 HTML 的管理員 Email 全被拒絕', true);
check('新增／移除管理員會寄通知信給擁有者（有設定 NOTIFY_EMAIL 時）', (() => {
  const e2 = adminEnv(); e2.props.NOTIFY_EMAIL = 'owner@example.com';
  e2.call({ action: 'addAdmin', name: 'A', email: 'a1@example.com', idToken: e2.admin });
  e2.call({ action: 'removeAdmin', email: 'a1@example.com', idToken: e2.admin });
  return e2.stats.mail.length === 2 && e2.stats.mail[0].to === 'owner@example.com' && /a1@example\.com/.test(e2.stats.mail[0].body);
})());
check('沒有設定 NOTIFY_EMAIL 時不會寄信', (() => { const e2 = adminEnv(); e2.call({ action: 'addAdmin', name: 'A', email: 'a2@example.com', idToken: e2.admin }); return e2.stats.mail.length === 0; })());

// --- 管理員自我保護 ---
e = adminEnv();
check('不能移除自己', e.call({ action: 'removeAdmin', email: 'owner@example.com', idToken: e.admin }).ok === false);
e.addAdminRow('Second', 'second@example.com');
check('可以移除其他管理員', e.call({ action: 'removeAdmin', email: 'second@example.com', idToken: e.admin }).ok === true);
const e3 = adminEnv(); const own2 = e3.makeToken({ email: 'owner@example.com' });
check('至少保留一名管理員（只剩一位時無法移除）', e3.call({ action: 'removeAdmin', email: 'someone@example.com', idToken: own2 }).ok === true);
for (let i = 0; i < 25; i++) e3.call({ action: 'addAdmin', name: 'n' + i, email: 'n' + i + '@example.com', idToken: own2 });
check('管理員人數有上限', e3.sheets.get('Admins')._data.length - 1 <= 20);

// --- 圖片上傳 ---
e = adminEnv();
const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString('base64');
const jpg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
const html = 'data:image/png;base64,' + Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
const php = 'data:image/jpeg;base64,' + Buffer.from('<?php system($_GET[0]); ?>').toString('base64');
const photo = (img) => e.call({ action: 'saveItem', collection: 'photos', idToken: e.admin, item: { album: { zh: 'a', en: 'a' }, caption: { zh: 'c', en: 'c' } }, image: img });
check('合法 PNG 通過', photo({ base64: png, name: 'a.png' }).ok === true);
check('合法 JPEG 通過', photo({ base64: jpg, name: 'a.jpg' }).ok === true);
check('SVG（可夾帶腳本）被拒絕', photo({ base64: svg, name: 'a.svg' }).ok === false);
check('偽裝成 PNG 的 HTML 被拒絕（檢查檔頭位元組）', photo({ base64: html, name: 'a.png' }).ok === false);
check('偽裝成 JPEG 的 PHP 被拒絕', photo({ base64: php, name: 'a.jpg' }).ok === false);
check('base64 含非法字元被拒絕', photo({ base64: 'data:image/png;base64,@@@@' }).ok === false);
check('不是 data URL 被拒絕', photo({ base64: 'http://evil.example/a.png' }).ok === false);
check('相簿沒有圖片被拒絕', e.call({ action: 'saveItem', collection: 'photos', idToken: e.admin, item: { album: { zh: 'a', en: '' } } }).ok === false);
check('超大圖片被拒絕', photo({ base64: 'data:image/png;base64,' + 'A'.repeat(9 * 1024 * 1024) }).ok === false);
check('上傳檔名中的路徑字元被清理', (() => { photo({ base64: png, name: '../../etc/passwd<script>.png' }); return e.stats.files.every(f => !/[\/<>\\]/.test(f.name)); })());
const content = e.sheets.get('Content')._data.find(x => x[0] === 'photos')[1];
check('圖片都放進專用資料夾（TeamSite-Images），而不是 Drive 根目錄', e.stats.files.length > 0 && e.stats.files.every(f => f.folder === 'folder1') && (e.stats.folders || []).length === 1);
check('圖片網址只會是 lh3.googleusercontent.com/d/<id> 格式', JSON.parse(content).every(p => /^https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]+$/.test(p.url)));

// --- 公開輸出的過濾：即使資料被直接竄改成惡意網址，也不會輸出 ---
e = adminEnv();
e.sheets.get('Content') || e.ctx.getContentSheet_();
e.ctx.writeDoc_('members', [{ id: '1', name: { zh: 'x', en: 'x' }, avatarUrl: 'javascript:alert(1)' }, { id: '2', name: { zh: 'y', en: 'y' }, avatarUrl: 'https://evil.example/x.png' }]);
e.ctx.writeDoc_('photos', [{ id: '1', url: 'javascript:alert(1)' }, { id: '2', url: 'https://lh3.googleusercontent.com/d/abc123' }]);
const pd = e.get({ action: 'public' }).data;
check('公開資料會過濾掉不合規的成員頭像網址', pd.members.every(m => m.avatarUrl === ''));
check('公開資料會過濾掉不合規的相簿網址', pd.extra.photos.length === 1 && pd.extra.photos[0].url.includes('lh3.googleusercontent.com/d/abc123'));

// --- setup()：擁有者一次性初始化 ---
e = makeEnv(); delete e.props.SPREADSHEET_ID;
e.sess.active = '';
let setupErr = null; try { e.ctx.setup(); } catch (x) { setupErr = x; }
check('從網頁呼叫 setup()（訪客沒有 activeUser）被拒絕，且不會建立任何東西', setupErr && setupErr.userFacing && e.created.length === 0 && !e.props.SPREADSHEET_ID);
e.sess.active = 'someone-else@example.com';
setupErr = null; try { e.ctx.setup(); } catch (x) { setupErr = x; }
check('其他人的帳號呼叫 setup() 被拒絕（activeUser 必須等於擁有者）', setupErr && e.created.length === 0);
e.sess.active = 'owner@example.com';
const msg1 = e.ctx.setup();
const admins1 = e.sheets.get('Admins')._data;
check('擁有者執行 setup()：建立試算表並記錄 SPREADSHEET_ID', e.created.length === 1 && e.props.SPREADSHEET_ID === 'new-sheet-id');
check('setup() 只會把擁有者設為第一位管理員', admins1.length === 2 && admins1[1][1] === 'owner@example.com');
e.ctx.setup();
check('重複執行 setup() 不會重複建立試算表或管理員', e.created.length === 1 && e.sheets.get('Admins')._data.length === 2);
check('setup() 之後，擁有者可用已驗證的 token 以管理員身分登入', (() => { const tok = e.makeToken({ email: 'owner@example.com' }); return e.call({ action: 'whoami', idToken: tok }).data.isAdmin === true; })());
check('setup() 之後，其他帳號仍然不是管理員', (() => { const tok = e.makeToken({ email: 'other@example.com' }); return e.call({ action: 'whoami', idToken: tok }).data.isAdmin === false; })());

// --- Client ID 寫入程式碼常數（公開資訊）的備援 ---
e = makeEnv(); delete e.props.GOOGLE_CLIENT_ID;
e.addAdminRow('Owner', 'owner@example.com');
const tkn = e.makeToken({ email: 'owner@example.com' });
check('未設定 GOOGLE_CLIENT_ID 且沒有內建常數時，請求被拒絕（不會放行）', e.call({ action: 'whoami', idToken: tkn }).ok === false);
e.ctx.BUILD_CLIENT_ID_ = CLIENT;
check('有內建 Client ID 常數時，可以正常驗證', e.call({ action: 'whoami', idToken: tkn }).ok === true);
e.ctx.BUILD_CLIENT_ID_ = 'wrong-client';
check('內建常數與 token 的 aud 不符時被拒絕', e.call({ action: 'whoami', idToken: e.makeToken({ email: 'owner@example.com' }) }).ok === false);

// --- 頻率限制 ---
e = adminEnv();
let limited = false;
for (let i = 0; i < 40; i++) { const rr = e.call({ action: 'saveItem', collection: 'projects', idToken: e.admin, item: { title: { zh: 't' + i, en: '' } } }); if (rr.error === '操作過於頻繁，請稍後再試。') limited = true; }
check('管理員寫入有頻率限制（每分鐘 30 次）', limited);

// --- 錯誤訊息不洩漏內部細節 ---
e = adminEnv();
e.setInternalFailure(true);
const rr2 = e.call({ action: 'whoami', idToken: e.admin });
check('內部錯誤（含中文系統訊息）只回傳通用訊息，不洩漏細節', rr2.ok === false && rr2.error === '發生錯誤，請稍後再試。' && !JSON.stringify(rr2).includes('abc123'));
e.setInternalFailure(false);

// --- 文字覆寫白名單 ---
e = adminEnv();
r = e.call({ action: 'saveHomeContent', idToken: e.admin, home: { texts: { cta_title: { zh: 'ok', en: 'ok' }, err_no_perm: { zh: 'pwn', en: 'pwn' }, __proto__: { x: 1 } }, tagline: { zh: 't', en: 't' } } });
const home = JSON.parse(e.sheets.get('Content')._data.find(x => x[0] === 'home')[1]);
check('網站文字只允許白名單內的鍵（不能覆寫錯誤訊息等）', r.ok && home.texts.cta_title && !home.texts.err_no_perm && !home.texts.x);

// --- 稽核紀錄 ---
check('寫入操作會留下稽核紀錄', (e.sheets.get('AuditLog')?._data.length || 0) > 1);

console.log(results.join('\n'));
console.log('\n結果：' + pass + ' 通過，' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
