#!/usr/bin/env python3
"""打包腳本：從 site/ 與 apps-script/ 產生三個交付版本到 dist/。

用法：
  python3 tools/build.py
  python3 tools/build.py --api-url https://script.google.com/macros/s/XXXX/exec \
                         --client-id 123-abc.apps.googleusercontent.com \
                         --admin-url https://你的帳號.github.io/你的repo/

產出：
  dist/github/       放到 GitHub Pages 的靜態網站（連接 Apps Script 後端，可登入管理）
  dist/apps-script/  貼到 Apps Script 的檔案（Code.gs、Index.html、appsscript.json）
  dist/standalone/   單一 HTML 檔，在自己電腦上直接雙擊開啟（不需要網路）
"""
import argparse, base64, hashlib, json, pathlib, re, shutil, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, GS, DIST = ROOT / 'site', ROOT / 'apps-script', ROOT / 'dist'

ap = argparse.ArgumentParser()
ap.add_argument('--api-url', default='')
ap.add_argument('--client-id', default='')
ap.add_argument('--admin-url', default='')
ap.add_argument('--no-config', action='store_true', help='忽略 deploy.config.json（產生未填設定的版本）')
args = ap.parse_args()

# 預設從專案根目錄的 deploy.config.json 讀取（內容皆為公開資訊：後端網址、OAuth 用戶端 ID、網站網址）。
_cfg_path = ROOT / 'deploy.config.json'
if _cfg_path.exists() and not args.no_config:
    _cfg = json.loads(_cfg_path.read_text(encoding='utf-8'))
    args.api_url = args.api_url or _cfg.get('api_url', '')
    args.client_id = args.client_id or _cfg.get('client_id', '')
    args.admin_url = args.admin_url or _cfg.get('admin_url', '')

API_URL_RE = re.compile(r'^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$')
CLIENT_RE = re.compile(r'^[0-9A-Za-z._-]+\.apps\.googleusercontent\.com$')
if args.api_url and not API_URL_RE.match(args.api_url):
    raise SystemExit('--api-url 格式不正確（應為 https://script.google.com/macros/s/.../exec）')
if args.client_id and not CLIENT_RE.match(args.client_id):
    raise SystemExit('--client-id 格式不正確（應為 ....apps.googleusercontent.com）')
from urllib.parse import urlparse

if args.admin_url:
    parsed_admin_url = urlparse(args.admin_url)

    if (
        parsed_admin_url.scheme != 'https'
        or not parsed_admin_url.hostname
        or parsed_admin_url.username
        or parsed_admin_url.password
        or parsed_admin_url.query
        or parsed_admin_url.fragment
    ):
        raise SystemExit(
            '--admin-url 必須是有效的 HTTPS 網址，'
            '且不能包含帳密、查詢參數或 fragment'
        )

read = lambda p: p.read_text(encoding='utf-8')
html_src, css_src, theme_src, app_src = read(SITE / 'index.html'), read(SITE / 'style.css'), read(SITE / 'theme-init.js'), read(SITE / 'app.js')
logo_b64 = base64.b64encode((SITE / 'logo.png').read_bytes()).decode()
fav_b64 = base64.b64encode((SITE / 'favicon.png').read_bytes()).decode()

# 內嵌進 HTML 的內容不能含有會提早結束區塊的序列
for name, src in (('app.js', app_src), ('style.css', css_src), ('theme-init.js', theme_src)):
    for bad in ('</script', '<!--', '</style'):
        if bad in src:
            raise SystemExit('%s 含有 %s，無法安全地內嵌到 HTML' % (name, bad))


def config_js(mode, api='', client='', admin=''):
    q = lambda s: json.dumps(s, ensure_ascii=False)
    return ('// 此檔由 tools/build.py 產生。以下皆為公開資訊，不含任何密鑰。\n'
            'window.APP_CONFIG = {\n  MODE: %s,\n  API_URL: %s,\n  GOOGLE_CLIENT_ID: %s,\n  ADMIN_URL: %s\n};\n'
            % (q(mode), q(api or 'https://script.google.com/macros/s/請換成你的部署ID/exec'),
               q(client or '請換成你的ClientID.apps.googleusercontent.com'), q(admin)))


def strip_versions(h):
    return re.sub(r'(\.(?:css|js))\?v=\d+', r'\1', h)


