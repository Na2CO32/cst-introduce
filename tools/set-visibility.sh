#!/bin/bash
# 切換 GitHub repo 的公開／私人，並同步開關 GitHub Pages 網站。
# 用法：bash tools/set-visibility.sh public    # 公開並重新上線網站
#       bash tools/set-visibility.sh private   # 改回私人（免費方案下網站會下線）
cd "$(dirname "$0")/.." || exit 1
# repo 與網站網址都從 deploy.config.json 讀取。
cfg() { python3 -c "import json,sys; print(json.load(open('deploy.config.json', encoding='utf-8')).get(sys.argv[1], ''))" "$1"; }
REPO="$(cfg github_repo)"
SITE_URL="$(cfg admin_url)"
[ -n "$REPO" ] || { echo "deploy.config.json 缺少 github_repo"; exit 1; }
case "$1" in
  public)
    gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences || exit 1
    sleep 3
    gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" > /dev/null 2>&1 \
      || gh api -X PUT "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" > /dev/null 2>&1
    echo "已設為公開，正在建置網站（約 1～2 分鐘）…"
    for i in $(seq 1 12); do
      s=$(gh api "repos/$REPO/pages/builds/latest" --jq .status 2>/dev/null)
      [ "$s" = "built" ] && break; sleep 15
    done
    echo "網站狀態：$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL")（200 代表已上線）"
    ;;
  private)
    gh repo edit "$REPO" --visibility private --accept-visibility-change-consequences && echo "已設為私人（網站已下線）。"
    ;;
  *) echo "用法：bash tools/set-visibility.sh [public|private]"; exit 1 ;;
esac
