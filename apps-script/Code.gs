/**
 * 團隊介紹網站 - Google Apps Script 後端（JSON API 版）
 *
 * 架構：前端是純靜態網站（放在其他網域），本檔只提供 API。
 *   - GET  ?action=public      公開，回傳全站內容（唯讀）
 *   - POST {action, idToken…}  管理員操作，必須附上 Google 登入的 ID token
 *
 * 部署設定：
 *   執行身分：我 (Execute as: Me)
 *   存取權限：任何人 (Anyone)
 *   （管理員身分由 ID token 驗證，不依賴 Apps Script 的使用者判斷）
 *
 * 腳本屬性（專案設定 -> 腳本屬性）：
 *   SPREADSHEET_ID    試算表 ID
 *   GOOGLE_CLIENT_ID  Google Cloud 的 OAuth Web Client ID（與前端 config.js 相同）
 *
 * 試算表需有 Admins 工作表（Name | Email）；執行 setup 會自動加入擁有者與預設管理員。
 */

var REQUEST_EMAIL_ = ''; // 本次請求經 token 驗證後的使用者 Email

// ==================== 基礎工具 ====================

// 只有透過 userError_ 建立的錯誤，訊息才會顯示給使用者；其餘（含 Apps Script 系統錯誤）一律回傳通用訊息，避免洩漏內部資訊。
function userError_(msg) {
  const e = new Error(msg);
  e.userFacing = true;
  return e;
}

// OAuth Client ID 是公開資訊（網頁原始碼裡本來就看得到），打包時可直接寫進這個常數；
// 若腳本屬性有設定，以腳本屬性為準。
var BUILD_CLIENT_ID_ = '';

// 預設管理員 Email 清單，打包時由 deploy.config.json 的 default_admins 寫入。
// 執行 setup 時會把清單中尚未加入的 Email 加進 Admins 工作表。
var BUILD_DEFAULT_ADMINS_ = [];

// 舊後端的 API 網址，打包時由 deploy.config.json 的 import_from_api_url 寫入。
// 執行 setup 時若網站內容是空的，會從這個網址匯入公開資料。
var BUILD_IMPORT_API_URL_ = '';

// Google 平台固定網址（非部署設定，與帳號無關）。
var GOOGLE_TOKENINFO_URL_ = 'https://oauth2.googleapis.com/tokeninfo';
var GOOGLE_ISSUERS_ = ['accounts.google.com', 'https://accounts.google.com'];
var DRIVE_IMAGE_URL_PREFIX_ = 'https://lh3.googleusercontent.com/d/';

function getProp_(key) {
  let v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v && key === 'GOOGLE_CLIENT_ID') v = BUILD_CLIENT_ID_;
  if (!v) throw new Error('尚未設定腳本屬性：' + key);   // 設定錯誤屬於內部錯誤，不顯示給訪客
  return v.trim();
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getProp_('SPREADSHEET_ID'));
}

