# WS Manual Board

ヴァイスシュヴァルツ手動対戦盤面の試作版。

## Ver.0.2：Deck Logのデッキ取り込み（試験）

- デッキコード（例：`1TK8A8`）または日本語版Deck Log URLを入力
- 日本語版Deck Log内部APIにPOSTして `list[].card_number` と `list[].num` を取得する方式
- 50枚チェック、同一番号4枚上限チェック、番号と採用枚数のプレビュー
- 操作側の盤面を初期化し、50枚のカード番号を識別子として登録（確認ダイアログあり）
- API通信がCORS等で失敗する場合は、取得済みJSONを貼り付けて解析可能
- 元のa〜n仮デッキは「初期化」で生成可能

### 制約

- Deck Logの内部API `POST https://decklog.bushiroad.com/system/app/api/view/{code}` は公式に公開された安定APIとは限りません。ブラウザからのCORS可否は未検証で、失敗する可能性があります。
- GitHub Pagesだけではサーバー側POST中継は実行できません。必要なら後からCloudflare Workers等の中継を検討します。
- **実際の `1TK8A8` のレスポンス取得と50枚の照合は未確認です。** データを推測して埋めていません。
- レベル、カード名、カード画像、効果は未登録です。取り込み後はカード番号のみ表示します。
- 現状のレベルアップ、リフレッシュなどは従来の手動試作のままです。割り込み全自動化は別途実装します。
- 単一ブラウザ試作であり、オンライン同期・アクセス制御は未実装です。

## Ver.0.3：Cloudflare Workers中継（導入準備）

`worker/worker.js` と `worker/wrangler.toml` を追加。公開後は `decklog-import.js` の `proxyBase` を実際のWorkers URLに変更する必要があります。

### 初回公開手順（Cloudflareアカウントが必要）

1. Cloudflare Workers & Pages で Worker を作成し、`worker/worker.js` の内容を登録する（またはWranglerで `worker/` ディレクトリから `npx wrangler deploy`）。
2. `ALLOWED_ORIGIN` を `https://naninunenonano.github.io` に設定する。
3. 公開された `https://<worker-name>.<subdomain>.workers.dev` を控える。
4. `decklog-import.js` の `proxyBase` を実際のURLに変更してPRで反映する。
5. `/health` がJSONを返すことと `/deck/1TK8A8` の取得結果が50枚になることを検証する。

### 安全上の制約
- 中継先は日本語版Deck Logの固定APIのみ。任意URLの代理取得は禁止。
- GET `/deck/<英数字コード>` のみ受け付け、元のJSONからデッキ名とカード番号・枚数のみ返す。
- Originを限定しているが、Originヘッダーのないサーバーアクセスは可能。認証機能ではなく、公開APIの呼び出し制限・濫用対策としては不十分。
- APIの利用条件・レート制限・応答形式は未検証。Cloudflare Workers側からの接続も未検証。
- Cloudflareのアカウント設定・Worker公開はまだ実行していません。

## Ver.0.4：手動デッキテキスト登録

Deck Logの内部APIが403を返す場合の代替。カード番号と枚数を1行ずつ入力し、50枚・同一番号4枚までを検証して登録できます。例：`FRI/S100-001 × 4`、`FRI/S100-002,3`。カード番号・枚数はユーザーが確認して入力する必要があり、デッキコードだけから自動復元する機能ではありません。
