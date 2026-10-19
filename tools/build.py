#!/usr/bin/env python3
"""打包腳本：從 site/ 與 apps-script/ 產生三個交付版本到 dist/。

用法：
  python3 tools/build.py
  python3 tools/build.py --api-url https://script.google.com/macros/s/XXXX/exec \
                         --client-id 123-abc.apps.googleusercontent.com \
                         --admin-url https://你的帳號.github.io/你的repo/

產出：
  dist/github/       GitHub Pages 靜態網站
  dist/apps-script/  Apps Script 部署檔案
  dist/standalone/   單一 HTML 離線版
"""

import argparse
import base64
import hashlib
import json
import pathlib
import re
import shutil
import zipfile
from urllib.parse import urlparse


ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
GS = ROOT / 'apps-script'
DIST = ROOT / 'dist'


# ---------- 命令列參數 ----------

ap = argparse.ArgumentParser()
ap.add_argument('--api-url', default='')
ap.add_argument('--client-id', default='')
ap.add_argument('--admin-url', default='')
ap.add_argument(
    '--no-config',
    action='store_true',
    help='忽略 deploy.config.json，產生未填正式設定的版本'
)
args = ap.parse_args()


# ---------- 集中讀取部署設定 ----------

cfg_path = ROOT / 'deploy.config.json'

if cfg_path.exists() and not args.no_config:
    try:
        cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError) as exc:
        raise SystemExit(
            '讀取 deploy.config.json 失敗：%s' % exc
        ) from exc

    if not isinstance(cfg, dict):
        raise SystemExit(
            'deploy.config.json 格式錯誤：最外層必須是 JSON 物件'
        )

    # 命令列參數優先；未指定時才使用設定檔。
    args.api_url = args.api_url or cfg.get('api_url', '')
    args.client_id = args.client_id or cfg.get('client_id', '')
    args.admin_url = args.admin_url or cfg.get('admin_url', '')


# ---------- 設定值驗證 ----------

API_URL_RE = re.compile(
    r'^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$'
)

CLIENT_RE = re.compile(
    r'^[0-9A-Za-z._-]+\.apps\.googleusercontent\.com$'
)


if not isinstance(args.api_url, str):
    raise SystemExit('api_url 必須是字串')

if not isinstance(args.client_id, str):
    raise SystemExit('client_id 必須是字串')

if not isinstance(args.admin_url, str):
    raise SystemExit('admin_url 必須是字串')


if args.api_url and not API_URL_RE.fullmatch(args.api_url):
    raise SystemExit(
        '--api-url 格式不正確，應為 '
        'https://script.google.com/macros/s/.../exec'
    )


if args.client_id and not CLIENT_RE.fullmatch(args.client_id):
    raise SystemExit(
        '--client-id 格式不正確，應為 '
        '....apps.googleusercontent.com'
    )


if args.admin_url:
    try:
        parsed_admin_url = urlparse(args.admin_url)

        # 存取 port 也會觸發對不合法連接埠的檢查。
        _ = parsed_admin_url.port

        if (
            parsed_admin_url.scheme != 'https'
            or not parsed_admin_url.hostname
            or parsed_admin_url.username
            or parsed_admin_url.password
            or parsed_admin_url.query
            or parsed_admin_url.fragment
            or any(ch.isspace() for ch in args.admin_url)
        ):
            raise ValueError('網址格式或組成不符合要求')

    except ValueError as exc:
        raise SystemExit(
            '--admin-url 必須是有效的 HTTPS 網址，'
            '且不能包含帳密、查詢參數、fragment 或空白。'
            '錯誤：%s' % exc
        ) from exc


# ---------- 讀取來源檔案 ----------

def read(path):
    return path.read_text(encoding='utf-8')


html_src = read(SITE / 'index.html')
css_src = read(SITE / 'style.css')
theme_src = read(SITE / 'theme-init.js')
app_src = read(SITE / 'app.js')

logo_b64 = base64.b64encode(
    (SITE / 'logo.png').read_bytes()
).decode('ascii')

fav_b64 = base64.b64encode(
    (SITE / 'favicon.png').read_bytes()
).decode('ascii')


# ---------- 內嵌內容安全檢查 ----------

# 避免 JavaScript 或 CSS 內含特殊序列，提前結束 HTML 區塊。
for name, src in (
    ('app.js', app_src),
    ('style.css', css_src),
    ('theme-init.js', theme_src),
):
    for bad in ('</script', '<!--', '</style'):
        if bad in src.lower():
            raise SystemExit(
                '%s 含有 %s，無法安全地內嵌到 HTML'
                % (name, bad)
            )