function getCurrentUserEmail_() {
  return REQUEST_EMAIL_;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function publicError_(e) {
  Logger.log(e && e.stack ? e.stack : String(e));
  return (e && e.userFacing && e.message) ? String(e.message) : '發生錯誤，請稍後再試。';
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw userError_('系統忙碌中，請稍後再試。');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// 防止試算表公式注入：以 = + - @ 開頭的文字前面加上單引號。
function safeCell_(text) {
  const s = String(text == null ? '' : text);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// Email 一律使用此規則：開頭必須是英數字（避免以 = + - @ 開頭造成試算表公式注入），不允許空白與 HTML 特殊字元。
var EMAIL_RE_ = /^[A-Za-z0-9][A-Za-z0-9._%+\-]*@[A-Za-z0-9][A-Za-z0-9.\-]*\.[A-Za-z]{2,}$/;

function cleanText_(value, maxLength) {
  const text = String(value == null ? '' : value).trim();
  if (text.length > maxLength) throw userError_('輸入內容過長。');
  return text;
}

// 全站層級的頻率限制（不依賴使用者身分），用來保護 UrlFetch 等有配額的資源。
function globalLimit_(name, max, seconds) {
  const cache = CacheService.getScriptCache();
  const key = 'gl_' + name;
  const n = Number(cache.get(key) || 0);
  if (n >= max) throw userError_('系統忙碌中，請稍後再試。');
  cache.put(key, String(n + 1), seconds);
}

// 簡易頻率限制：每位管理員每分鐘最多 30 次寫入。
function rateLimit_() {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + getCurrentUserEmail_();
  const n = Number(cache.get(key) || 0);
  if (n >= 30) throw userError_('操作過於頻繁，請稍後再試。');
  cache.put(key, String(n + 1), 60);
}

function audit_(action, detail) {
  try {
    const ss = getSpreadsheet_();
    let sheet = ss.getSheetByName('AuditLog');
    if (!sheet) {
      sheet = ss.insertSheet('AuditLog');
      sheet.getRange(1, 1, 1, 4).setValues([['Time', 'User', 'Action', 'Detail']]);
    }
    sheet.appendRow([new Date(), getCurrentUserEmail_(), action, safeCell_(detail || '')]);
  } catch (e) {
    Logger.log('稽核紀錄失敗：' + e.message);
  }
}

// ==================== 身分驗證（Google ID token） ====================

/**
 * 驗證前端用 Google 登入取得的 ID token。
 * 通過 Google tokeninfo 端點驗證簽章與有效期，再檢查 aud 是否為我們的 Client ID。
 * 成功回傳小寫 Email，失敗丟出錯誤。
 */
function verifyIdToken_(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) {
    throw userError_('請先登入。');
  }

  // 先在本機做便宜的檢查（格式、aud、過期時間），不合格就直接拒絕，不消耗 UrlFetch 配額。
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts.every(function(p) { return /^[A-Za-z0-9_-]{8,}$/.test(p); })) {
    throw userError_('登入驗證失敗。');
  }
  let claims;
  try {
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
  } catch (e) {
    throw userError_('登入驗證失敗。');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (!claims || claims.aud !== getProp_('GOOGLE_CLIENT_ID') || !(Number(claims.exp) > nowSec)) {
    throw userError_('登入已失效，請重新登入。');
  }

  // 同一個 token 短時間內重複使用時走快取；驗證失敗的 token 也短暫快取，避免被反覆拿來耗盡配額。
  const cache = CacheService.getScriptCache();
  const digest = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)
  );
  const cacheKey = 'tok_' + digest;
  const hit = cache.get(cacheKey);
  if (hit === '!') throw userError_('登入驗證失敗。');
  if (hit) return hit;

  globalLimit_('tokeninfo', 90, 60);   // 全站每分鐘最多向 Google 驗證 90 次

  const res = UrlFetchApp.fetch(
    GOOGLE_TOKENINFO_URL_ + '?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    cache.put(cacheKey, '!', 60);
    throw userError_('登入已失效，請重新登入。');
  }

  const info = JSON.parse(res.getContentText());
  const okIssuer = GOOGLE_ISSUERS_.includes(info.iss);

  if (info.aud !== getProp_('GOOGLE_CLIENT_ID') || !okIssuer ||
      String(info.email_verified) !== 'true' || !info.email || !(Number(info.exp) > nowSec)) {
    cache.put(cacheKey, '!', 60);
    throw userError_('登入驗證失敗。');
  }

  const email = String(info.email).toLowerCase().trim();
  const ttl = Math.max(1, Math.min(300, Number(info.exp) - nowSec));
  cache.put(cacheKey, email, ttl);
  return email;
}

// ==================== 管理員 ====================

function getAdminSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName('Admins');
  if (!sheet) {
    sheet = ss.insertSheet('Admins');
    sheet.getRange(1, 1, 1, 2).setValues([['Name', 'Email']]);
  }
  return sheet;
}

