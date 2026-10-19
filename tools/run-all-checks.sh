```bash
#!/bin/bash
# 一鍵執行所有資安與功能檢查。
# 用法：bash tools/run-all-checks.sh

set -u

cd "$(dirname "$0")/.." || exit 1

fail=0
log_dir="$(mktemp -d)"
trap 'rm -rf "$log_dir"' EXIT

run() {
    local name="$1"
    shift

    local log_file="$log_dir/check-$RANDOM.log"

    echo
    echo "▶ $name"
    echo "執行：$*"

    if "$@" >"$log_file" 2>&1; then
        cat "$log_file"
        echo "✅ 通過：$name"
    else
        local code=$?
        cat "$log_file"
        echo "❌ 失敗：$name（退出碼：$code）"
        fail=1
    fi
}

echo "▶ 重新產生交付版本"
if python3 tools/build.py; then
    echo "✅ 打包成功"
else
    echo "❌ 打包失敗"
    exit 1
fi

run "靜態掃描：site + apps-script" \
    node tools/security-scan.mjs

run "靜態掃描：dist/github" \
    node tools/security-scan.mjs dist/github

run "靜態掃描：dist/apps-script" \
    node tools/security-scan.mjs dist/apps-script

run "靜態掃描：dist/standalone" \
    node tools/security-scan.mjs dist/standalone

run "後端資安測試（模擬 Apps Script）" \
    node tools/test-backend.mjs

run "前端 XSS 測試（惡意資料，有／無 CSP）" \
    node tools/test-frontend-xss.mjs

run "登入流程測試（管理員／非管理員／過期）" \
    node tools/test-frontend-login.mjs

run "三個交付版本的實機測試" \
    node tools/test-builds.mjs

echo
if [ "$fail" -eq 0 ]; then
    echo "✅ 全部檢查通過"
else
    echo "❌ 有檢查失敗，請查看上方輸出"
    exit 1
fi
```