# ---------- 產生前端設定 ----------

def config_js(mode, api='', client='', admin=''):
    """產生前端設定檔。

    設定值皆是前端公開資訊，不應放置密碼、私鑰或存取權杖。
    未設定的值保留為空字串，不產生假的網址或 Client ID。
    """
    q = lambda value: json.dumps(value or '', ensure_ascii=False)

    return (
        '// 此檔由 tools/build.py 產生。'
        '以下皆為公開設定，不含密鑰。\n'
        'window.APP_CONFIG = Object.freeze({\n'
        '  MODE: %s,\n'
        '  API_URL: %s,\n'
        '  GOOGLE_CLIENT_ID: %s,\n'
        '  ADMIN_URL: %s\n'
        '});\n'
        % (
            q(mode),
            q(api),
            q(client),
            q(admin),
        )
    )


def strip_versions(html):
    """移除 CSS/JS 引用上的版本參數，避免內嵌版找不到檔案。"""
    return re.sub(r'(\.(?:css|js))\?v=\d+', r'\1', html)


def inline_build(mode, *, csp, frame_guard, admin_url=''):
    """把 CSS、JavaScript、圖片內嵌成單一 HTML。"""

    html = strip_versions(html_src)
    theme = theme_src

    if not frame_guard:
        theme = re.sub(
            r'/\*FRAME_GUARD_START\*/.*?/\*FRAME_GUARD_END\*/',
            '/* 由 Apps Script 平台提供防嵌入保護 */',
            theme,
            flags=re.S
        )

    # favicon
    html = html.replace(
        '<link rel="icon" type="image/png" href="favicon.png">',
        '<link rel="icon" type="image/png" '
        'href="data:image/png;base64,%s">' % fav_b64
    )

    # CSS
    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        '<style>\n%s\n</style>' % css_src
    )

    # 主題初始化程式
    html = html.replace(
        '<script src="theme-init.js"></script>',
        '<script>\n%s\n</script>' % theme
    )

    # Apps Script 內嵌版使用 embedded 模式。
    # API 權限與登入驗證仍由後端負責。
    html = html.replace(
        '<script src="config.js"></script>',
        '<script>\n%s\n</script>'
        % config_js(mode, admin=admin_url)
    )

    # 主程式
    html = html.replace(
        '<script src="app.js"></script>',
        '<script>\n%s\n</script>' % app_src
    )

    # Logo
    html = html.replace(
        'src="logo.png"',
        'src="data:image/png;base64,%s"' % logo_b64
    )

    # 確認需要內嵌的資源沒有遺漏。
    assert 'src="app.js' not in html, 'app.js 內嵌失敗'
    assert 'href="style.css' not in html, 'style.css 內嵌失敗'
    assert 'logo.png' not in html, 'logo.png 內嵌失敗'
    assert 'favicon.png' not in html, 'favicon.png 內嵌失敗'

    # 移除原始 CSP，依版本重新設定。
    html = re.sub(
        r'<meta http-equiv="Content-Security-Policy"[^>]*>\s*',
        '',
        html,
        flags=re.I
    )
    html = re.sub(
        r'<!--\s*內容安全政策.*?-->\s*',
        '',
        html,
        flags=re.S
    )

    if csp:
        def hashes(tag):
            matches = re.findall(
                r'<%s>(.*?)</%s>' % (tag, tag),
                html,
                flags=re.S
            )

            return ' '.join(
                "'sha256-%s'" % base64.b64encode(
                    hashlib.sha256(
                        content.encode('utf-8')
                    ).digest()
                ).decode('ascii')
                for content in matches
            )

        policy = (
            "default-src 'none'; "
            "script-src %s; "
            "style-src %s; "
            "img-src data: blob:; "
            "font-src 'none'; "
            "connect-src 'none'; "
            "frame-src 'none'; "
            "form-action 'none'; "
            "base-uri 'none'; "
            "object-src 'none'"
        ) % (hashes('script'), hashes('style'))

        html = html.replace(
            '<meta charset="utf-8">',
            '<meta charset="utf-8">\n'
            '  <meta http-equiv="Content-Security-Policy" '
            'content="%s">' % policy,
            1
        )

    else:
        html = html.replace(
            '<html lang="zh-Hant" data-theme="light">',
            '<html lang="zh-Hant" '
            'data-theme="light" data-csp="host">',
            1
        )

    return html