function getAdminEmails_() {
  const sheet = getAdminSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const emails = [];
  for (let i = 0; i < data.length; i++) {
    const email = String(data[i][1] || '').toLowerCase().trim();
    if (email) emails.push(email);
  }
  return [...new Set(emails)];
}

function checkIsAdmin_() {
  const email = getCurrentUserEmail_();
  if (!email) return false;
  return getAdminEmails_().includes(email);
}

function requireAdmin_() {
  if (!checkIsAdmin_()) throw userError_('權限不足：只有管理員可以執行此操作。');
}

// 所有寫入的統一入口：先確認是管理員、再限速，最後才取得鎖——
// 這樣非管理員無法靠大量請求佔住鎖，造成服務中斷。
function adminWrite_(fn) {
  requireAdmin_();
  rateLimit_();
  return withLock_(fn);
}

// ==================== 入口 ====================

// 注意：Apps Script 中「名稱不以底線結尾」的全域函式，任何人都能用 google.script.run 從瀏覽器直接呼叫。
// 因此除了 doGet、doPost、setup（僅限擁有者在編輯器執行）與下面這個唯讀的 getPublicDataForPage 之外，所有函式名稱都以 _ 結尾（由 tools/security-scan.mjs 檢查）。

// 第一次使用：在 Apps Script 編輯器選擇 setup 後按「執行」，會自動：
//   1. 建立「團隊網站資料」試算表，並記錄在腳本屬性 SPREADSHEET_ID
//   2. 建立 Admins 工作表，並把「你自己」（擁有者）設為第一位管理員
// 安全設計：
//   - 只會把「擁有者本人」設為管理員，無法被用來提升其他人的權限；
//   - 只接受擁有者在編輯器中手動執行（從網頁呼叫時 activeUser 與擁有者不符，會被拒絕）；
//   - 重複執行不會重複建立，也不會覆寫既有資料。
function setup() {
  const active = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  if (!active || !owner || active !== owner) throw userError_('此功能只能由擁有者在 Apps Script 編輯器中執行。');

  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SPREADSHEET_ID');
  let message = '';
  if (!ssId) {
    const created = SpreadsheetApp.create('團隊網站資料');
    ssId = created.getId();
    props.setProperty('SPREADSHEET_ID', ssId);
    message += '已建立試算表：' + created.getUrl() + '\n';
  } else {
    message += '試算表已存在（不會重複建立）。\n';
  }

  const adminSheet = getAdminSheet_();
  if (adminSheet.getLastRow() < 2) {
    adminSheet.appendRow(['擁有者', owner.toLowerCase()]);
    message += '已將 ' + owner + ' 設為第一位管理員。\n';
  } else {
    message += '管理員名單已存在（不會覆寫）。\n';
  }
  // 補上 deploy.config.json 設定的預設管理員（已存在的不會重複加入）。
  const existing = getAdminEmails_();
  BUILD_DEFAULT_ADMINS_.forEach(function (raw) {
    const email = String(raw || '').toLowerCase().trim();
    if (!EMAIL_RE_.test(email) || existing.includes(email)) return;
    adminSheet.appendRow(['預設管理員', safeCell_(email)]);
    existing.push(email);
    message += '已將 ' + email + ' 設為預設管理員。\n';
  });
  message += importFromOldApi_();
  audit_('setup', owner);
  Logger.log(message);
  return message;
}

