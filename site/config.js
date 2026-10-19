// 網站執行模式與連線設定（皆為公開資訊，不含任何密鑰）。
//   MODE: 'demo'     示範模式：假資料、假登入，重新整理會還原（開發預覽用）
//         'local'    單機版：資料存在這台電腦的瀏覽器（localStorage），可新增 / 編輯，不連網
//         'api'      正式模式：連接 Apps Script 後端，管理員以 Google 帳號登入
//         'embedded' 由 Apps Script 直接提供頁面（唯讀檢視）
window.APP_CONFIG = {
  MODE: 'demo',
  // Apps Script 部署後的網頁應用程式網址（以 /exec 結尾）
  API_URL: 'https://script.google.com/macros/s/AKfycbxA7jWE7RxdBAPN77FoIJQmZfR8CFAs-qmHw9e0loebtxThZXeg1jtfCOREUBcEelEQ/exec',
  // Google Cloud 的 OAuth Web Client ID（需與 Apps Script 腳本屬性 GOOGLE_CLIENT_ID 相同）
  GOOGLE_CLIENT_ID: '請換成你的ClientID.apps.googleusercontent.com',
  // （選填）embedded 模式下，指向可登入管理的網址（例如 GitHub Pages 的網址）
  ADMIN_URL: ''
};
