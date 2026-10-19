// 靜態資安掃描：檢查危險的程式寫法、CSP 設定、密鑰外洩與檔案清單。
// 執行：node tools/security-scan.mjs [目錄]   （預設掃描 site/ 與 apps-script/）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const targets = process.argv[2] ? [path.resolve(process.argv[2])] : [path.join(root, 'site'), path.join(root, 'apps-script')];
let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); } };

function files(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(f => path.join(dir, f)).filter(f => fs.statSync(f).isFile()) : []; }
const all = targets.flatMap(files);
const text = f => fs.readFileSync(f, 'utf8');
const byExt = (...exts) => all.filter(f => exts.includes(path.extname(f)));
const rel = f => path.relative(root, f);
const hits = (list, re) => list.flatMap(f => text(f).split('\n').map((l, i) => re.test(l) ? rel(f) + ':' + (i + 1) : null).filter(Boolean));

const js = byExt('.js', '.gs', '.mjs').filter(f => !f.includes('/tools/'));
const html = byExt('.html');

console.log('[危險的程式寫法]');
let h = hits(js, /\beval\s*\(|new\s+Function\s*\(|document\.write(ln)?\s*\(|\.outerHTML\s*=|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/);
check('沒有 eval / new Function / document.write / 字串式 setTimeout', h.length === 0, h.join(', '));
h = hits(js, /\.innerHTML\s*\+=/);
check('沒有以 innerHTML += 累加內容的寫法', h.length === 0, h.join(', '));
h = hits(byExt('.js'), /localStorage\.setItem\([^)]*(token|credential|password|secret)/i);
check('沒有把 token／密碼寫進瀏覽器儲存空間', h.length === 0, h.join(', '));
h = hits(byExt('.js'), /sessionStorage|document\.cookie/);
check('沒有使用 Cookie 或 sessionStorage 保存登入資訊', h.length === 0, h.join(', '));
h = hits(byExt('.gs'), /setXFrameOptionsMode\s*\(\s*HtmlService\.XFrameOptionsMode\.ALLOWALL/);
check('後端沒有允許任意網站嵌入（不使用 ALLOWALL）', h.length === 0, h.join(', '));
{
  // Session 只允許出現在 setup()（擁有者一次性初始化）；其餘一律用已驗證的 Google ID token 判斷身分。
  const bad = [];
  for (const f of byExt('.gs')) {
    const s = text(f);
    const start = s.indexOf('function setup()');
    const end = start >= 0 ? s.indexOf('\nfunction ', start + 10) : -1;
    s.split('\n').forEach((line, i) => {
      if (/Session\./.test(line) || /getOAuthToken|getIdentityToken/.test(line)) {
        const pos = s.split('\n').slice(0, i).join('\n').length;
        if (!(start >= 0 && pos >= start && (end < 0 || pos < end)) || /getOAuthToken|getIdentityToken/.test(line)) bad.push(rel(f) + ':' + (i + 1));
      }
    });
  }
  check('後端只在 setup()（擁有者一次性初始化）使用 Session，其餘一律以已驗證的 Google ID token 判斷身分', bad.length === 0, bad.join(', '));
}
h = hits(byExt('.gs'), /createHtmlOutput\s*\(|evaluate\s*\(/);
check('後端沒有把使用者輸入送進 HtmlService（無伺服器端注入）', h.length === 0, h.join(', '));

{
  const allowed = ['doGet', 'doPost', 'setup', 'getPublicDataForPage'];
  const exposed = byExt('.gs').flatMap(f => [...text(f).matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1])).filter(n => !n.endsWith('_') && !allowed.includes(n));
  check('後端只有 doGet / doPost / setup / getPublicDataForPage 能被瀏覽器直接呼叫（其餘函式名稱皆以 _ 結尾）', exposed.length === 0, exposed.join(', '));
}

{
  // 程式用到的 Google 服務，必須在 appsscript.json 宣告對應的授權範圍；否則真實環境執行時會出現「權限不足」。
  // （模擬環境不會檢查授權範圍，所以用靜態檢查補上。）
  const mf = byExt('.json').find(f => path.basename(f) === 'appsscript.json');
  const gsFiles = byExt('.gs');
  if (mf && gsFiles.length) {
    const scopes = JSON.parse(text(mf)).oauthScopes || [];
    const code = gsFiles.map(text).join('\n');
    const need = [['SpreadsheetApp', 'auth/spreadsheets'], ['DriveApp', 'auth/drive'], ['UrlFetchApp', 'auth/script.external_request'],
      ['MailApp', 'auth/script.send_mail'], ['Session.getActiveUser', 'auth/userinfo.email'], ['Session.getEffectiveUser', 'auth/userinfo.email']];
    const missing = need.filter(([api, sc]) => code.includes(api) && !scopes.some(s => s.endsWith(sc))).map(([api, sc]) => api + ' 需要 ' + sc);
    check('appsscript.json 已宣告程式用到的所有授權範圍', missing.length === 0, missing.join('；'));
    const unknown = scopes.filter(s => !need.some(([, sc]) => s.endsWith(sc)));
    check('appsscript.json 沒有多餘的授權範圍（最小權限）', unknown.length === 0, unknown.join(', '));
  }
}

console.log('\n[HTML 與 CSP]');
for (const f of html) {
  const s = text(f);
  const name = rel(f);
  if (!/<html/i.test(s)) continue;
  const csp = (s.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  const hostCsp = /<html[^>]*data-csp="host"/.test(s);   // Apps Script 由平台提供沙盒，不在頁面內放 CSP
  if (hostCsp) { console.log('  SKIP  ' + name + '：由 Apps Script 平台提供沙盒與 CSP'); }
  if (hostCsp) continue;
  check(name + '：有設定 Content-Security-Policy', csp.length > 0);
  check(name + '：CSP 不含 unsafe-eval', !/unsafe-eval/.test(csp));
  check(name + '：CSP 的 script-src 不含 unsafe-inline', !/script-src[^;]*unsafe-inline/.test(csp));
  check(name + '：CSP 的 style-src 不含 unsafe-inline', !/style-src[^;]*unsafe-inline/.test(csp));
  check(name + '：CSP default-src 為 none（預設全部禁止）', /default-src 'none'/.test(csp));
  for (const d of ["object-src 'none'", "base-uri 'none'", "form-action 'none'"]) check(name + '：CSP 含 ' + d, csp.includes(d));
  check(name + '：沒有行內事件屬性（onclick 等）', !/\son[a-z]+\s*=/i.test(s.replace(/<script[\s\S]*?<\/script>/g, '')));
  check(name + '：沒有 style="" 行內樣式屬性', !/\sstyle\s*=\s*["']/i.test(s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')));
  check(name + '：沒有 http:// 的外部資源（一律 https）', !/(src|href)\s*=\s*["']http:\/\//i.test(s));
  const blank = s.match(/<a [^>]*target="_blank"[^>]*>/g) || [];
  check(name + '：target=_blank 的連結都有 rel=noopener', blank.every(a => /noopener/.test(a)));
  check(name + '：有設定 referrer 政策', /name="referrer"/.test(s));
}

console.log('\n[密鑰與敏感資訊]');
const secretRe = /(AIza[0-9A-Za-z_-]{35})|(-----BEGIN [A-Z ]*PRIVATE KEY-----)|(client_secret)|(ya29\.[0-9A-Za-z_-]{20,})|(sk-[A-Za-z0-9]{32,})|(ghp_[A-Za-z0-9]{30,})/;
h = hits(all.filter(f => !/\.(png|jpg|ico)$/.test(f)), secretRe);
check('找不到 API 金鑰、私鑰、client secret、access token', h.length === 0, h.join(', '));
h = hits(all.filter(f => /\.(js|html|gs)$/.test(f)), /SPREADSHEET_ID['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/);
check('程式碼中沒有寫死的試算表 ID（只放在腳本屬性）', h.length === 0, h.join(', '));

console.log('\n[檔案清單]');
const junk = all.filter(f => /(\.DS_Store|\.bak|\.orig|\.swp|~$|\.env|\.pem|\.key|id_rsa)/.test(path.basename(f)));
check('沒有備份檔、系統暫存檔或金鑰檔', junk.length === 0, junk.map(rel).join(', '));
const big = all.filter(f => fs.statSync(f).size > 3 * 1024 * 1024);
check('沒有異常大的檔案（> 3MB）', big.length === 0, big.map(rel).join(', '));

console.log('\n結果：' + pass + ' 通過，' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