// 從舊後端的公開 API 匯入網站內容；只在內容工作表還是空的時候執行，不會覆寫既有資料。
function importFromOldApi_() {
  const sheet = getContentSheet_();
  if (!BUILD_IMPORT_API_URL_) return '';
  if (sheet.getLastRow() >= 2) return '網站內容已存在（不會匯入）。\n';

  const res = UrlFetchApp.fetch(BUILD_IMPORT_API_URL_ + '?action=public', { muteHttpExceptions: true });
  const body = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
  if (!body || !body.ok || !body.data) return '無法從舊後端匯入資料（HTTP ' + res.getResponseCode() + '）。\n';

  const d = body.data;
  writeDoc_('team', d.teamInfo || {});
  writeDoc_('members', d.members || []);
  ['values', 'timeline', 'projects', 'photos', 'news', 'contact'].forEach(function (k) {
    writeDoc_(k, (d.extra && d.extra[k]) || []);
  });
  writeDoc_('home', d.home || {});
  clearPublicCache_();
  return '已從舊後端匯入網站內容。\n';
}

// 供「由 Apps Script 直接提供的網頁」讀取公開資料（唯讀，不含任何管理員資訊）。
function getPublicDataForPage() {
  return getPublicData_();
}

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : '';
    if (action === 'public') return json_({ ok: true, data: getPublicData_() });
    if (!action) return servePage_();
    return json_({ ok: false, error: '無效的請求。' });
  } catch (err) {
    return json_({ ok: false, error: publicError_(err) });
  }
}

// 提供網頁（Index.html，唯讀檢視）。檔案不存在時（例如只部署 API 的版本）回傳通用訊息。
// 這裡只輸出專案內「固定的靜態檔案」，不會把任何使用者輸入放進頁面。
function servePage_() {
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('團隊網站')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  } catch (e) {
    return json_({ ok: false, error: '此部署未包含網頁，請使用 API 網址。' });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : '';
    // 圖片已在前端壓縮，這裡再限制整體請求大小。
    if (!raw || typeof raw !== 'string' || raw.length > 12 * 1024 * 1024) throw userError_('請求內容無效或過大。');

    let req;
    try { req = JSON.parse(raw); } catch (parseErr) { throw userError_('請求格式錯誤。'); }
    if (!req || typeof req !== 'object' || Array.isArray(req) || typeof req.action !== 'string') {
      throw userError_('無效的請求。');
    }

    REQUEST_EMAIL_ = verifyIdToken_(req.idToken);

    const handlers = {
      whoami: function() {
        return { isAdmin: checkIsAdmin_(), email: REQUEST_EMAIL_ };
      },
      getAdminList: function() {
        requireAdmin_();
        return getAdminList_();
      },
      addAdmin: function() { return adminWrite_(function() { return addAdminImpl_(req.name, req.email); }); },
      removeAdmin: function() { return adminWrite_(function() { return removeAdminImpl_(req.email); }); },
      saveTeam: function() { return adminWrite_(function() { return saveTeamImpl_(req.team, req.image); }); },
      saveItem: function() { return adminWrite_(function() { return saveItemImpl_(req.collection, req.item, req.image); }); },
      deleteItem: function() { return adminWrite_(function() { return deleteItemImpl_(req.collection, req.id); }); },
      moveItem: function() { return adminWrite_(function() { return moveItemImpl_(req.collection, req.id, req.dir); }); },
      saveHomeContent: function() { return adminWrite_(function() { return saveHomeContentImpl_(req.home); }); }
    };

    const handler = Object.prototype.hasOwnProperty.call(handlers, req.action) ? handlers[req.action] : null;
    if (!handler) throw userError_('無效的請求。');

    return json_({ ok: true, data: handler() });
  } catch (err) {
    return json_({ ok: false, error: publicError_(err) });
  }
}

// ==================== 圖片 ====================

