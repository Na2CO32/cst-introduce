# 山城資訊工作隊 網站

| 文件 | 內容 |
|---|---|
| [部署說明.md](部署說明.md) | 單機版、GitHub Pages、Apps Script 的使用與部署步驟 |
| [資安說明.md](資安說明.md) | 資安設計、威脅對照、人員流程規範 |

快速開始：

```bash
bash tools/run-all-checks.sh      # 打包並跑完所有資安與功能檢查
open dist/standalone/*.html       # 在自己電腦直接開啟單機版
```

## 建議在伺服器加的 HTTP 標頭（能設定標頭的主機才需要；GitHub Pages 不行）

```
Content-Security-Policy: default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw='; img-src 'self' data: blob: https://lh3.googleusercontent.com; connect-src https://script.google.com https://script.googleusercontent.com https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'; form-action 'none'; base-uri 'none'; object-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000
```
