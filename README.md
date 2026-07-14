# Cookie Editor

現在のタブのCookieを閲覧・編集できるChrome拡張（Manifest V3）。EditThisCookie風のアコーディオンUI。

## 機能

- 現在のタブに送信されるCookieの一覧表示（名前・値のプレビュー付き）
- クリックで展開して編集: 名前 / 値 / ドメイン / パス / 有効期限 / SameSite / Secure / HttpOnly / ホストのみ / セッション
- Cookieの追加・削除・全削除（誤操作防止の2回クリック確認）
- 名前・値でのインクリメンタル検索
- JSONエクスポート（クリップボードへコピー）/ JSONインポート

## インストール

1. Chromeで `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択

## 構成

```
manifest.json   # Manifest V3 定義
popup.html      # ポップアップUI
popup.css       # スタイル
popup.js        # Cookie API 操作ロジック
icons/          # アイコン（scripts不要・生成済みPNG）
```
# chrome-extention-edit-cookie