function uploadImageToDrive_(base64Data, fileName) {
  if (!base64Data) return '';
  if (typeof base64Data !== 'string') throw userError_('圖片資料格式錯誤。');

  const match = base64Data.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!match) throw userError_('只允許上傳有效的 PNG/JPG 圖片。');

  const base64 = match[2];
  if (base64.length > 8 * 1024 * 1024) throw userError_('圖片檔案過大，請選擇較小的圖片。');
  if (!/^[A-Za-z0-9+\/]+={0,2}$/.test(base64)) throw userError_('圖片資料格式錯誤。');

  const bytes = Utilities.base64Decode(base64);

  // 驗證魔術位元組，確認內容真的是 JPEG 或 PNG。
  const isJpeg = bytes.length > 3 && (bytes[0] & 255) === 0xFF && (bytes[1] & 255) === 0xD8 && (bytes[2] & 255) === 0xFF;
  const isPng = bytes.length > 8 && (bytes[0] & 255) === 0x89 && (bytes[1] & 255) === 0x50 &&
    (bytes[2] & 255) === 0x4E && (bytes[3] & 255) === 0x47;
  if (!isJpeg && !isPng) throw userError_('檔案內容不是有效的 PNG/JPG 圖片。');

  const safeBaseName = String(fileName || 'image')
    .replace(/[^\w一-鿿.-]+/g, '_')
    .replace(/\.[^.]+$/, '');
  const finalName = (safeBaseName || 'image') + (isPng ? '.png' : '.jpg');
  const blob = Utilities.newBlob(bytes, isPng ? 'image/png' : 'image/jpeg', finalName);

  // 上傳的圖片一律放進專用資料夾，範圍清楚、方便管理與一次撤銷分享。
  const file = getImageFolder_().createFile(blob);
  // 網站訪客需要能讀取圖片（只有這個資料夾內、由本系統上傳的圖片會被公開）。
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return DRIVE_IMAGE_URL_PREFIX_ + file.getId();
}

var IMAGE_FOLDER_NAME_ = 'TeamSite-Images';

function getImageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('IMAGE_FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (e) { /* 資料夾被刪除時重新建立 */ }
  }
  const folder = DriveApp.createFolder(IMAGE_FOLDER_NAME_);
  props.setProperty('IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

function getDriveFileId_(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return '';
  const match = fileUrl.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : '';
}

function deleteOldDriveFile_(fileUrl) {
  const fileId = getDriveFileId_(fileUrl);
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    Logger.log('刪除舊圖片失敗：' + e.message);
  }
}



// ==================== 內容系統 ====================
//
// 所有網站內容存在 Content 工作表（Key | Json）：
//   team / home        單一文件（物件）
//   members、projects、photos、news、timeline、contact、values   各是一個陣列
// 每個欄位若是「loc」型態，就是 {zh, en} 雙語物件。

var CONTENT_SHEET_ = 'Content';
var ICONS_ = ['target', 'users', 'growth', 'mail', 'pin', 'social'];

// 欄位型態：loc（雙語，含長度上限）、text、date、icon；image 指向存放圖片網址的欄位。
var COLLECTIONS_ = {
  members:  { fields: { name: ['loc', 100], role: ['loc', 100], email: ['email', 200], responsibilities: ['loc', 3000] }, required: 'name', image: 'avatarUrl' },
  projects: { fields: { title: ['loc', 100], tag: ['loc', 40], text: ['loc', 400] }, required: 'title' },
  photos:   { fields: { album: ['loc', 40], caption: ['loc', 120] }, required: null, image: 'url', imageRequired: true },
  news:     { fields: { date: ['date'], title: ['loc', 150], text: ['loc', 800] }, required: 'title' },
  timeline: { fields: { year: ['text', 12], title: ['loc', 100], text: ['loc', 500] }, required: 'title' },
  contact:  { fields: { icon: ['icon'], title: ['loc', 60], text: ['loc', 250] }, required: 'title' },
  values:   { fields: { icon: ['icon'], title: ['loc', 100], text: ['loc', 400] }, required: 'title' }
};

