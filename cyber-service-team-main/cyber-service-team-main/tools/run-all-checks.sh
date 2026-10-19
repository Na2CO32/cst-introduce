#!/bin/bash
# 一鍵執行所有資安與功能檢查。用法：bash tools/run-all-checks.sh
cd "$(dirname "$0")/.." || exit 1
fail=0
run() { echo; echo "▶ $1"; shift; "$@" > /tmp/check.out 2>&1; code=$?; tail -n 1 /tmp/check.out; [ $code -ne 0 ] && { cat /tmp/check.out | grep -E "FAIL" ; fail=1; }; }

python3 tools/build.py > /dev/null || { echo "打包失敗"; exit 1; }
run "靜態掃描：site + apps-script"        node tools/security-scan.mjs
run "靜態掃描：dist/github"               node tools/security-scan.mjs dist/github
run "靜態掃描：dist/apps-script"          node tools/security-scan.mjs dist/apps-script
run "靜態掃描：dist/standalone"           node tools/security-scan.mjs dist/standalone
run "後端資安測試（模擬 Apps Script）"      node tools/test-backend.mjs
run "前端 XSS 測試（惡意資料，有／無 CSP）"  node tools/test-frontend-xss.mjs
run "登入流程測試（管理員／非管理員／過期）"    node tools/test-frontend-login.mjs
run "三個交付版本的實機測試"                 node tools/test-builds.mjs
echo
[ $fail -eq 0 ] && echo "✅ 全部檢查通過" || echo "❌ 有檢查失敗，請看上方 FAIL 項目"
exit $fail