def inline_build(mode, *, csp, frame_guard, admin_url=''):
    h = strip_versions(html_src)
    theme = theme_src
    if not frame_guard:
        theme = re.sub(r'/\*FRAME_GUARD_START\*/.*?/\*FRAME_GUARD_END\*/', '/* 由 Apps Script 平台提供防嵌入保護 */', theme, flags=re.S)
    h = h.replace('<link rel="icon" type="image/png" href="favicon.png">',
                  '<link rel="icon" type="image/png" href="data:image/png;base64,%s">' % fav_b64)
    h = h.replace('<link rel="stylesheet" href="style.css">', '<style>\n%s\n</style>' % css_src)
    h = h.replace('<script src="theme-init.js"></script>', '<script>\n%s\n</script>' % theme)
    h = h.replace('<script src="config.js"></script>', '<script>\n%s\n</script>' % config_js(mode, admin=admin_url))
    h = h.replace('<script src="app.js"></script>', '<script>\n%s\n</script>' % app_src)
    h = h.replace('src="logo.png"', 'src="data:image/png;base64,%s"' % logo_b64)
    assert 'src="app.js' not in h and 'href="style.css' not in h and 'logo.png' not in h, '內嵌失敗'
    # Google 登入腳本只在 api 模式才需要（由 app.js 動態載入），內嵌版本不會用到
    h = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\s*', '', h)
    h = re.sub(r'<!--\s*內容安全政策.*?-->\s*', '', h, flags=re.S)
    if csp:
        hashes = lambda tag: ' '.join("'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode('utf-8')).digest()).decode()
                                      for m in re.findall(r'<%s>(.*?)</%s>' % (tag, tag), h, flags=re.S))
        policy = ("default-src 'none'; script-src %s; style-src %s; img-src data: blob:; font-src 'none'; connect-src 'none'; "
                  "frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'" % (hashes('script'), hashes('style')))
        h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="%s">' % policy, 1)
    else:
        h = h.replace('<html lang="zh-Hant" data-theme="light">', '<html lang="zh-Hant" data-theme="light" data-csp="host">', 1)
    return h


shutil.rmtree(DIST, ignore_errors=True)
DIST.mkdir()
written = []

# ---------- 1. GitHub Pages ----------
gh = DIST / 'github'
gh.mkdir()
for f in ('style.css', 'app.js', 'theme-init.js', 'logo.png', 'favicon.png'):
    shutil.copy(SITE / f, gh / f)
(gh / 'index.html').write_text(strip_versions(html_src), encoding='utf-8')
(gh / 'config.js').write_text(
    config_js(
        'api',
        args.api_url,
        args.client_id,
        args.admin_url
    ),
    encoding='utf-8'
)
(gh / '.nojekyll').write_text('', encoding='utf-8')
(gh / 'README.md').write_text('# 山城資訊工作隊 網站\n\n靜態網站，部署在 GitHub Pages。資料由 Google Apps Script 後端提供；管理員以 Google 帳號登入後即可編輯內容。\n\n'
                              '- 設定檔：`config.js`（填入 Apps Script 網址與 OAuth Client ID，兩者皆為公開資訊）\n'
                              '- 完整部署步驟請見專案根目錄的「部署說明.md」\n', encoding='utf-8')
written.append(('github', gh))

# ---------- 2. Apps Script ----------
asd = DIST / 'apps-script'
asd.mkdir()
code_gs = read(GS / 'Code.gs')
if args.client_id:
    assert "var BUILD_CLIENT_ID_ = '';" in code_gs
    code_gs = code_gs.replace("var BUILD_CLIENT_ID_ = '';", "var BUILD_CLIENT_ID_ = %s;" % json.dumps(args.client_id), 1)
(asd / 'Code.gs').write_text(code_gs, encoding='utf-8')
(asd / 'Index.html').write_text(inline_build('embedded', csp=False, frame_guard=False, admin_url=args.admin_url), encoding='utf-8')
shutil.copy(GS / 'appsscript.json', asd / 'appsscript.json')
written.append(('apps-script', asd))

# ---------- 3. 單機版（單一 HTML 檔） ----------
sa = DIST / 'standalone'
sa.mkdir()
(sa / '山城資訊工作隊-單機版.html').write_text(inline_build('local', csp=True, frame_guard=True), encoding='utf-8')
written.append(('standalone', sa))

# ---------- 同步 docs/（GitHub Pages 從 repo 的 docs/ 資料夾發佈） ----------
shutil.rmtree(ROOT / 'docs', ignore_errors=True)
shutil.copytree(gh, ROOT / 'docs')

# ---------- 文件 ----------
for doc in ('部署說明.md', '資安說明.md'):
    if (ROOT / doc).exists():
        shutil.copy(ROOT / doc, DIST / doc)

# ---------- 壓縮檔 ----------
for name, d in written:
    z = DIST / ('%s.zip' % name)
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(d.rglob('*')):
            if p.is_file():
                zf.write(p, p.relative_to(d))

for name, d in written:
    files = [p for p in d.rglob('*') if p.is_file()]
    print('%-12s %2d 個檔案  %7.1f KB' % (name, len(files), sum(p.stat().st_size for p in files) / 1024))