// 允許管理員覆寫的介面文字鍵（白名單；不包含錯誤訊息等）。
var TEXT_KEYS_ = ['nav_home', 'nav_about', 'nav_members', 'nav_projects', 'nav_gallery', 'nav_news', 'nav_contact',
  'hero_eyebrow', 'view_projects', 'meet_members', 'stat_members', 'stat_projects', 'stat_years', 'stat_photos',
  'values_title', 'values_sub', 'featured_projects', 'all_projects', 'all_photos', 'more_news', 'cta_title', 'cta_text',
  'history', 'click_hint', 'default_role', 'resp_title', 'resp_empty', 'rights', 'all'];

function getContentSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONTENT_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(CONTENT_SHEET_);
    sheet.getRange(1, 1, 1, 2).setValues([['Key', 'Json']]);
  }
  return sheet;
}

function readDoc_(key, fallback) {
  try {
    const sheet = getContentSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return fallback;
    const rows = sheet.getRange(2, 1, last - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === key) {
        const v = JSON.parse(String(rows[i][1] || 'null'));
        return v == null ? fallback : v;
      }
    }
  } catch (e) {
    Logger.log('讀取內容失敗（' + key + '）：' + e.message);
  }
  return fallback;
}

function writeDoc_(key, obj) {
  const json = JSON.stringify(obj);
  // 單一儲存格上限 50,000 字元。
  if (json.length > 45000) throw userError_('這一類內容的總量已達上限，請先刪除部分項目。');
  const sheet = getContentSheet_();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const keys = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) {
        sheet.getRange(i + 2, 2).setValue(json);
        return;
      }
    }
  }
  // JSON 以 { 或 [ 開頭，不會被當成公式。
  sheet.appendRow([key, json]);
}

function clearPublicCache_() {
  CacheService.getScriptCache().remove('public_data');
}

// 雙語欄位：{zh, en}
function cleanLoc_(v, max) {
  const o = v && typeof v === 'object' ? v : {};
  return { zh: cleanText_(o.zh, max), en: cleanText_(o.en, max) };
}

function cleanField_(v, spec) {
  const type = spec[0];
  if (type === 'loc') return cleanLoc_(v, spec[1]);
  if (type === 'text') return cleanText_(v, spec[1]);
  if (type === 'email') {
    // 選填；有填就必須是合法的 Email，並統一轉成小寫。
    const s = cleanText_(v, spec[1]).toLowerCase();
    if (s && !EMAIL_RE_.test(s)) throw userError_('Email 格式錯誤。');
    return s;
  }
  if (type === 'date') {
    const s = cleanText_(v, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw userError_('日期格式必須是 YYYY-MM-DD。');
    return s;
  }
  if (type === 'icon') return ICONS_.indexOf(v) >= 0 ? v : 'target';
  throw userError_('欄位型態錯誤。');
}

function safeUrl_(u) {
  return getDriveFileId_(String(u || '')) ? String(u) : '';
}

// ==================== 讀取 ====================

// 公開資料（不含管理員資訊）。快取 60 秒；任何寫入都會清除快取。
function getPublicData_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('public_data');
  if (cached) return JSON.parse(cached);

  const team = readDoc_('team', {});
  const members = readDoc_('members', []).map(function(m) {
    m.avatarUrl = safeUrl_(m.avatarUrl);
    return m;
  });
  const photos = readDoc_('photos', []).map(function(p) {
    p.url = safeUrl_(p.url);
    return p;
  }).filter(function(p) { return p.url; });

  const data = {
    teamInfo: { title: team.title || {}, description: team.description || {}, imageUrl: safeUrl_(team.imageUrl) },
    members: members,
    extra: {
      values: readDoc_('values', []),
      timeline: readDoc_('timeline', []),
      projects: readDoc_('projects', []),
      photos: photos,
      news: readDoc_('news', []),
      contact: readDoc_('contact', [])
    },
    home: readDoc_('home', {})
  };
  try {
    cache.put('public_data', JSON.stringify(data), 60);
  } catch (e) { /* 資料過大無法快取時略過 */ }
  return data;
}