# ---------- 清理並建立輸出目錄 ----------

shutil.rmtree(DIST, ignore_errors=True)
DIST.mkdir(parents=True)

written = []


# ---------- 1. GitHub Pages ----------

gh = DIST / 'github'
gh.mkdir()

for filename in (
    'style.css',
    'app.js',
    'theme-init.js',
    'logo.png',
    'favicon.png',
):
    shutil.copy(SITE / filename, gh / filename)

(gh / 'index.html').write_text(
    strip_versions(html_src),
    encoding='utf-8'
)

# 正確傳入 API、Client ID 與管理網站網址。
# 這裡不再把 ADMIN_URL 固定成空字串。
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

(gh / 'README.md').write_text(
    '# 山城資訊工作隊 網站\n\n'
    '靜態網站部署在 GitHub Pages。'
    '資料由 Google Apps Script 後端提供；'
    '管理功能需由後端驗證使用者權限。\n\n'
    '- 設定來源：專案根目錄的 `deploy.config.json`\n'
    '- 產生設定：執行 `python3 tools/build.py`\n'
    '- `config.js` 會由打包程式自動產生，請勿手動維護\n'
    '- API 網址與 OAuth Client ID 屬於公開設定，'
    '不可在前端放置密碼、私鑰或存取權杖\n'
    '- 完整部署步驟請見專案根目錄的「部署說明.md」\n',
    encoding='utf-8'
)

written.append(('github', gh))


# ---------- 2. Apps Script ----------

asd = DIST / 'apps-script'
asd.mkdir()

code_gs = read(GS / 'Code.gs')

if args.client_id:
    old_client_setting = "var BUILD_CLIENT_ID_ = '';"

    if old_client_setting not in code_gs:
        raise SystemExit(
            '找不到 Code.gs 中的預期設定：'
            "var BUILD_CLIENT_ID_ = '';"
        )

    code_gs = code_gs.replace(
        old_client_setting,
        'var BUILD_CLIENT_ID_ = %s;'
        % json.dumps(args.client_id),
        1
    )

(asd / 'Code.gs').write_text(
    code_gs,
    encoding='utf-8'
)

(asd / 'Index.html').write_text(
    inline_build(
        'embedded',
        csp=False,
        frame_guard=False,
        admin_url=args.admin_url
    ),
    encoding='utf-8'
)

shutil.copy(
    GS / 'appsscript.json',
    asd / 'appsscript.json'
)

written.append(('apps-script', asd))


# ---------- 3. 單機版 ----------

sa = DIST / 'standalone'
sa.mkdir()

(sa / '山城資訊工作隊-單機版.html').write_text(
    inline_build(
        'local',
        csp=True,
        frame_guard=True
    ),
    encoding='utf-8'
)

written.append(('standalone', sa))


# ---------- 同步 docs/ ----------

# GitHub Pages 從 repo 的 docs/ 資料夾發佈。
# docs/ 是產生檔案，不應手動維護 config.js。
docs_dir = ROOT / 'docs'

shutil.rmtree(docs_dir, ignore_errors=True)
shutil.copytree(gh, docs_dir)


# ---------- 複製文件 ----------

for filename in ('部署說明.md', '資安說明.md'):
    source = ROOT / filename

    if source.exists():
        shutil.copy(source, DIST / filename)


# ---------- 建立 ZIP ----------

for name, directory in written:
    zip_path = DIST / ('%s.zip' % name)

    with zipfile.ZipFile(
        zip_path,
        'w',
        zipfile.ZIP_DEFLATED
    ) as zip_file:
        for path in sorted(directory.rglob('*')):
            if path.is_file():
                zip_file.write(
                    path,
                    path.relative_to(directory)
                )


# ---------- 輸出打包結果 ----------

for name, directory in written:
    files = [
        path for path in directory.rglob('*')
        if path.is_file()
    ]

    total_kb = sum(
        path.stat().st_size for path in files
    ) / 1024

    print(
        '%-12s %2d 個檔案  %7.1f KB'
        % (name, len(files), total_kb)
    )

print('\n打包完成。')
print('GitHub Pages 輸出：dist/github/ 與 docs/')
print('Apps Script 輸出：dist/apps-script/')
print('單機版輸出：dist/standalone/')
