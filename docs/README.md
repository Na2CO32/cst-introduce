# 山城資訊工作隊 網站

靜態網站部署在 GitHub Pages。資料由 Google Apps Script 後端提供；管理功能需由後端驗證使用者權限。

- 設定來源：專案根目錄的 `deploy.config.json`
- 產生設定：執行 `python3 tools/build.py`
- `config.js` 會由打包程式自動產生，請勿手動維護
- API 網址與 OAuth Client ID 屬於公開設定，不可在前端放置密碼、私鑰或存取權杖
- 完整部署步驟請見專案根目錄的「部署說明.md」