function getAdminList_() {
  const sheet = getAdminSheet_();
  const lastRow = sheet.getLastRow();
  const list = [];
  if (lastRow > 1) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i][1]) {
        list.push({
          name: String(rows[i][0] || '未命名'),
          email: String(rows[i][1] || '').toLowerCase().trim()
        });
      }
    }
  }
  return list;
}

// ==================== 寫入：團隊資料 ====================

function saveTeamImpl_(team, imageFileData) {
  requireAdmin_();
  if (!team || typeof team !== 'object') throw userError_('團隊資料格式錯誤。');

  const old = readDoc_('team', {});
  const title = cleanLoc_(team.title, 200);
  if (!title.zh && !title.en) throw userError_('團隊名稱不可為空。');

  let imageUrl = safeUrl_(old.imageUrl);
  if (imageFileData && imageFileData.base64) {
    const newUrl = uploadImageToDrive_(imageFileData.base64, imageFileData.name || 'team');
    if (imageUrl && imageUrl !== newUrl) deleteOldDriveFile_(imageUrl);
    imageUrl = newUrl;
  }

  writeDoc_('team', { title: title, description: cleanLoc_(team.description, 5000), imageUrl: imageUrl });
  audit_('saveTeam', title.zh || title.en);
  clearPublicCache_();
  return { status: 'success' };
}

// ==================== 寫入：通用項目（成員、作品、相簿、消息、歷程、聯絡、價值） ====================

function getSpec_(collection) {
  if (!Object.prototype.hasOwnProperty.call(COLLECTIONS_, collection)) throw userError_('無效的內容類別。');
  return COLLECTIONS_[collection];
}

function saveItemImpl_(collection, item, imageFileData) {
  requireAdmin_();
  const spec = getSpec_(collection);
  if (!item || typeof item !== 'object') throw userError_('資料格式錯誤。');

  const list = readDoc_(collection, []);
  const id = cleanText_(item.id || '', 100);
  const idx = id ? list.map(function(x) { return x.id; }).indexOf(id) : -1;
  const old = idx >= 0 ? list[idx] : null;

  if (!old && list.length >= 200) throw userError_('項目數量已達上限。');

  const out = { id: old ? old.id : Utilities.getUuid() };
  Object.keys(spec.fields).forEach(function(f) {
    out[f] = cleanField_(item[f], spec.fields[f]);
  });

  if (spec.required) {
    const r = out[spec.required];
    const empty = (r && typeof r === 'object') ? (!r.zh && !r.en) : !r;
    if (empty) throw userError_('必填欄位不可為空。');
  }

  if (spec.image) {
    const oldUrl = old ? safeUrl_(old[spec.image]) : '';
    let url = oldUrl;
    if (imageFileData && imageFileData.base64) {
      url = uploadImageToDrive_(imageFileData.base64, imageFileData.name || collection);
      if (oldUrl && oldUrl !== url) deleteOldDriveFile_(oldUrl);
    }
    if (spec.imageRequired && !url) throw userError_('請選擇圖片。');
    out[spec.image] = url;
  }

  if (old) list[idx] = out; else list.push(out);
  writeDoc_(collection, list);
  audit_((old ? 'update:' : 'add:') + collection, id || out.id);
  clearPublicCache_();
  return { status: 'success', id: out.id };
}

function deleteItemImpl_(collection, id) {
  requireAdmin_();
  const spec = getSpec_(collection);
  const cleanId = cleanText_(id, 100);
  if (!cleanId) throw userError_('項目 ID 不可為空。');

  const list = readDoc_(collection, []);
  const idx = list.map(function(x) { return x.id; }).indexOf(cleanId);
  if (idx >= 0) {
    if (spec.image) deleteOldDriveFile_(list[idx][spec.image]);
    list.splice(idx, 1);
    writeDoc_(collection, list);
    audit_('delete:' + collection, cleanId);
    clearPublicCache_();
  }
  return { status: 'success' };
}

