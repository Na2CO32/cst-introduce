(function() {
  'use strict';

  const CFG = window.APP_CONFIG || {};

  // ---- 執行模式與設定檢查 ----
  const API_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  const CLIENT_ID_RE = /^[0-9A-Za-z._-]+\.apps\.googleusercontent\.com$/;
  let MODE = CFG.MODE || (CFG.DEMO_MODE ? 'demo' : 'api');
  let configNote = '';
  if (MODE === 'api' && (!API_URL_RE.test(CFG.API_URL || '') || !CLIENT_ID_RE.test(CFG.GOOGLE_CLIENT_ID || ''))) {
    // 尚未填入有效的後端設定：退回示範模式，而不是對任意網址送出請求。
    MODE = 'demo';
    configNote = 'banner_demo';
  }
  if (MODE === 'demo' && !configNote && CFG.MODE === 'demo') configNote = 'banner_demo_dev';
  if (MODE === 'local') configNote = 'banner_local';
  if (MODE === 'embedded') configNote = 'banner_embedded';
  CFG.DEMO_MODE = (MODE === 'demo' || MODE === 'local');   // 以下程式沿用此旗標代表「使用假資料來源」
  const LOCAL = MODE === 'local';
  const EMBEDDED = MODE === 'embedded';
  const LOCAL_KEY = 'team-site-local-v1';
  const root = document.documentElement;

  // ==================== 多語系 ====================

  const STR = {
    zh: {
      skip: '跳到主要內容', nav_label: '主選單', switch_lang: '切換語言', switch_theme: '切換日夜模式',
      nav_home: '首頁', nav_about: '關於我們', nav_members: '成員', nav_projects: '作品', nav_gallery: '相簿',
      nav_news: '最新消息', nav_contact: '聯絡我們', nav_admin: '管理員設定', to_top: '回到頂部',
      edit_home: '編輯網站文字', edit_home_title: '編輯網站文字', toast_home: '首頁文字已儲存',
      home_hint: '每個欄位都有中文與英文版本；欄位留空或與預設相同，就使用預設文字。團隊名稱與介紹請到「關於我們」頁編輯。',
      g_hero: '橫幅區', g_values: '價值區', g_projects: '精選作品區', g_cta: '底部邀請區',
      f_eyebrow: '小標籤', f_hero_title: '大標題（留空則使用團隊名稱）', f_tagline: '標語', f_btn1: '按鈕一', f_btn2: '按鈕二',
      f_values_title: '區塊標題', f_values_sub: '區塊副標', f_value_title: '價值 {n}：標題', f_value_text: '價值 {n}：說明',
      f_projects_title: '區塊標題', f_cta_title: '標題', f_cta_text: '說明文字',
      default_tagline: '用資訊技術，讓山城更有效率。', default_desc: '山城資訊工作隊是由一群熱愛資訊科技的學生組成的校級服務團隊，主要協助處理校園內的資訊相關事務。\n\n從電子設備的檢查與維修，到校用系統的設計與開發，我們將所學的技術運用在實際工作中，協助解決校園裡的各種資訊問題。', add_prefix: '新增', edit_prefix: '編輯',
      item_members: '成員', item_projects: '作品', item_photos: '照片', item_news: '消息', item_timeline: '歷程', item_contact: '聯絡方式', item_values: '價值',
      add_project: '+ 新增作品', add_photo: '+ 新增照片', add_news: '+ 新增消息', add_timeline: '+ 新增歷程', add_contact: '+ 新增聯絡方式', add_value: '+ 新增價值',
      lbl_email: '電子郵件', err_email: 'Email 格式錯誤。', local_login: '管理員登入（本機）', banner_demo: '目前顯示的是示範資料（尚未連接後端）。', banner_demo_dev: '開發預覽：示範資料，重新整理後會還原。', banner_local: '單機版：資料只儲存在這台電腦的瀏覽器中，不會上傳到任何地方。', banner_embedded: '這是唯讀檢視頁面。', banner_admin_link: '前往管理頁面', reset_local: '重設本機資料', confirm_reset_local: '確定要清除這台電腦上儲存的所有內容，並還原成預設內容嗎？', err_bad_response: '伺服器回應格式不正確。', lbl_title: '標題', lbl_tag: '分類', lbl_text: '說明', lbl_album: '相簿分類', lbl_caption: '照片說明', lbl_date: '日期', lbl_year: '年份',
      lbl_icon: '圖示', lbl_image: '圖片 (PNG/JPG)', lbl_image_req: '圖片 (PNG/JPG，必選)', lbl_zh: '中文', lbl_en: 'English', lbl_cur_img: '目前圖片',
      icon_target: '目標', icon_users: '人群', icon_growth: '成長', icon_mail: '信箱', icon_pin: '地點', icon_social: '社群',
      move_up: '上移', move_down: '下移', confirm_del_item: '確定要刪除這個項目嗎？此操作無法復原。', toast_saved: '已儲存', toast_deleted: '已刪除',
      err_required: '請至少用一種語言填寫必填欄位。', err_image_required: '請選擇圖片。', err_date: '請選擇日期。',
      import_defaults: '將預設內容存入網站以便編輯', toast_imported: '已匯入預設內容',
      g_nav: '導覽列', g_stats: '數據標籤', g_sections: '區塊標題與連結', g_misc: '其他文字',
      logout: '登出', loading: '載入中...', load_failed: '載入失敗', guest: '訪客', visitor_as: '一般訪客 ({email})',
      admin_as: '管理員 ({email})', demo_login: '示範登入（管理員）',
      hero_eyebrow: '團隊介紹', view_projects: '查看作品', meet_members: '認識成員', stats_label: '數據一覽',
      stat_members: '位成員', stat_projects: '件作品', stat_years: '年經驗', stat_photos: '張照片',
      values_title: '我們重視的事', values_sub: '比起漂亮的口號，我們更在意實際做出來的成果。',
      featured_projects: '精選作品', all_projects: '全部作品 →', all_photos: '查看全部照片 →', more_news: '更多消息 →',
      cta_title: '想和我們一起合作嗎？', cta_text: '無論是合作提案，或只是想聊聊，都歡迎來信。',
      edit_team: '編輯團隊介紹', history: '我們的歷程', add_member: '+ 新增成員', back_members: '← 返回成員',
      project_filter: '作品分類', album_filter: '相簿分類', all: '全部',
      admin_title: '管理員名單控制', add_admin: '+ 新增管理員',
      admin_desc: '只有列表中的 Email 能取得此系統的編輯與管理權限。',
      th_name: '姓名', th_action: '操作', self: '(目前登入者)', revoke: '刪除權限',
      rights: '版權所有', edit_team_info: '編輯團隊資訊', team_name: '團隊名稱', upload_team_img: '上傳團隊圖片 (PNG/JPG)',
      team_desc: '團隊總體介紹', member_new: '新增成員', member_edit: '編輯成員', name: '姓名', role: '職稱 / 角色',
      upload_photo: '上傳個人相片 (PNG/JPG)', resp: '分工與詳細職責', cancel: '取消', save: '儲存', processing: '處理中...',
      add_admin_title: '新增管理員', admin_name: '管理員姓名', admin_email: 'Google Email 帳號', confirm_add: '確定新增',
      confirm_ok: '確定', close: '關閉', prev: '上一張', next: '下一張', edit: '編輯', del: '刪除',
      click_hint: '點擊查看詳細負責事務 →', default_role: '團隊成員', resp_title: '詳細負責事務',
      resp_empty: '尚未填寫詳細負責事務。', no_members: '目前尚無成員資料。', no_projects: '尚無作品。',
      no_photos: '尚無照片。', no_news: '尚無消息。', no_history: '尚無資料。', no_contact: '尚未設定聯絡資訊。',
      no_values: '尚未設定。', team_default: '山城資訊工作隊', month_fmt: '{m} 月',
      toast_team: '團隊資訊已儲存', toast_member: '成員資料已儲存', toast_member_del: '已刪除成員',
      toast_admin_add: '已新增管理員', toast_admin_del: '已取消管理員權限', toast_login_admin: '已登入管理員身分', toast_logout: '已登出',
      err_no_perm: '您沒有管理員權限。', err_team_name: '團隊名稱不可為空。', err_member_name: '姓名不可為空。',
      err_admin_fields: '姓名與 Email 皆為必填項目！', err_member_missing: '找不到這位成員。',
      err_img_type: '僅支援 PNG、JPG、JPEG 圖片！', err_img_size: '圖片不可超過 10 MB。',
      err_img_proc: '瀏覽器無法處理圖片。', err_img_read: '圖片讀取失敗！',
      err_load: '載入失敗：{msg}', err_save: '儲存失敗：{msg}', err_delete: '刪除失敗：{msg}', err_add: '新增失敗：{msg}',
      confirm_del_member: '確定要刪除「{name}」嗎？此操作無法復原。', confirm_del_admin: '確定要取消 {email} 的管理員權限嗎？'
    },
    en: {
      skip: 'Skip to main content', nav_label: 'Main navigation', switch_lang: 'Switch language', switch_theme: 'Toggle light/dark mode',
      nav_home: 'Home', nav_about: 'About', nav_members: 'Members', nav_projects: 'Projects', nav_gallery: 'Gallery',
      nav_news: 'News', nav_contact: 'Contact', nav_admin: 'Admin', to_top: 'Back to top',
      edit_home: 'Edit site text', edit_home_title: 'Edit site text', toast_home: 'Home page text saved',
      home_hint: 'Every field has a Chinese and an English version. Leave a field empty or unchanged to use the default text. Edit the team name and description on the About page.',
      g_hero: 'Hero', g_values: 'Values', g_projects: 'Featured projects', g_cta: 'Contact banner',
      f_eyebrow: 'Eyebrow', f_hero_title: 'Headline (empty = team name)', f_tagline: 'Tagline', f_btn1: 'Button 1', f_btn2: 'Button 2',
      f_values_title: 'Section title', f_values_sub: 'Section subtitle', f_value_title: 'Value {n}: title', f_value_text: 'Value {n}: description',
      f_projects_title: 'Section title', f_cta_title: 'Title', f_cta_text: 'Description',
      default_tagline: 'Using technology to help our community work better.', default_desc: 'The Cyber Service Team is a school-level student service team made up of students who share a passion for technology. We help manage and support various IT-related tasks across our campus.\n\nFrom inspecting and repairing electronic equipment to designing and developing systems for school use, we put our technical skills into practice to solve real IT problems around campus.', add_prefix: 'Add ', edit_prefix: 'Edit ',
      item_members: 'member', item_projects: 'project', item_photos: 'photo', item_news: 'news item', item_timeline: 'milestone', item_contact: 'contact item', item_values: 'value',
      add_project: '+ Add project', add_photo: '+ Add photo', add_news: '+ Add news', add_timeline: '+ Add milestone', add_contact: '+ Add contact item', add_value: '+ Add value',
      lbl_email: 'Email', err_email: 'Invalid email address.', local_login: 'Admin sign-in (local)', banner_demo: 'Showing demo data (no backend connected).', banner_demo_dev: 'Development preview: demo data, resets on reload.', banner_local: 'Standalone edition: data is stored only in this browser on this computer and is never uploaded.', banner_embedded: 'This is a read-only view.', banner_admin_link: 'Go to the admin page', reset_local: 'Reset local data', confirm_reset_local: 'Clear everything stored on this computer and restore the default content?', err_bad_response: 'The server response was not in the expected format.', lbl_title: 'Title', lbl_tag: 'Category', lbl_text: 'Description', lbl_album: 'Album', lbl_caption: 'Caption', lbl_date: 'Date', lbl_year: 'Year',
      lbl_icon: 'Icon', lbl_image: 'Image (PNG/JPG)', lbl_image_req: 'Image (PNG/JPG, required)', lbl_zh: '中文', lbl_en: 'English', lbl_cur_img: 'Current image',
      icon_target: 'Target', icon_users: 'People', icon_growth: 'Growth', icon_mail: 'Mail', icon_pin: 'Location', icon_social: 'Social',
      move_up: 'Move up', move_down: 'Move down', confirm_del_item: 'Delete this item? This cannot be undone.', toast_saved: 'Saved', toast_deleted: 'Deleted',
      err_required: 'Please fill in the required field in at least one language.', err_image_required: 'Please choose an image.', err_date: 'Please choose a date.',
      import_defaults: 'Save default content to the site so it can be edited', toast_imported: 'Default content imported',
      g_nav: 'Navigation', g_stats: 'Stat labels', g_sections: 'Section titles and links', g_misc: 'Other text',
      logout: 'Sign out', loading: 'Loading...', load_failed: 'Failed to load', guest: 'Guest', visitor_as: 'Visitor ({email})',
      admin_as: 'Admin ({email})', demo_login: 'Demo sign-in (admin)',
      hero_eyebrow: 'About the team', view_projects: 'View projects', meet_members: 'Meet the team', stats_label: 'Key figures',
      stat_members: 'Members', stat_projects: 'Projects', stat_years: 'Years', stat_photos: 'Photos',
      values_title: 'What we value', values_sub: 'Less talk, more making things happen.',
      featured_projects: 'Featured projects', all_projects: 'All projects →', all_photos: 'View all photos →', more_news: 'More news →',
      cta_title: 'Want to work with us?', cta_text: 'Whether it is a partnership proposal or just a hello, we would love to hear from you.',
      edit_team: 'Edit team profile', history: 'Our journey', add_member: '+ Add member', back_members: '← Back to members',
      project_filter: 'Project categories', album_filter: 'Albums', all: 'All',
      admin_title: 'Administrators', add_admin: '+ Add administrator',
      admin_desc: 'Only the emails listed here can edit and manage this site.',
      th_name: 'Name', th_action: 'Actions', self: '(you)', revoke: 'Revoke access',
      rights: 'All rights reserved.', edit_team_info: 'Edit team profile', team_name: 'Team name', upload_team_img: 'Upload team image (PNG/JPG)',
      team_desc: 'Team description', member_new: 'Add member', member_edit: 'Edit member', name: 'Name', role: 'Title / Role',
      upload_photo: 'Upload photo (PNG/JPG)', resp: 'Responsibilities', cancel: 'Cancel', save: 'Save', processing: 'Working...',
      add_admin_title: 'Add administrator', admin_name: 'Name', admin_email: 'Google email', confirm_add: 'Add',
      confirm_ok: 'Confirm', close: 'Close', prev: 'Previous', next: 'Next', edit: 'Edit', del: 'Delete',
      click_hint: 'View responsibilities →', default_role: 'Team member', resp_title: 'Responsibilities',
      resp_empty: 'No details provided yet.', no_members: 'No members yet.', no_projects: 'No projects yet.',
      no_photos: 'No photos yet.', no_news: 'No news yet.', no_history: 'No entries yet.', no_contact: 'No contact information yet.',
      no_values: 'Not set yet.', team_default: 'Cyber Service Team', month_fmt: '{m}',
      toast_team: 'Team profile saved', toast_member: 'Member saved', toast_member_del: 'Member deleted',
      toast_admin_add: 'Administrator added', toast_admin_del: 'Administrator removed', toast_login_admin: 'Signed in as administrator', toast_logout: 'Signed out',
      err_no_perm: 'You do not have administrator permission.', err_team_name: 'Team name is required.', err_member_name: 'Name is required.',
      err_admin_fields: 'Name and email are both required.', err_member_missing: 'Member not found.',
      err_img_type: 'Only PNG and JPG images are supported.', err_img_size: 'Image must be under 10 MB.',
      err_img_proc: 'Your browser cannot process this image.', err_img_read: 'Could not read the image.',
      err_load: 'Failed to load: {msg}', err_save: 'Save failed: {msg}', err_delete: 'Delete failed: {msg}', err_add: 'Add failed: {msg}',
      confirm_del_member: 'Delete "{name}"? This cannot be undone.', confirm_del_admin: 'Remove administrator access for {email}?'
    }
  };
  const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function getLang() { return root.getAttribute('data-lang') === 'en' ? 'en' : 'zh'; }

  // 管理員可覆寫的首頁文字鍵（與後端白名單一致）。
  const HOME_KEYS = ['nav_home', 'nav_about', 'nav_members', 'nav_projects', 'nav_gallery', 'nav_news', 'nav_contact',
    'hero_eyebrow', 'view_projects', 'meet_members', 'stat_members', 'stat_projects', 'stat_years', 'stat_photos',
    'values_title', 'values_sub', 'featured_projects', 'all_projects', 'all_photos', 'more_news', 'cta_title', 'cta_text',
    'history', 'click_hint', 'default_role', 'resp_title', 'resp_empty', 'rights', 'all'];

  function baseText(key, lang) { return (STR[lang] && STR[lang][key]) || STR.zh[key] || key; }

  function textFor(key, lang) {
    const home = (typeof pageData !== 'undefined' && pageData && pageData.home) || {};
    const ov = HOME_KEYS.indexOf(key) >= 0 && home.texts && home.texts[key];
    return (ov && ov[lang]) ? String(ov[lang]) : baseText(key, lang);
  }

  function t(key, vars) {
    let s = textFor(key, getLang());
    if (vars) Object.keys(vars).forEach(function(k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  // 內容欄位可以是字串，或 {zh, en} 物件。
  function pick(v) {
    if (v && typeof v === 'object') return String(v[getLang()] || v.zh || v.en || '');
    return String(v == null ? '' : v);
  }

  const $ = function(id) { return document.getElementById(id); };

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function(el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    $('lang-label').textContent = getLang() === 'zh' ? 'EN' : '中文';
  }

  // ==================== 圖示（線條 SVG） ====================

  const ICONS = {
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.6c2 .7 3.2 2.5 3.5 5.4"/>',
    growth: '<path d="M3 20h18"/><path d="M5 16l5-5 3 3 6-7"/><path d="M15 7h4v4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    social: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'
  };
  // 四色循環：依序（或依分類名稱）分配色彩類別 c1..c4。
  function cc(i) { return 'c' + ((i % 4) + 1); }
  function hashColor(str) {
    let h = 0;
    for (let k = 0; k < str.length; k++) h = (h * 31 + str.charCodeAt(k)) >>> 0;
    return cc(h);
  }

  // 依分類在作品清單中第一次出現的順序分配顏色，確保不同分類顏色不重複（最多四色循環）。
  function tagColor(p, fallback) {
    const keys = [];
    ((pageData.extra && pageData.extra.projects) || []).forEach(function(q) {
      const k = keyOf(q.tag);
      if (k && keys.indexOf(k) < 0) keys.push(k);
    });
    const i = keys.indexOf(keyOf(p.tag));
    return i >= 0 ? cc(i) : hashColor(fallback || '');
  }

  function icon(name) {
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.target) + '</svg>';
  }

  // 預設的三項價值（網站尚未儲存任何價值時顯示）。
  const DEFAULT_VALUES = [
    { icon: 'target', title: { zh: '從問題開始', en: 'Start with the Problem' },
      text: { zh: '先弄清楚問題，再決定怎麼做。不為了使用新技術而使用新技術。', en: 'We figure out what needs solving before deciding how to build it. New tech is only useful when it serves a purpose.' } },
    { icon: 'users', title: { zh: '一起把事情做好', en: 'Better Together' },
      text: { zh: '每個人都有不同的想法和專長，透過討論、分工，讓作品慢慢成形。', en: 'Different skills, different perspectives. We share ideas, work together, and turn them into something real.' } },
    { icon: 'growth', title: { zh: '不只做得出來', en: 'Built to Be Used' },
      text: { zh: '從功能、操作到後續維護，我們希望每個作品不只可以展示，也能真正被使用。', en: 'From functionality to usability and maintenance, we build things that go beyond demos and work in the real world.' } }
  ];

  // ==================== 狀態 ====================

  let idToken = '';
  let userEmail = '';
  let isAdmin = false;
  let pageData = { teamInfo: { title: '', description: '', imageUrl: '' }, members: [], extra: {}, home: {} };
  let adminList = [];
  let currentDetailMemberId = null;
  let confirmCb = null;
  let lastFocus = null;
  let projectFilter = 'all';
  let albumFilter = 'all';
  let lbList = [];
  let lbIndex = 0;
  let loadFailed = false;
  let heroRefresh = function() {};

  // ==================== 小工具 ====================

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function isSafeImageUrl(url) {
    if (CFG.DEMO_MODE && /^data:image\/(svg\+xml|jpeg|png)/.test(url || '')) return true;
    return /^https:\/\/lh3\.googleusercontent\.com\/d\/[a-zA-Z0-9_-]+$/.test(url || '');
  }

  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">' +
    '<rect width="150" height="150" fill="#d9dee6"/><circle cx="75" cy="58" r="26" fill="#a9b2bf"/>' +
    '<path d="M25 140c4-32 26-48 50-48s46 16 50 48z" fill="#a9b2bf"/></svg>');

  function toast(message, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    $('toast-box').appendChild(el);
    setTimeout(function() { el.remove(); }, 4000);
  }
  function showError(m) { toast(m || '?', 'error'); }
  function showOk(m) { toast(m, 'ok'); }

  function clearSkeleton() {
    document.querySelectorAll('.skeleton').forEach(function(el) { el.classList.remove('skeleton'); });
  }

  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ==================== 示範模式資料 ====================

  function L(zh, en) { return { zh: zh, en: en }; }

  function demoAvatar(color, letter) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="' + color +
      '"/><text x="150" y="195" font-size="130" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">' + letter + '</text></svg>');
  }

  // 以抽象幾何圖案產生示範照片（正式上線時由管理員上傳真實照片）。
  function demoPhoto(w, h, c1, c2, kind) {
    let shapes = '';
    if (kind === 0) shapes = '<circle cx="' + w * 0.72 + '" cy="' + h * 0.3 + '" r="' + h * 0.22 + '" fill="#fff" opacity=".35"/><path d="M0 ' + h + 'L' + w * 0.4 + ' ' + h * 0.5 + 'L' + w * 0.7 + ' ' + h * 0.8 + 'L' + w + ' ' + h * 0.55 + 'V' + h + 'Z" fill="#000" opacity=".18"/>';
    if (kind === 1) shapes = '<rect x="' + w * 0.15 + '" y="' + h * 0.2 + '" width="' + w * 0.7 + '" height="' + h * 0.6 + '" rx="12" fill="#fff" opacity=".22"/><rect x="' + w * 0.28 + '" y="' + h * 0.34 + '" width="' + w * 0.44 + '" height="' + h * 0.32 + '" rx="8" fill="#000" opacity=".16"/>';
    if (kind === 2) shapes = '<circle cx="' + w * 0.3 + '" cy="' + h * 0.65 + '" r="' + h * 0.3 + '" fill="#fff" opacity=".25"/><circle cx="' + w * 0.62 + '" cy="' + h * 0.4 + '" r="' + h * 0.2 + '" fill="#000" opacity=".15"/>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#g)"/>' + shapes + '</svg>');
  }

  // 示範資料的結構與後端 getPublicData_ 回傳的完全一致，方便之後直接切換到真實後端。
  const demoDb = {
    team: {
      title: L('山城資訊工作隊', 'Cyber Service Team'),
      description: L(
        '山城資訊工作隊是由一群熱愛資訊科技的學生組成的校級服務團隊，主要協助處理校園內的資訊相關事務。\n\n從電子設備的檢查與維修，到校用系統的設計與開發，我們將所學的技術運用在實際工作中，協助解決校園裡的各種資訊問題。',
        'The Cyber Service Team is a school-level student service team made up of students who share a passion for technology. We help manage and support various IT-related tasks across our campus.\n\nFrom inspecting and repairing electronic equipment to designing and developing systems for school use, we put our technical skills into practice to solve real IT problems around campus.'),
      imageUrl: demoPhoto(1200, 420, '#0b2a55', '#3b82f6', 0)
    },
    home: { tagline: L('用資訊技術，讓山城更有效率。', 'Using technology to help our community work better.') },
    collections: {
      values: DEFAULT_VALUES.map(function(v, i) { return Object.assign({ id: 'v' + (i + 1) }, v); }),
      timeline: [
        { id: 't1', year: '2022', title: L('團隊成立', 'Team founded'), text: L('三位夥伴因共同的理念相遇，開始第一個專案。', 'Three partners with a shared vision started their first project.') },
        { id: 't2', year: '2023', title: L('推出首款產品', 'First product launch'), text: L('上線三個月累積破千位使用者。', 'Over a thousand users within three months of launch.') },
        { id: 't3', year: '2024', title: L('擴編與轉型', 'Growth and transformation'), text: L('新增設計與數據夥伴，建立完整的設計系統。', 'Added design and data specialists and built a full design system.') },
        { id: 't4', year: '2025', title: L('邁向國際', 'Going international'), text: L('開始與海外團隊合作，產品支援多語系。', 'Began collaborating with overseas teams; products now support multiple languages.') }
      ],
      projects: [
        { id: 'p1', title: L('校園活動平台', 'Campus Events Platform'), tag: L('網站', 'Web'), text: L('整合報名、簽到與回饋的活動管理系統。', 'An event system covering registration, check-in and feedback.') },
        { id: 'p2', title: L('社區導覽 App', 'Neighborhood Guide App'), tag: L('應用程式', 'App'), text: L('結合地圖與語音導覽的行動應用。', 'A mobile app combining maps with audio tours.') },
        { id: 'p3', title: L('品牌視覺重塑', 'Brand Redesign'), tag: L('設計', 'Design'), text: L('為在地品牌打造全新識別與包裝。', 'A new identity and packaging for a local brand.') },
        { id: 'p4', title: L('數據儀表板', 'Analytics Dashboard'), tag: L('網站', 'Web'), text: L('即時呈現營運指標的互動式報表。', 'Interactive reports showing live operational metrics.') },
        { id: 'p5', title: L('會員點數系統', 'Loyalty Program'), tag: L('應用程式', 'App'), text: L('從集點到兌換的完整會員體驗。', 'A complete member experience from earning to redeeming points.') },
        { id: 'p6', title: L('設計系統 2.0', 'Design System 2.0'), tag: L('設計', 'Design'), text: L('跨產品共用的元件庫與設計規範。', 'A shared component library and guidelines across products.') }
      ],
      photos: [
        { id: 'ph1', album: L('活動', 'Events'), caption: L('年度成果發表會', 'Annual showcase'), url: demoPhoto(800, 560, '#0b2a55', '#3b82f6', 1) },
        { id: 'ph2', album: L('日常', 'Daily life'), caption: L('週一晨會', 'Monday stand-up'), url: demoPhoto(600, 760, '#14396e', '#60a5fa', 2) },
        { id: 'ph3', album: L('活動', 'Events'), caption: L('設計思考工作坊', 'Design thinking workshop'), url: demoPhoto(800, 500, '#1e3a8a', '#93c5fd', 0) },
        { id: 'ph4', album: L('作品', 'Work'), caption: L('專案驗收現場', 'Project handover'), url: demoPhoto(640, 640, '#0f3a72', '#38bdf8', 1) },
        { id: 'ph5', album: L('日常', 'Daily life'), caption: L('團隊午餐', 'Team lunch'), url: demoPhoto(800, 600, '#172554', '#6366f1', 2) },
        { id: 'ph6', album: L('作品', 'Work'), caption: L('原型測試', 'Prototype testing'), url: demoPhoto(600, 800, '#1e40af', '#bfdbfe', 0) },
        { id: 'ph7', album: L('活動', 'Events'), caption: L('社群分享會', 'Community meetup'), url: demoPhoto(800, 540, '#14396e', '#7aa5ff', 1) },
        { id: 'ph8', album: L('日常', 'Daily life'), caption: L('辦公室一角', 'Our workspace'), url: demoPhoto(700, 700, '#1d4e9e', '#a5b4fc', 2) }
      ],
      news: [
        { id: 'n1', date: '2026-10-08', title: L('團隊作品入圍年度設計獎', 'Our work is shortlisted for a design award'), text: L('「社區導覽 App」入圍年度數位設計獎決選，感謝所有夥伴與使用者的支持。', '"Neighborhood Guide App" has been shortlisted for the annual digital design award. Thank you to everyone who supported us.') },
        { id: 'n2', date: '2026-09-21', title: L('新夥伴加入', 'New teammates join us'), text: L('歡迎兩位新成員加入設計與前端團隊，一起打造更多可能。', 'Welcome to two new members joining the design and front-end teams.') },
        { id: 'n3', date: '2026-08-30', title: L('暑期工作坊圓滿結束', 'Summer workshop wrapped up'), text: L('為期兩週的設計思考工作坊，共有 40 位學員完成成果發表。', 'Forty participants presented their results at the end of the two-week design thinking workshop.') }
      ],
      contact: [
        { id: 'c1', icon: 'mail', title: L('電子郵件', 'Email'), text: L('hello@example.com', 'hello@example.com') },
        { id: 'c2', icon: 'pin', title: L('地點', 'Location'), text: L('台北市中正區範例路 100 號', '100 Example Road, Zhongzheng District, Taipei') },
        { id: 'c3', icon: 'social', title: L('社群', 'Social'), text: L('@your_team_name', '@your_team_name') }
      ],
      members: [
        { id: 'd1', name: L('王小明', 'Ming Wang'), role: L('專案經理', 'Project Manager'), responsibilities: L('負責專案進度控管、跨組溝通與客戶需求整理。\n每週主持例會並追蹤風險。', 'Owns project schedules, cross-team communication and client requirements.\nLeads the weekly meeting and tracks risks.'), email: 'ming.wang@example.com', avatarUrl: demoAvatar('#1d4e9e', 'M') },
        { id: 'd2', name: L('李美玲', 'Meiling Li'), role: L('UI/UX 設計師', 'UI/UX Designer'), responsibilities: L('負責使用者研究、介面與互動設計，維護設計系統。', 'Responsible for user research, interface and interaction design, and the design system.'), email: 'meiling.li@example.com', avatarUrl: demoAvatar('#3b6fd0', 'L') },
        { id: 'd3', name: L('陳大衛', 'David Chen'), role: L('前端工程師', 'Front-end Engineer'), responsibilities: L('負責網站前端開發、效能優化與無障礙實作。', 'Responsible for front-end development, performance and accessibility.'), email: 'david.chen@example.com', avatarUrl: demoAvatar('#0f3a72', 'D') }
      ]
    },
    admins: [{ name: 'Demo Admin', email: 'demo@example.com' }]
  };

  // 與後端 COLLECTIONS_ 對應：集合名稱 -> 存放圖片網址的欄位
  const IMAGE_FIELD = { members: 'avatarUrl', photos: 'url' };

  // ---- 單機版：把資料存在這台電腦的瀏覽器（localStorage） ----
  function persistLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ team: demoDb.team, home: demoDb.home, collections: demoDb.collections, admins: demoDb.admins }));
      return true;
    } catch (e) {
      return false;   // 容量不足或瀏覽器禁止儲存
    }
  }

  function restoreLocal() {
    if (!LOCAL) return;
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw || raw.length > 8 * 1024 * 1024) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      if (saved.team && typeof saved.team === 'object') demoDb.team = saved.team;
      if (saved.home && typeof saved.home === 'object') demoDb.home = saved.home;
      if (saved.collections && typeof saved.collections === 'object') {
        Object.keys(demoDb.collections).forEach(function(k) {
          if (Array.isArray(saved.collections[k])) demoDb.collections[k] = asItems(saved.collections[k]);
        });
      }
      if (Array.isArray(saved.admins)) {
        demoDb.admins = saved.admins.filter(function(a) { return a && typeof a.name === 'string' && typeof a.email === 'string'; }).slice(0, 20);
      }
    } catch (e) { /* 資料損毀時使用預設內容 */ }
  }
  restoreLocal();

  function resetLocal() {
    askConfirm(t('confirm_reset_local'), function() {
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) {}
      location.reload();
    });
  }

  function demoApi(p) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        const mutating = ['public', 'whoami', 'getAdminList'].indexOf(p.action) < 0;
        const done = function(v) {
          if (LOCAL && mutating && !persistLocal()) return reject(new Error(t('err_save', { msg: 'storage' })));
          resolve(v === undefined ? { status: 'success' } : v);
        };
        const C = demoDb.collections;
        const clone = function(o) { return JSON.parse(JSON.stringify(o)); };
        if (p.action === 'public') {
          return done(clone({
            teamInfo: demoDb.team, members: C.members, home: demoDb.home,
            extra: { values: C.values, timeline: C.timeline, projects: C.projects, photos: C.photos, news: C.news, contact: C.contact }
          }));
        }
        if (p.action === 'whoami') return done({ isAdmin: true, email: 'demo@example.com' });
        if (p.action === 'getAdminList') return done(demoDb.admins.slice());
        if (p.action === 'addAdmin') { demoDb.admins.push({ name: p.name, email: p.email }); return done(); }
        if (p.action === 'removeAdmin') { demoDb.admins = demoDb.admins.filter(function(a) { return a.email !== p.email; }); return done(); }
        if (p.action === 'saveHomeContent') { demoDb.home = Object.assign({}, demoDb.home, p.home); return done(); }
        if (p.action === 'saveTeam') {
          demoDb.team.title = p.team.title; demoDb.team.description = p.team.description;
          if (p.image) demoDb.team.imageUrl = p.image.base64;
          return done();
        }
        if (p.action === 'saveItem') {
          const list = C[p.collection];
          if (!list) return reject(new Error('Invalid collection'));
          const item = clone(p.item);
          const imgField = IMAGE_FIELD[p.collection];
          const idx = item.id ? list.findIndex(function(x) { return x.id === item.id; }) : -1;
          const old = idx >= 0 ? list[idx] : null;
          if (imgField) item[imgField] = p.image ? p.image.base64 : (old ? old[imgField] : '');
          if (p.collection === 'photos' && !item.url) return reject(new Error(t('err_image_required')));
          if (old) list[idx] = item; else { item.id = 'x' + Date.now() + Math.floor(Math.random() * 1000); list.push(item); }
          return done();
        }
        if (p.action === 'deleteItem') {
          if (C[p.collection]) C[p.collection] = C[p.collection].filter(function(x) { return x.id !== p.id; });
          return done();
        }
        if (p.action === 'moveItem') {
          const list = C[p.collection] || [];
          const i = list.findIndex(function(x) { return x.id === p.id; });
          const to = p.dir === 'up' ? i - 1 : i + 1;
          if (i >= 0 && to >= 0 && to < list.length) { const tmp = list[i]; list[i] = list[to]; list[to] = tmp; }
          return done();
        }
        reject(new Error('Invalid request'));
      }, 200);
    });
  }

  // ==================== API ====================

  // 使用 text/plain 的簡單請求，避免瀏覽器 CORS 預檢（Apps Script 不支援 OPTIONS）。
  // 所有對後端的請求都走這裡：
  //  - credentials: 'omit'    不帶任何 Cookie，後端只認 body 裡的 ID token → 不存在 CSRF 的「自動帶憑證」條件
  //  - text/plain 簡單請求    避免 CORS 預檢（Apps Script 不支援 OPTIONS）
  //  - referrerPolicy / no-store  不洩漏來源網址、不快取回應
  //  - 限制回應大小並驗證 JSON 結構
  const MAX_RESPONSE = 20 * 1024 * 1024;

  function safeFetch(url, opts) {
    return fetch(url, Object.assign({
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors', redirect: 'follow'
    }, opts || {})).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (Number(res.headers.get('content-length') || 0) > MAX_RESPONSE) throw new Error(t('err_bad_response'));
      return res.text();
    }).then(function(text) {
      if (text.length > MAX_RESPONSE) throw new Error(t('err_bad_response'));
      let body;
      try { body = JSON.parse(text); } catch (e) { throw new Error(t('err_bad_response')); }
      if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') throw new Error(t('err_bad_response'));
      return body;
    }).then(handleBody);
  }

  function apiPost(payload) {
    if (CFG.DEMO_MODE) return demoApi(payload);
    if (EMBEDDED) return Promise.reject(new Error(t('err_no_perm')));
    return safeFetch(CFG.API_URL, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ idToken: idToken }, payload))
    });
  }

  function apiGetPublic() {
    if (CFG.DEMO_MODE) return demoApi({ action: 'public' });
    if (EMBEDDED) {
      return new Promise(function(resolve, reject) {
        if (!window.google || !google.script || !google.script.run) return reject(new Error(t('err_bad_response')));
        google.script.run.withSuccessHandler(function(d) { resolve(d); })
          .withFailureHandler(function(err) { reject(new Error(err && err.message ? err.message : 'Error')); })
          .getPublicDataForPage();
      });
    }
    return safeFetch(CFG.API_URL + '?action=public');
  }

  function handleBody(body) {
    if (!body.ok) {
      const err = new Error(String(body.error || 'Error').slice(0, 300));
      if (/登入已失效|請先登入|登入驗證失敗/.test(err.message)) signOutLocal();
      throw err;
    }
    return body.data;
  }

  // 後端（或本機儲存）傳回的資料一律先整理成預期的形狀：只接受物件／陣列，限制數量。
  // 即使資料被竄改成奇怪的格式，也不會讓畫面程式出錯。
  const COLLECTION_KEYS = ['values', 'timeline', 'projects', 'photos', 'news', 'contact'];
  function asObj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function asItems(v) {
    return (Array.isArray(v) ? v : []).filter(function(x) { return x && typeof x === 'object' && !Array.isArray(x); }).slice(0, 500);
  }
  function normalizeData(d) {
    d = asObj(d);
    const extra = asObj(d.extra);
    const out = { teamInfo: asObj(d.teamInfo), members: asItems(d.members), home: asObj(d.home), extra: {} };
    COLLECTION_KEYS.forEach(function(k) { out.extra[k] = asItems(extra[k]); });
    out.home.texts = asObj(out.home.texts);
    return out;
  }

  // ==================== 登入 ====================

  function initGoogleSignIn() {
    if (EMBEDDED) return;   // 內嵌唯讀頁面不提供登入
    if (CFG.DEMO_MODE) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-secondary btn-sm'; b.id = 'btn-demo-login';
      b.textContent = LOCAL ? t('local_login') : t('demo_login');
      b.addEventListener('click', function() { onCredential({ credential: 'demo' }); });
      $('g-signin').appendChild(b);
      return;
    }
    // 只有正式模式才載入 Google 登入腳本。
    if (!window.__gsiLoading) {
      window.__gsiLoading = true;
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    }
    if (!window.google || !google.accounts || !google.accounts.id) return setTimeout(initGoogleSignIn, 300);
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: false });
    google.accounts.id.renderButton($('g-signin'), {
      theme: root.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
      size: 'medium', text: 'signin_with', locale: getLang() === 'zh' ? 'zh-TW' : 'en'
    });
  }

  function onCredential(resp) {
    idToken = resp.credential;
    apiPost({ action: 'whoami' }).then(function(info) {
      userEmail = info.email;
      isAdmin = !!info.isAdmin;
      applyAuthState();
      // 管理員：載入管理員名單並顯示成功訊息。非管理員不顯示任何訊息，只是不會出現編輯功能。
      if (isAdmin) { loadAdminList(); showOk(t('toast_login_admin')); }
    }).catch(function(err) { showError(err.message); });
  }

  function signOutLocal() {
    idToken = ''; userEmail = ''; isAdmin = false; adminList = [];
    applyAuthState();
  }

  function logout() {
    if (!CFG.DEMO_MODE && window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    signOutLocal();
    showOk(t('toast_logout'));
  }

  // 頁面上方的模式提示（示範 / 單機 / 唯讀）。連結只接受 https 網址。
  function renderBanner() {
    const el = $('mode-banner');
    if (!el) return;
    if (!configNote) { el.classList.add('hidden'); return; }
    el.textContent = t(configNote);
    if (EMBEDDED && /^https:\/\/[^\s"'<>]+$/.test(CFG.ADMIN_URL || '')) {
      const a = document.createElement('a');
      a.href = CFG.ADMIN_URL; a.rel = 'noopener noreferrer'; a.textContent = t('banner_admin_link');
      el.appendChild(document.createTextNode(' '));
      el.appendChild(a);
    }
    el.classList.remove('hidden');
  }

  function applyAuthState() {
    $('user-status').textContent = loadFailed ? t('load_failed')
      : (isAdmin ? t('admin_as', { email: userEmail }) : (userEmail ? t('visitor_as', { email: userEmail }) : t('guest')));
    $('user-status').title = userEmail || '';
    $('g-signin').classList.toggle('hidden', !!idToken);
    $('btn-logout').classList.toggle('hidden', !idToken);
    document.querySelectorAll('.admin-only').forEach(function(el) { el.classList.toggle('hidden', !isAdmin); });
    document.querySelectorAll('.local-only').forEach(function(el) { el.classList.toggle('hidden', !(LOCAL && isAdmin)); });
    renderBanner();
    if (!isAdmin && !$('admin-page').classList.contains('hidden')) switchPage('home-page');
    renderMembers();
    renderExtras();
    observeReveals();
    renderAdminList();
  }

  // ==================== 資料載入 ====================

  function loadPublic() {
    return apiGetPublic().then(function(data) {
      pageData = normalizeData(data);
      loadFailed = false;
      clearSkeleton();
      renderAll();
    }).catch(function(err) {
      clearSkeleton();
      loadFailed = true;
      applyAuthState();
      showError(t('err_load', { msg: err.message }));
    });
  }

  function loadAdminList() {
    return apiPost({ action: 'getAdminList' }).then(function(list) {
      adminList = list || [];
      renderAdminList();
    }).catch(function(err) { showError(err.message); });
  }

  // ==================== 繪製 ====================

  function renderAll() {
    applyI18n();
    applyAuthState();
    renderTeam();
    renderMembers();
    renderExtras();
    observeReveals();
    if (currentDetailMemberId) {
      const m = findMember(currentDetailMemberId);
      if (m) renderMemberDetail(m); else backToMembers();
    }
  }

  function teamName() { return pick((pageData.teamInfo || {}).title) || t('team_default'); }

  function renderTeam() {
    const ti = pageData.teamInfo || {};
    $('team-title').textContent = teamName();
    $('team-desc').textContent = pick(ti.description) || t('default_desc');
    const img = $('team-img');
    if (isSafeImageUrl(ti.imageUrl)) {
      img.src = ti.imageUrl;
      img.alt = teamName();
      img.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
    }
  }

  // 取得某一類內容的原始陣列（成員放在最上層，其餘放在 extra）。
  function getCol(col) {
    if (col === 'members') return pageData.members || [];
    return (pageData.extra && pageData.extra[col]) || [];
  }

  function findMember(id) {
    return getCol('members').find(function(m) { return String(m.id) === String(id); });
  }

  // 管理員控制列：上移、下移、編輯、刪除。sortable=false 時不顯示上下移（例如依日期排序的消息）。
  function ctlHtml(col, item, sortable) {
    if (!isAdmin || !item || !item.id) return '';
    const list = getCol(col);
    const idx = list.indexOf(item);
    const btn = function(act, ic, label, disabled) {
      return '<button type="button" class="icon-mini' + (act === 'del' ? ' danger' : '') + '" data-item-act="' + act + '" data-col="' + col +
        '" data-id="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"' +
        (disabled ? ' disabled' : '') + '>' + icon(ic) + '</button>';
    };
    return '<div class="item-admin">' +
      (sortable ? btn('up', 'up', t('move_up'), idx <= 0) + btn('down', 'down', t('move_down'), idx >= list.length - 1) : '') +
      btn('edit', 'edit', t('edit'), false) + btn('del', 'trash', t('del'), false) + '</div>';
  }

  function renderMembers() {
    const list = $('member-list');
    list.innerHTML = '';
    const members = getCol('members');
    if (!members.length) { list.innerHTML = '<div class="empty">' + escapeHtml(t('no_members')) + '</div>'; return; }

    members.forEach(function(m) {
      const wrap = document.createElement('div');
      wrap.className = 'member-wrap';

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'member-card ' + cc(members.indexOf(m));
      const avatar = isSafeImageUrl(m.avatarUrl) ? m.avatarUrl : PLACEHOLDER;
      card.innerHTML =
        '<img src="' + escapeHtml(avatar) + '" class="member-card-avatar" alt="" loading="lazy" referrerpolicy="no-referrer">' +
        '<div class="member-card-name">' + escapeHtml(pick(m.name)) + '</div>' +
        '<div class="member-card-role">' + escapeHtml(pick(m.role) || t('default_role')) + '</div>' +
        '<div class="member-card-hint">' + escapeHtml(t('click_hint')) + '</div>';
      card.addEventListener('click', function() { openMemberDetail(m.id); });
      wrap.appendChild(card);

      const ctl = ctlHtml('members', m, true);
      if (ctl) {
        const holder = document.createElement('div');
        holder.className = 'member-card-admin';
        holder.innerHTML = ctl;
        wrap.appendChild(holder);
      }
      list.appendChild(wrap);
    });
  }

  function renderMemberDetail(member) {
    const avatar = isSafeImageUrl(member.avatarUrl) ? member.avatarUrl : PLACEHOLDER;
    $('member-detail-content').innerHTML =
      '<div class="member-detail-header ' + cc(getCol('members').indexOf(member)) + '">' +
        '<img src="' + escapeHtml(avatar) + '" class="member-detail-avatar" alt="' + escapeHtml(pick(member.name)) + '" referrerpolicy="no-referrer">' +
        '<div><h2 class="member-detail-name">' + escapeHtml(pick(member.name)) + '</h2>' +
        '<div class="member-detail-role">' + escapeHtml(pick(member.role) || t('default_role')) + '</div>' +
        (isValidEmail(member.email)
          ? '<a class="member-detail-mail" href="mailto:' + escapeHtml(member.email) + '">' + icon('mail') + '<span>' + escapeHtml(member.email) + '</span></a>'
          : '') +
        '</div>' +
      '</div>' +
      '<div class="member-detail-body"><h3>' + escapeHtml(t('resp_title')) + '</h3>' +
      '<div class="member-detail-responsibilities">' + escapeHtml(pick(member.responsibilities) || t('resp_empty')) + '</div></div>';
  }

  function formatDate(d) {
    const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return { day: '', sub: '' };
    const mon = Number(m[2]);
    return { day: m[3], sub: getLang() === 'zh' ? (m[1] + ' / ' + t('month_fmt', { m: mon })) : (MONTHS_EN[mon - 1] + ' ' + m[1]) };
  }

  function projectCardHtml(p, i, withCtl) {
    const title = pick(p.title);
    return '<article class="project-card ' + tagColor(p, title) + '"><div class="project-cover" aria-hidden="true"><span>' +
      escapeHtml(title.charAt(0).toUpperCase()) + '</span></div><div class="project-body"><span class="tag">' +
      escapeHtml(pick(p.tag)) + '</span><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(pick(p.text)) + '</p>' +
      (withCtl ? ctlHtml('projects', p, true) : '') + '</div></article>';
  }

  function newsItemHtml(n, i, withCtl) {
    const d = formatDate(n.date);
    return '<article class="news-item"><div class="news-date ' + cc(i) + '"><b>' + escapeHtml(d.day) + '</b><span>' + escapeHtml(d.sub) +
      '</span></div><div class="news-body"><h3>' + escapeHtml(pick(n.title)) + '</h3><p>' + escapeHtml(pick(n.text)) + '</p>' +
      (withCtl ? ctlHtml('news', n, false) : '') + '</div></article>';
  }

  function photoHtml(p, idx, withCtl) {
    return '<div class="photo-wrap"><button type="button" class="photo" data-photo="' + idx + '"><img src="' + escapeHtml(p.url) +
      '" alt="' + escapeHtml(pick(p.caption)) + '" loading="lazy" referrerpolicy="no-referrer"><span class="photo-cap">' +
      escapeHtml(pick(p.caption)) + '</span></button>' + (withCtl ? ctlHtml('photos', p, true) : '') + '</div>';
  }

  function allPhotos() {
    return getCol('photos').filter(function(p) { return isSafeImageUrl(p.url); });
  }

  // 價值：網站已儲存的優先；若完全沒有，顯示內建預設（此時 _default 為 true，無法逐項編輯）。
  function valuesList() {
    const own = getCol('values').filter(function(v) { return pick(v.title) || pick(v.text); });
    if (own.length) return own;
    return DEFAULT_VALUES.map(function(v) { return Object.assign({ _default: true }, v); });
  }

  function renderExtras() {
    const x = pageData.extra || {};
    const name = teamName();
    $('brand-name').textContent = name;
    $('footer-name').textContent = name;
    $('copyright').textContent = '© ' + new Date().getFullYear() + ' ' + name + (getLang() === 'zh' ? ' ' : '. ') + t('rights');
    document.title = name;
    const home = pageData.home || {};
    $('home-title').textContent = pick(home.heroTitle) || name;
    $('home-tagline').textContent = pick(home.tagline) || pick(x.tagline) || t('default_tagline');

    const projects = getCol('projects');
    const photos = allPhotos();
    const news = getCol('news').slice().sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });
    const timeline = getCol('timeline');
    const years = timeline.length ? Math.max(1, new Date().getFullYear() - Number(timeline[0].year || new Date().getFullYear()) + 1) : 0;

    $('home-stats').innerHTML = [
      [getCol('members').length, 'stat_members'], [projects.length, 'stat_projects'],
      [years, 'stat_years'], [photos.length, 'stat_photos']
    ].map(function(s, i) {
      return '<div class="stat ' + cc(i) + '"><div class="stat-num" data-target="' + s[0] + '">' + s[0] + '</div><div class="stat-label">' + escapeHtml(t(s[1])) + '</div></div>';
    }).join('');

    const values = valuesList();
    const valuesAreDefault = values.length && values[0]._default;
    $('home-values').innerHTML = values.map(function(v, i) {
      return '<div class="value-card ' + cc(i) + '"><div class="value-icon">' + icon(v.icon) + '</div><h3>' + escapeHtml(pick(v.title)) +
        '</h3><p>' + escapeHtml(pick(v.text)) + '</p>' + ctlHtml('values', v, true) + '</div>';
    }).join('') || '<div class="empty">' + escapeHtml(t('no_values')) + '</div>';
    if (valuesAreDefault && isAdmin) {
      $('home-values').insertAdjacentHTML('beforeend',
        '<div class="import-row"><button type="button" class="btn btn-secondary btn-sm" data-import-values="1">' + escapeHtml(t('import_defaults')) + '</button></div>');
    }

    $('home-projects').innerHTML = projects.slice(0, 3).map(function(p, i) { return projectCardHtml(p, i, false); }).join('') ||
      '<div class="empty">' + escapeHtml(t('no_projects')) + '</div>';
    renderProjects();

    $('home-gallery').innerHTML = photos.slice(0, 6).map(function(p, i) { return photoHtml(p, i, false); }).join('') ||
      '<div class="empty">' + escapeHtml(t('no_photos')) + '</div>';
    renderGallery();

    $('home-news').innerHTML = news.slice(0, 2).map(function(n, i) { return newsItemHtml(n, i, false); }).join('') ||
      '<div class="empty">' + escapeHtml(t('no_news')) + '</div>';
    $('news-list').innerHTML = news.map(function(n, i) { return newsItemHtml(n, i, true); }).join('') ||
      '<div class="empty">' + escapeHtml(t('no_news')) + '</div>';

    $('timeline').innerHTML = timeline.map(function(it, i) {
      return '<li class="' + cc(i) + '"><b>' + escapeHtml(it.year + '　' + pick(it.title)) + '</b><p>' + escapeHtml(pick(it.text)) + '</p>' +
        ctlHtml('timeline', it, true) + '</li>';
    }).join('') || '<li class="hint">' + escapeHtml(t('no_history')) + '</li>';

    $('contact-list').innerHTML = getCol('contact').map(function(c, i) {
      return '<div class="contact-card ' + cc(i) + '"><div class="value-icon">' + icon(c.icon) + '</div><h3>' + escapeHtml(pick(c.title)) +
        '</h3><p>' + escapeHtml(pick(c.text)) + '</p>' + ctlHtml('contact', c, true) + '</div>';
    }).join('') || '<div class="empty">' + escapeHtml(t('no_contact')) + '</div>';
  }

  function keyOf(v) { return (v && typeof v === 'object') ? (v.zh || v.en) : String(v || ''); }

  // 篩選列：以 zh（或 en）內容為鍵，切換語言後仍保持選取。
  function buildChips(boxId, items, getter, current, onPick) {
    const box = $(boxId);
    box.innerHTML = '';
    const keys = [];
    const labels = {};
    items.forEach(function(it) {
      const v = getter(it);
      const key = keyOf(v);
      if (key && keys.indexOf(key) < 0) { keys.push(key); labels[key] = pick(v); }
    });
    ['all'].concat(keys).forEach(function(k) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (k === current ? ' active' : '');
      b.textContent = k === 'all' ? t('all') : labels[k];
      b.setAttribute('aria-pressed', k === current ? 'true' : 'false');
      b.addEventListener('click', function() { onPick(k); });
      box.appendChild(b);
    });
    return keys;
  }

  function renderProjects() {
    const projects = getCol('projects');
    const keys = buildChips('project-filters', projects, function(p) { return p.tag; }, projectFilter,
      function(k) { projectFilter = k; renderProjects(); });
    if (projectFilter !== 'all' && keys.indexOf(projectFilter) < 0) projectFilter = 'all';
    const shown = projects.filter(function(p) { return projectFilter === 'all' || keyOf(p.tag) === projectFilter; });
    $('project-list').innerHTML = shown.map(function(p, i) { return projectCardHtml(p, i, true); }).join('') ||
      '<div class="empty">' + escapeHtml(t('no_projects')) + '</div>';
  }

  function shownPhotos() {
    return allPhotos().filter(function(p) { return albumFilter === 'all' || keyOf(p.album) === albumFilter; });
  }

  function renderGallery() {
    const photos = allPhotos();
    const keys = buildChips('gallery-filters', photos, function(p) { return p.album; }, albumFilter,
      function(k) { albumFilter = k; renderGallery(); });
    if (albumFilter !== 'all' && keys.indexOf(albumFilter) < 0) albumFilter = 'all';
    $('gallery-list').innerHTML = shownPhotos().map(function(p, i) { return photoHtml(p, i, true); }).join('') ||
      '<div class="empty">' + escapeHtml(t('no_photos')) + '</div>';
  }

  function renderAdminList() {
    const tbody = $('admin-table-body');
    tbody.innerHTML = '';
    if (!isAdmin) return;
    adminList.forEach(function(a) {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      const tdMail = document.createElement('td');
      const tdAct = document.createElement('td');
      tdName.textContent = a.name; tdMail.textContent = a.email;
      if (String(a.email).toLowerCase() === String(userEmail).toLowerCase()) {
        const span = document.createElement('span');
        span.className = 'hint'; span.textContent = t('self');
        tdAct.appendChild(span);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-danger btn-sm'; btn.textContent = t('revoke');
        btn.addEventListener('click', function() { deleteAdminFlow(a.email); });
        tdAct.appendChild(btn);
      }
      tr.appendChild(tdName); tr.appendChild(tdMail); tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  // ==================== 頁面切換 ====================

  function switchPage(pageId) {
    const target = $(pageId);
    if (!target) return;
    document.querySelectorAll('.page').forEach(function(p) { p.classList.add('hidden'); });
    target.classList.remove('hidden');
    currentDetailMemberId = null;
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      const on = b.getAttribute('data-page') === pageId;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    try { history.replaceState(null, '', '#' + pageId); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openMemberDetail(id) {
    const m = findMember(id);
    if (!m) return showError(t('err_member_missing'));
    currentDetailMemberId = String(m.id);
    renderMemberDetail(m);
    document.querySelectorAll('.page').forEach(function(p) { p.classList.add('hidden'); });
    $('member-detail-page').classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToMembers() { switchPage('members-page'); }

  // ==================== 主題與語言 ====================

  function toggleTheme() {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    storeSet('theme', next);
    heroRefresh();
  }

  function toggleLang() {
    const next = getLang() === 'zh' ? 'en' : 'zh';
    root.setAttribute('data-lang', next);
    root.lang = next === 'zh' ? 'zh-Hant' : 'en';
    storeSet('lang', next);
    const demoBtn = $('btn-demo-login');
    if (demoBtn) demoBtn.textContent = LOCAL ? t('local_login') : t('demo_login');
    renderAll();
    if (lbList.length && $('lightbox').style.display === 'flex') showLightbox();
  }

  // ==================== Modal / 確認 / 燈箱 ====================

  function openModal(id) {
    lastFocus = document.activeElement;
    const m = $(id);
    m.style.display = 'flex';
    const first = m.querySelector('input:not([type=hidden]),textarea,button');
    if (first) first.focus();
  }

  function closeModal(id) {
    $(id).style.display = 'none';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function askConfirm(text, cb) {
    $('confirm-text').textContent = text;
    confirmCb = cb;
    openModal('confirm-modal');
    $('confirm-no').focus();
  }

  function openLightbox(index, list) {
    lbList = list;
    lbIndex = index;
    openModal('lightbox');
    showLightbox();
  }

  function showLightbox() {
    const p = lbList[lbIndex];
    if (!p) return;
    const lbImg = $('lb-img');
    lbImg.classList.remove('lb-in');
    void lbImg.offsetWidth;
    lbImg.src = p.url;
    lbImg.alt = pick(p.caption);
    lbImg.classList.add('lb-in');
    $('lb-caption').textContent = pick(p.caption) + (p.album ? '  ·  ' + pick(p.album) : '');
    $('lb-count').textContent = (lbIndex + 1) + ' / ' + lbList.length;
    const multi = lbList.length > 1;
    $('lb-prev').classList.toggle('hidden', !multi);
    $('lb-next').classList.toggle('hidden', !multi);
  }

  function stepLightbox(d) {
    if (lbList.length < 2) return;
    lbIndex = (lbIndex + d + lbList.length) % lbList.length;
    showLightbox();
  }

  // ==================== 圖片壓縮 ====================

  function readAndCompressImage(fileInput) {
    return new Promise(function(resolve, reject) {
      const file = fileInput.files[0];
      if (!file) return resolve(null);
      if (['image/png', 'image/jpeg'].indexOf(file.type) < 0) return reject(new Error(t('err_img_type')));
      if (file.size > 10 * 1024 * 1024) return reject(new Error(t('err_img_size')));

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function() {
        URL.revokeObjectURL(url);
        let w = img.width, h = img.height;
        const maxSide = 1600;
        if (w > maxSide || h > maxSide) {
          if (w > h) { h = Math.round(h * maxSide / w); w = maxSide; }
          else { w = Math.round(w * maxSide / h); h = maxSide; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error(t('err_img_proc')));
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ base64: canvas.toDataURL('image/jpeg', 0.85), name: file.name.replace(/\.[^/.]+$/, '') + '.jpg' });
      };
      img.onerror = function() { URL.revokeObjectURL(url); reject(new Error(t('err_img_read'))); };
      img.src = url;
    });
  }

  // ==================== 管理員動作 ====================

  function requireAdminUi() {
    if (!isAdmin) { showError(t('err_no_perm')); return false; }
    return true;
  }

  function withButton(btn, idleKey, promise) {
    btn.textContent = t('processing');
    btn.disabled = true;
    return promise.finally(function() { btn.textContent = t(idleKey); btn.disabled = false; });
  }

  function openAddAdminModal() {
    if (!requireAdminUi()) return;
    $('add-admin-name').value = '';
    $('add-admin-email').value = '';
    openModal('add-admin-modal');
  }

  function saveAdminData() {
    if (!requireAdminUi()) return;
    const name = $('add-admin-name').value.trim();
    const email = $('add-admin-email').value.trim();
    if (!name || !email) return showError(t('err_admin_fields'));
    withButton($('btn-save-admin'), 'confirm_add',
      apiPost({ action: 'addAdmin', name: name, email: email }).then(function() {
        closeModal('add-admin-modal'); showOk(t('toast_admin_add')); return loadAdminList();
      }).catch(function(err) { showError(t('err_add', { msg: err.message })); }));
  }

  function deleteAdminFlow(email) {
    if (!requireAdminUi()) return;
    askConfirm(t('confirm_del_admin', { email: email }), function() {
      apiPost({ action: 'removeAdmin', email: email }).then(function() {
        showOk(t('toast_admin_del')); return loadAdminList();
      }).catch(function(err) { showError(t('err_delete', { msg: err.message })); });
    });
  }

  // ---------- 通用項目編輯器（團隊介紹、成員、作品、相簿、消息、歷程、聯絡、價值） ----------

  // 欄位型態：loc（中英文各一欄）、loc-area（多行）、text、date、icon、image。
  // required：必填欄位（loc 至少一種語言有內容）。
  const SCHEMAS = {
    team:     { fields: [['title', 'loc', 'team_name'], ['description', 'loc-area', 'team_desc'], ['imageUrl', 'image', 'upload_team_img']], required: 'title' },
    members:  { fields: [['name', 'loc', 'name'], ['role', 'loc', 'role'], ['email', 'email', 'lbl_email'], ['responsibilities', 'loc-area', 'resp'], ['avatarUrl', 'image', 'upload_photo']], required: 'name' },
    projects: { fields: [['title', 'loc', 'lbl_title'], ['tag', 'loc', 'lbl_tag'], ['text', 'loc-area', 'lbl_text']], required: 'title' },
    photos:   { fields: [['url', 'image', 'lbl_image_req'], ['album', 'loc', 'lbl_album'], ['caption', 'loc', 'lbl_caption']], imageRequired: true },
    news:     { fields: [['date', 'date', 'lbl_date'], ['title', 'loc', 'lbl_title'], ['text', 'loc-area', 'lbl_text']], required: 'title' },
    timeline: { fields: [['year', 'text', 'lbl_year'], ['title', 'loc', 'lbl_title'], ['text', 'loc-area', 'lbl_text']], required: 'title' },
    contact:  { fields: [['icon', 'icon', 'lbl_icon'], ['title', 'loc', 'lbl_title'], ['text', 'loc', 'lbl_text']], required: 'title' },
    values:   { fields: [['icon', 'icon', 'lbl_icon'], ['title', 'loc', 'lbl_title'], ['text', 'loc-area', 'lbl_text']], required: 'title' }
  };
  const ICON_CHOICES = ['target', 'users', 'growth', 'mail', 'pin', 'social'];
  let itemCtx = null;

  function isValidEmail(s) { return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(s || '')); }

  function pickLang(v, l) {
    if (v && typeof v === 'object') return String(v[l] || '');
    return String(v == null ? '' : v);
  }

  function itemTitle(col, existing) {
    if (col === 'team') return t('edit_team_info');
    return t(existing ? 'edit_prefix' : 'add_prefix') + t('item_' + col);
  }

  function openItemModal(col, item) {
    if (!requireAdminUi()) return;
    const schema = SCHEMAS[col];
    if (!schema) return;
    const existing = col === 'team' ? pageData.teamInfo : item;
    itemCtx = { col: col, id: (col !== 'team' && item && item.id) ? item.id : '', existing: existing || null };
    $('item-modal-title').textContent = itemTitle(col, col === 'team' || !!itemCtx.id);

    const form = $('item-form');
    form.innerHTML = '';
    schema.fields.forEach(function(f) {
      const key = f[0], type = f[1], label = t(f[2]);
      const row = document.createElement('div');
      row.className = 'home-row';
      const lab = document.createElement('label');
      lab.textContent = label;
      lab.setAttribute('for', 'if-' + key + (type.indexOf('loc') === 0 ? '-zh' : ''));
      row.appendChild(lab);
      const cur = existing ? existing[key] : undefined;

      if (type === 'loc' || type === 'loc-area') {
        const pair = document.createElement('div');
        pair.className = 'home-pair';
        ['zh', 'en'].forEach(function(l) {
          const cell = document.createElement('div');
          const tag = document.createElement('span');
          tag.className = 'lang-tag'; tag.textContent = t('lbl_' + l);
          const input = document.createElement(type === 'loc-area' ? 'textarea' : 'input');
          if (type === 'loc-area') input.rows = 4; else input.type = 'text';
          input.id = 'if-' + key + '-' + l;
          input.maxLength = type === 'loc-area' ? 3000 : 200;
          input.value = pickLang(cur, l);
          if (!input.value && col === 'team' && key === 'description') input.value = baseText('default_desc', l);
          cell.appendChild(tag); cell.appendChild(input);
          pair.appendChild(cell);
        });
        row.appendChild(pair);
      } else if (type === 'icon') {
        const sel = document.createElement('select');
        sel.id = 'if-' + key;
        ICON_CHOICES.forEach(function(ic) {
          const o = document.createElement('option');
          o.value = ic; o.textContent = t('icon_' + ic);
          if (cur === ic) o.selected = true;
          sel.appendChild(o);
        });
        row.appendChild(sel);
      } else if (type === 'image') {
        const file = document.createElement('input');
        file.type = 'file'; file.id = 'if-file';
        file.accept = '.png,.jpg,.jpeg,image/png,image/jpeg';
        const prev = document.createElement('img');
        prev.className = 'img-preview'; prev.id = 'if-preview'; prev.alt = '';
        if (cur && isSafeImageUrl(cur)) { prev.src = cur; } else { prev.classList.add('hidden'); }
        file.addEventListener('change', function() {
          const fl = file.files[0];
          if (fl && /^image\/(png|jpeg)$/.test(fl.type)) { prev.src = URL.createObjectURL(fl); prev.classList.remove('hidden'); }
        });
        row.appendChild(file); row.appendChild(prev);
      } else {
        const input = document.createElement('input');
        input.type = type === 'date' ? 'date' : (type === 'email' ? 'email' : 'text');
        input.id = 'if-' + key;
        input.maxLength = 200;
        input.value = cur != null ? String(cur) : (type === 'date' ? new Date().toISOString().slice(0, 10) : '');
        row.appendChild(input);
      }
      form.appendChild(row);
    });
    openModal('item-modal');
  }

  function collectItem(schema) {
    const out = {};
    schema.fields.forEach(function(f) {
      const key = f[0], type = f[1];
      if (type === 'loc' || type === 'loc-area') {
        out[key] = { zh: $('if-' + key + '-zh').value.trim(), en: $('if-' + key + '-en').value.trim() };
      } else if (type !== 'image') {
        out[key] = $('if-' + key).value.trim();
      }
    });
    return out;
  }

  function saveItem() {
    if (!requireAdminUi() || !itemCtx) return;
    const col = itemCtx.col;
    const schema = SCHEMAS[col];
    const data = collectItem(schema);

    if (schema.required) {
      const r = data[schema.required];
      if (!(r.zh || r.en)) return showError(col === 'team' ? t('err_team_name') : t('err_required'));
    }
    if (data.date !== undefined && !data.date) return showError(t('err_date'));
    if (data.email && !isValidEmail(data.email)) return showError(t('err_email'));
    const fileInput = $('if-file');
    const hasExistingImage = itemCtx.existing && schema.fields.some(function(f) { return f[1] === 'image' && itemCtx.existing[f[0]]; });
    if (schema.imageRequired && !hasExistingImage && !(fileInput && fileInput.files[0])) return showError(t('err_image_required'));

    const ctx = itemCtx;
    withButton($('btn-save-item'), 'save',
      (fileInput ? readAndCompressImage(fileInput) : Promise.resolve(null)).then(function(img) {
        if (col === 'team') return apiPost({ action: 'saveTeam', team: data, image: img });
        data.id = ctx.id;
        return apiPost({ action: 'saveItem', collection: col, item: data, image: img });
      }).then(function() {
        closeModal('item-modal'); showOk(t('toast_saved')); return loadPublic();
      }).catch(function(err) { showError(t('err_save', { msg: err.message })); }));
  }

  function deleteItemFlow(col, id) {
    if (!requireAdminUi()) return;
    askConfirm(t('confirm_del_item'), function() {
      apiPost({ action: 'deleteItem', collection: col, id: id }).then(function() {
        showOk(t('toast_deleted')); return loadPublic();
      }).catch(function(err) { showError(t('err_delete', { msg: err.message })); });
    });
  }

  function moveItemFlow(col, id, dir) {
    if (!requireAdminUi()) return;
    apiPost({ action: 'moveItem', collection: col, id: id, dir: dir }).then(loadPublic)
      .catch(function(err) { showError(err.message); });
  }

  // 把內建的預設價值逐筆存進網站，之後就能個別編輯。
  function importDefaultValues() {
    if (!requireAdminUi()) return;
    DEFAULT_VALUES.reduce(function(p, v) {
      return p.then(function() { return apiPost({ action: 'saveItem', collection: 'values', item: Object.assign({ id: '' }, v) }); });
    }, Promise.resolve()).then(function() {
      showOk(t('toast_imported')); return loadPublic();
    }).catch(function(err) { showError(t('err_save', { msg: err.message })); });
  }

  // ==================== 動態效果 ====================

  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const REVEAL_SEL = '.page-title,.block-head,.chips,.stat,.value-card,.project-card,.photo,.news-item,.member-wrap,.contact-card,' +
    '.card,.timeline li,.cta-band,.team-hero-card';
  let revealIO = null;

  function countUp(el) {
    const target = Number(el.getAttribute('data-target'));
    if (!isFinite(target) || target <= 0 || reduceMotion) return;
    const start = performance.now(), dur = 1100;
    el.textContent = '0';
    (function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  function observeReveals() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    if (!revealIO) {
      revealIO = new IntersectionObserver(function(entries) {
        entries.forEach(function(en) {
          if (!en.isIntersecting) return;
          const el = en.target;
          revealIO.unobserve(el);
          el.classList.add('in');
          const num = el.querySelector && el.querySelector('.stat-num');
          if (num) countUp(num);
          // 動畫結束後移除進場樣式，避免干擾 hover 效果。
          setTimeout(function() { el.classList.remove('reveal', 'in'); }, 1100);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    document.querySelectorAll(REVEAL_SEL).forEach(function(el) {
      if (el.getAttribute('data-rv')) return;
      el.setAttribute('data-rv', '1');
      el.classList.add('reveal');
      revealIO.observe(el);
    });
  }

  function initScrollEffects() {
    const bar = $('scroll-progress'), header = document.querySelector('.site-header'), top = $('to-top');
    let ticking = false;
    function update() {
      ticking = false;
      const y = window.scrollY || 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      header.classList.toggle('scrolled', y > 8);
      top.classList.toggle('show', y > 500);
    }
    window.addEventListener('scroll', function() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    top.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
    update();

  }


  // ==================== 首頁互動粒子網絡 ====================

  function initHeroNetwork() {
    const hero = document.querySelector('.hero');
    const cv = $('hero-canvas');
    if (!hero || !cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');

    const N = 72, AMBIENT = 26, LINK = 86, MOUSE_R = 120, MOUSE_LINK = 170;
    let W = 0, H = 0, dpr = 1, ax = 0, ay = 0, R = 160;
    let net = '#2563eb', dark = false;
    let pts = [], forms = [], formIdx = 0;
    let mx = -9999, my = -9999, inside = false, travel = 0, lastX = null, lastY = null;
    let ox = 0, oy = 0, lastSwitch = performance.now(), running = false, raf = 0, visible = true;

    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      net = cs.getPropertyValue('--net').trim() || '#2563eb';
      dark = root.getAttribute('data-theme') === 'dark';
    }

    function rng(seed) {
      let a = seed >>> 0;
      return function() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // 五種圖形：星系螺旋、同心圓、格點、波浪、星雲。座標為相對於中心點的位移。
    function buildForms() {
      const f = [];
      let a = [];
      for (let i = 0; i < N; i++) {
        const r = R * 1.05 * Math.sqrt((i + 0.5) / N), ang = i * 2.39996323;
        a.push([Math.cos(ang) * r, Math.sin(ang) * r]);
      }
      f.push(a);

      a = [];
      for (let i = 0; i < N; i++) {
        let ring, idx, cnt;
        if (i < 30) { ring = 1; idx = i; cnt = 30; } else if (i < 52) { ring = 0.66; idx = i - 30; cnt = 22; } else { ring = 0.3; idx = i - 52; cnt = 20; }
        const ang = idx / cnt * Math.PI * 2 + ring;
        a.push([Math.cos(ang) * R * ring, Math.sin(ang) * R * ring]);
      }
      f.push(a);

      a = [];
      const cols_ = 12, rows = 6;
      for (let i = 0; i < N; i++) {
        const cx = i % cols_, cy = Math.floor(i / cols_);
        a.push([(cx / (cols_ - 1) - 0.5) * R * 2.3 + (cy % 2 ? R * 0.1 : 0), (cy / (rows - 1) - 0.5) * R * 1.5]);
      }
      f.push(a);

      a = [];
      for (let i = 0; i < N; i++) {
        const k = Math.floor(i / 18), idx = i % 18, x = (idx / 17 - 0.5) * R * 2.4;
        a.push([x, (k - 1.5) * R * 0.46 + Math.sin(x / R * 3 + k * 0.9) * R * 0.26]);
      }
      f.push(a);

      a = [];
      const rd = rng(7);
      for (let i = 0; i < N; i++) {
        const ang = rd() * Math.PI * 2, r = Math.sqrt(rd());
        a.push([Math.cos(ang) * r * R * 1.25, Math.sin(ang) * r * R * 0.95]);
      }
      f.push(a);
      forms = f;
    }

    function resize() {
      const rect = hero.getBoundingClientRect();
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wide = W > 900;
      ax = wide ? W * 0.72 : W * 0.5;
      ay = wide ? H * 0.5 : H * 0.76;
      R = Math.max(90, Math.min(H * 0.36, wide ? 230 : 130));
      buildForms();
      if (!pts.length) {
        const rd = rng(21);
        for (let i = 0; i < N + AMBIENT; i++) {
          pts.push({
            x: rd() * W, y: rd() * H, vx: 0, vy: 0, amb: i >= N,
            ph: rd() * 6.28, dx: (rd() - 0.5) * 0.25, dy: (rd() - 0.5) * 0.25
          });
        }
      }
      if (reduceMotion) { snap(); draw(0); }
    }

    function snap() {
      for (let i = 0; i < N; i++) {
        pts[i].x = ax + forms[formIdx][i][0];
        pts[i].y = ay + forms[formIdx][i][1];
      }
    }

    function nextForm() {
      formIdx = (formIdx + 1) % forms.length;
      lastSwitch = performance.now();
      travel = 0;
      // 變形時給一點向外的衝力，讓過渡更有流動感。
      pts.forEach(function(p) {
        if (p.amb) return;
        const ang = Math.atan2(p.y - ay, p.x - ax);
        p.vx += Math.cos(ang) * 4; p.vy += Math.sin(ang) * 4;
      });
      if (reduceMotion) { snap(); draw(0); }
    }

    function step(now) {
      // 錨點輕微跟隨滑鼠
      const tx = inside ? Math.max(-70, Math.min(70, (mx - ax) * 0.12)) : 0;
      const ty = inside ? Math.max(-50, Math.min(50, (my - ay) * 0.12)) : 0;
      ox += (tx - ox) * 0.06; oy += (ty - oy) * 0.06;

      if (now - lastSwitch > 9000) nextForm();

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.amb) {
          p.x += p.dx + Math.sin(now * 0.0004 + p.ph) * 0.15;
          p.y += p.dy + Math.cos(now * 0.0005 + p.ph) * 0.15;
          if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
          if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        } else {
          const f = forms[formIdx][i];
          const tx2 = ax + ox + f[0] + Math.sin(now * 0.0012 + p.ph) * 5;
          const ty2 = ay + oy + f[1] + Math.cos(now * 0.0010 + p.ph) * 5;
          p.vx += (tx2 - p.x) * 0.02; p.vy += (ty2 - p.y) * 0.02;
          p.vx *= 0.86; p.vy *= 0.86;
          p.x += p.vx; p.y += p.vy;
        }
        if (inside) {
          const dx = p.x - mx, dy = p.y - my, d = Math.sqrt(dx * dx + dy * dy);
          if (d < MOUSE_R && d > 0.1) {
            const force = (1 - d / MOUSE_R) * 2.4;
            if (p.amb) { p.x += dx / d * force * 2; p.y += dy / d * force * 2; }
            else { p.vx += dx / d * force; p.vy += dy / d * force; }
          }
        }
      }
    }

    function draw(now) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.lineWidth = 1;
      // 點與點之間的連線
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          if (Math.abs(dx) > LINK || Math.abs(dy) > LINK) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            ctx.globalAlpha = (1 - d / LINK) * (dark ? 0.7 : 0.75);
            ctx.strokeStyle = net;
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
      }
      // 連向游標的線
      if (inside) {
        ctx.lineWidth = 1.3;
        for (let i = 0; i < pts.length; i++) {
          const dx = pts[i].x - mx, dy = pts[i].y - my, d = Math.sqrt(dx * dx + dy * dy);
          if (d < MOUSE_LINK) {
            ctx.globalAlpha = (1 - d / MOUSE_LINK) * 0.95;
            ctx.strokeStyle = net;
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(mx, my); ctx.stroke();
          }
        }
      }
      // 點
      ctx.globalAlpha = 1;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        let r = p.amb ? 1.8 : 3;
        if (inside) {
          const dx = p.x - mx, dy = p.y - my, d = Math.sqrt(dx * dx + dy * dy);
          if (d < MOUSE_LINK) r += (1 - d / MOUSE_LINK) * 2.2;
        }
        ctx.fillStyle = net;
        ctx.globalAlpha = p.amb ? 0.6 : 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
      }
      // 游標圓環
      if (inside) {
        ctx.globalAlpha = 0.8; ctx.strokeStyle = net; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, 6.2832); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      if (!running) return;
      step(now); draw(now);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduceMotion || !visible || document.hidden) return;
      running = true; raf = requestAnimationFrame(loop);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    function pointerPos(e) {
      const r = hero.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
    }

    hero.addEventListener('pointermove', function(e) {
      pointerPos(e); inside = true;
      if (lastX !== null) travel += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      // 滑鼠累積移動到一定距離，圖形就會變換。
      if (travel > 1500 && performance.now() - lastSwitch > 2500) nextForm();
    });
    hero.addEventListener('pointerleave', function() { inside = false; lastX = lastY = null; });
    hero.addEventListener('pointerdown', function(e) {
      if (e.target.closest && e.target.closest('button,a')) return;
      pointerPos(e); inside = true; nextForm();
    });

    readColors();
    resize();
    snap();
    heroRefresh = function() { readColors(); if (reduceMotion) draw(0); };

    if ('ResizeObserver' in window) new ResizeObserver(function() { resize(); }).observe(hero);
    else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function(en) {
        visible = en[0].isIntersecting;
        if (visible) start(); else stop();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', function() { if (document.hidden) stop(); else start(); });
    start();
    if (reduceMotion) draw(0);
  }


  // ==================== 網站文字編輯 ====================

  // 欄位定義：group 分組、label（顯示名稱）、area 是否多行、get(lang) 取目前文字、set(draft, lang, val) 寫入草稿。
  function textFields() {
    const f = [];
    const tf = function(group, key, labelKey, area) {
      f.push({ group: group, area: area, label: labelKey ? t(labelKey) : baseText(key, getLang()),
        get: function(l) { return textFor(key, l); },
        set: function(d, l, v) {
          d.texts[key] = d.texts[key] || {};
          // 與預設文字相同就不存，維持「使用預設」。
          d.texts[key][l] = (v === baseText(key, l)) ? '' : v;
        } });
    };
    ['nav_home', 'nav_about', 'nav_members', 'nav_projects', 'nav_gallery', 'nav_news', 'nav_contact'].forEach(function(k) { tf('g_nav', k); });
    tf('g_hero', 'hero_eyebrow', 'f_eyebrow', false);
    f.push({ group: 'g_hero', label: t('f_hero_title'), area: false,
      get: function(l) { const h = pageData.home || {}; return (h.heroTitle && h.heroTitle[l]) || pickLang((pageData.teamInfo || {}).title, l) || baseText('team_default', l); },
      set: function(d, l, v) { d.heroTitle[l] = (v === (pickLang((pageData.teamInfo || {}).title, l) || baseText('team_default', l))) ? '' : v; } });
    f.push({ group: 'g_hero', label: t('f_tagline'), area: true,
      get: function(l) { const h = pageData.home || {}; return (h.tagline && h.tagline[l]) || baseText('default_tagline', l); },
      set: function(d, l, v) { d.tagline[l] = (v === baseText('default_tagline', l)) ? '' : v; } });
    tf('g_hero', 'view_projects', 'f_btn1', false);
    tf('g_hero', 'meet_members', 'f_btn2', false);
    ['stat_members', 'stat_projects', 'stat_years', 'stat_photos'].forEach(function(k) { tf('g_stats', k); });
    tf('g_values', 'values_title', 'f_values_title', false);
    tf('g_values', 'values_sub', 'f_values_sub', false);
    tf('g_sections', 'featured_projects', 'f_projects_title', false);
    ['all_projects', 'all_photos', 'more_news', 'history'].forEach(function(k) { tf('g_sections', k); });
    tf('g_cta', 'cta_title', 'f_cta_title', false);
    tf('g_cta', 'cta_text', 'f_cta_text', true);
    ['click_hint', 'default_role', 'resp_title', 'resp_empty', 'rights', 'all'].forEach(function(k) { tf('g_misc', k, null, k === 'resp_empty'); });
    return f;
  }

  function openHomeModal() {
    if (!requireAdminUi()) return;
    const box = $('home-form');
    box.innerHTML = '';
    let lastGroup = '', groupEl = null;
    textFields().forEach(function(fd, idx) {
      if (fd.group !== lastGroup) {
        lastGroup = fd.group;
        groupEl = document.createElement('div');
        groupEl.className = 'home-group';
        const h4 = document.createElement('h4');
        h4.textContent = t(fd.group);
        groupEl.appendChild(h4);
        box.appendChild(groupEl);
      }
      const row = document.createElement('div');
      row.className = 'home-row';
      const lab = document.createElement('label');
      lab.textContent = fd.label;
      lab.setAttribute('for', 'home-f-' + idx + '-zh');
      row.appendChild(lab);
      const pair = document.createElement('div');
      pair.className = 'home-pair';
      ['zh', 'en'].forEach(function(l) {
        const cell = document.createElement('div');
        const tag = document.createElement('span');
        tag.className = 'lang-tag';
        tag.textContent = t('lbl_' + l);
        const input = document.createElement(fd.area ? 'textarea' : 'input');
        if (fd.area) input.rows = 3; else input.type = 'text';
        input.id = 'home-f-' + idx + '-' + l;
        input.maxLength = fd.area ? 600 : 200;
        input.value = fd.get(l);
        cell.appendChild(tag); cell.appendChild(input);
        pair.appendChild(cell);
      });
      row.appendChild(pair);
      groupEl.appendChild(row);
    });
    openModal('home-modal');
  }

  function saveHomeContent() {
    if (!requireAdminUi()) return;
    const draft = { texts: {}, tagline: { zh: '', en: '' }, heroTitle: { zh: '', en: '' } };
    textFields().forEach(function(fd, idx) {
      ['zh', 'en'].forEach(function(l) {
        fd.set(draft, l, $('home-f-' + idx + '-' + l).value.trim());
      });
    });
    withButton($('btn-save-home'), 'save',
      apiPost({ action: 'saveHomeContent', home: draft }).then(function() {
        closeModal('home-modal'); showOk(t('toast_home')); return loadPublic();
      }).catch(function(err) { showError(t('err_save', { msg: err.message })); }));
  }

  // ==================== 事件綁定 ====================

  const actions = {
    'open-team': function() { openItemModal('team', null); },
    'open-home': openHomeModal,
    'save-home': saveHomeContent,
    'save-item': saveItem,
    'back-members': backToMembers,
    'open-admin': openAddAdminModal,
    'reset-local': resetLocal,
    'save-admin': saveAdminData
  };

  document.addEventListener('click', function(e) {
    const el = e.target;
    if (!(el instanceof Element)) return;

    const pageBtn = el.closest('[data-page]');
    if (pageBtn) { e.preventDefault(); return switchPage(pageBtn.getAttribute('data-page')); }

    // 管理員：新增項目、編輯 / 刪除 / 上下移、匯入預設價值
    const addBtn = el.closest('[data-add]');
    if (addBtn) return openItemModal(addBtn.getAttribute('data-add'), null);

    const itemBtn = el.closest('[data-item-act]');
    if (itemBtn) {
      const col = itemBtn.getAttribute('data-col'), id = itemBtn.getAttribute('data-id'), act = itemBtn.getAttribute('data-item-act');
      if (act === 'edit') {
        const item = getCol(col).find(function(x) { return String(x.id) === String(id); });
        return item ? openItemModal(col, item) : showError(t('err_member_missing'));
      }
      if (act === 'del') return deleteItemFlow(col, id);
      return moveItemFlow(col, id, act);
    }

    if (el.closest('[data-import-values]')) return importDefaultValues();

    const photoBtn = el.closest('[data-photo]');
    if (photoBtn) {
      const inGallery = !!photoBtn.closest('#gallery-list');
      return openLightbox(Number(photoBtn.getAttribute('data-photo')), inGallery ? shownPhotos() : allPhotos());
    }

    const actBtn = el.closest('[data-act]');
    if (actBtn && actions[actBtn.getAttribute('data-act')]) return actions[actBtn.getAttribute('data-act')]();

    const closeBtn = el.closest('[data-close]');
    if (closeBtn) return closeModal(closeBtn.getAttribute('data-close'));

    if (el.classList.contains('modal')) closeModal(el.id);
  });

  document.addEventListener('keydown', function(e) {
    const open = Array.from(document.querySelectorAll('.modal')).filter(function(m) { return m.style.display === 'flex'; }).pop();
    if (!open) return;
    if (e.key === 'Escape') return closeModal(open.id);
    if (open.id === 'lightbox') {
      if (e.key === 'ArrowLeft') return stepLightbox(-1);
      if (e.key === 'ArrowRight') return stepLightbox(1);
    }
    if (e.key === 'Tab') {
      const f = open.querySelectorAll('input:not([type=hidden]),textarea,button:not(:disabled):not(.hidden)');
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    $('confirm-yes').addEventListener('click', function() {
      const cb = confirmCb; confirmCb = null; closeModal('confirm-modal');
      if (cb) cb();
    });
    $('confirm-no').addEventListener('click', function() { confirmCb = null; closeModal('confirm-modal'); });
    $('btn-logout').addEventListener('click', logout);
    $('btn-theme').addEventListener('click', toggleTheme);
    $('btn-lang').addEventListener('click', toggleLang);
    $('lb-prev').addEventListener('click', function() { stepLightbox(-1); });
    $('lb-next').addEventListener('click', function() { stepLightbox(1); });

    initScrollEffects();
    initHeroNetwork();
    observeReveals();
    applyI18n();
    applyAuthState();
    loadPublic();
    initGoogleSignIn();

    const h = (location.hash || '').replace('#', '');
    if (['team-page', 'members-page', 'projects-page', 'gallery-page', 'news-page', 'contact-page'].indexOf(h) >= 0) switchPage(h);
  });
})();