function moveItemImpl_(collection, id, dir) {
  requireAdmin_();
  getSpec_(collection);
  const list = readDoc_(collection, []);
  const idx = list.map(function(x) { return x.id; }).indexOf(cleanText_(id, 100));
  const to = dir === 'up' ? idx - 1 : (dir === 'down' ? idx + 1 : -1);
  if (idx < 0 || to < 0 || to >= list.length) return { status: 'success' };
  const tmp = list[idx]; list[idx] = list[to]; list[to] = tmp;
  writeDoc_(collection, list);
  clearPublicCache_();
  return { status: 'success' };
}

// ==================== 寫入：網站文字 ====================

function saveHomeContentImpl_(home) {
  requireAdmin_();
  if (!home || typeof home !== 'object') throw userError_('資料格式錯誤。');

  const out = { texts: {} };
  const texts = home.texts && typeof home.texts === 'object' ? home.texts : {};
  TEXT_KEYS_.forEach(function(k) {
    if (Object.prototype.hasOwnProperty.call(texts, k)) {
      const v = cleanLoc_(texts[k], 600);
      if (v.zh || v.en) out.texts[k] = v;
    }
  });
  if (home.tagline) {
    const t = cleanLoc_(home.tagline, 300);
    if (t.zh || t.en) out.tagline = t;
  }
  if (home.heroTitle) {
    const h = cleanLoc_(home.heroTitle, 200);
    if (h.zh || h.en) out.heroTitle = h;
  }
  writeDoc_('home', out);
  audit_('saveHomeContent', '更新網站文字');
  clearPublicCache_();
  return { status: 'success' };
}


// ==================== 管理員 ====================

// ==================== 寫入：管理員 ====================

var MAX_ADMINS_ = 20;

// 管理員異動時寄信通知擁有者（選填：在腳本屬性設定 NOTIFY_EMAIL）。
function notifyOwner_(subject, body) {
  try {
    const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
    if (to && EMAIL_RE_.test(to.trim())) MailApp.sendEmail(to.trim(), '[團隊網站] ' + subject, body);
  } catch (e) {
    Logger.log('通知信寄送失敗：' + e.message);
  }
}

function addAdminImpl_(name, email) {
  requireAdmin_();

  const cleanName = cleanText_(name, 100);
  const cleanEmail = cleanText_(email, 200).toLowerCase();
  if (!cleanName || !cleanEmail) throw userError_('名稱與 Email 皆為必填。');
  if (!EMAIL_RE_.test(cleanEmail)) throw userError_('Email 格式錯誤。');
  const existing = getAdminEmails_();
  if (existing.includes(cleanEmail)) throw userError_('該 Email 已存在於管理員清單中。');
  if (existing.length >= MAX_ADMINS_) throw userError_('管理員人數已達上限。');

  getAdminSheet_().appendRow([safeCell_(cleanName), safeCell_(cleanEmail)]);
  audit_('addAdmin', cleanEmail);
  notifyOwner_('新增管理員', getCurrentUserEmail_() + ' 新增了管理員：' + cleanEmail);
  return { status: 'success' };
}

function removeAdminImpl_(emailToRemove) {
  requireAdmin_();

  const cleanTarget = cleanText_(emailToRemove, 200).toLowerCase();
  if (!cleanTarget) throw userError_('Email 不可為空。');
  if (getCurrentUserEmail_() === cleanTarget) {
    throw userError_('為了維護系統安全，您不能刪除自己的管理員權限。');
  }

  const sheet = getAdminSheet_();
  const data = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || '').toLowerCase().trim() === cleanTarget) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    if (getAdminEmails_().length <= 1) throw userError_('系統至少需要保留一名管理員。');
    sheet.deleteRow(targetRow);
    audit_('removeAdmin', cleanTarget);
    notifyOwner_('移除管理員', getCurrentUserEmail_() + ' 移除了管理員：' + cleanTarget);
  }
  return { status: 'success' };
}
