# 次のCodexへの引き継ぎ

## プロジェクトと実行

- リポジトリ: https://github.com/kemuharu20001107-source/prompt-pocket
- 実行コードは `web/`。HTML/CSS/ES modulesの静的アプリ。外部ライブラリ、Lovable AI、画像生成API、データ保存サーバー、アカウント登録は使わない。
- 元のLovableプロジェクト `2d084013-8822-4206-a527-454fbb8efb40` の主要ソースを `legacy/` に保存。元プロジェクトは削除していない。
- 参照元コミット: `555b5d9dc1adc5d4662cfeeb224f93399ddd3ff0`。元のReact UIは追加された `src/lib/pp/` 基盤と接続が完了していなかったため、ビルド環境・Lovable残クレジットに依存しない静的UIへ整理した。
- Node.js 20以上: `npm run dev`、`npm test`。依存のインストールは不要。開発サーバーは既定で127.0.0.1:8000。別端末から開く場合は適切なLAN環境でHOSTを設定する。
- `file://` の直接開きはES modulesやコピー機能の制限がある。HTTP/HTTPSで配信する。
- 配信するのは `web/` の内容のみ。legacy/、tests/、docs/は配信不要。
- 実ブラウザ・実機の操作確認はユーザーが担当する方針。純粋JSの検証と実画面の確認を混同しない。

## ファイルの役割

- `web/index.html`: 日本語HTML、viewport/safe-area対応、アプリ・モーダル・通知のDOM入口
- `web/styles.css`: ライトテーマ、390px基準の下部ナビと完成文パネル、PC対応
- `web/app.js`: 作成・辞書・プリセット・履歴・設定の5画面、イベント、フォーム、コピー、JSONファイル入出力
- `web/prompt-text.js`: 完成文の分割、重み、選択の追加/解除/並び替え、手動編集と選択項目の所有範囲
- `web/store.js`: ローカル保存、データ検証、CRUD、バックアップ、破損/保存失敗対応、旧形式移行
- `web/seed.js`: 旧辞書IDを維持した初期辞書とカテゴリ
- `tests/prompt-text.test.mjs`, `tests/store.test.mjs`: Node標準テスト。変更があれば再実行する
- `scripts/serve.mjs`: Node標準HTTPの静的開発サーバー
- `.github/workflows/test.yml`: mainへのpush/PRでNode22の構文チェックとテストを実行する
- `package.json`: type=module、dev/testコマンド。外部dependenciesなし
- `legacy/`: 旧実装の参考。新アプリからはimportしない
- `README.md`: 使い方・保存範囲・バックアップ・起動・スマホチェック項目
- `docs/HANDOFF.md`: この文章

## データ構造

スキーマバージョン1。将来の変更は既存保存値の読み込み・移行とバックアップ互換性を必ず検討する。

- Category: `{id, name, emoji}`
- DictItem: `{id, label, prompt, categoryId, favorite, note, usageCount, lastUsedAt, image?, createdAt}`
- Selection: `{key, itemId, label, prompt, weight, span?: {start, end}}`
- Draft: `{text, selections}`
- Preset: `{id, name, text, selections, createdAt, updatedAt}`
- HistoryEntry: `{id, text, selections, copiedAt}`
- Settings: `{showImages, sort}`。sortはdefault/usage/name。
- AppData: `{schemaVersion, categories, items, presets, history, settings}`

Selectionのkeyは選択ごとの識別子、itemIdは辞書項目ID。辞書が後から削除されてもプリセット・履歴の完成文を読めるよう、選択時のlabel/promptを保持する。spanは完成文中でその選択が所有する範囲で、手動入力した同一語を誤って重み変更・削除しないために使う。手書き本文を選択一覧から毎回再生成しない。

## 保存

LocalStorage:
- `prompt-pocket-data-v1`: 辞書・カテゴリ・プリセット・履歴・設定
- `prompt-pocket-draft-v1`: 作成途中の本文・選択
- `prompt-pocket-recovery-v1`: 読込/置換前の復旧用データ
- `prompt-pocket-corrupt-v1`: 破損元保存値の控え

旧 `prompt-builder-store-v1` はcustomCategories/customItems/images/categoryEdits/deletedCategories/itemEdits/deletedItems/categoryOrderの差分形式。初期辞書と合成して移行する。新しい保存値があるときに旧形式で上書きしない。

保存はブラウザ・端末・オリジンごと。Lovable→別ホスト、プライベートブラウズ、異なるサブドメインでは自動で共有されない。固定公開URLを使う。ユーザーデータはGitHubへ送信されない。定期的にJSONを書き出す。

保存禁止・容量不足・不正JSONで元データを安易にリセットしない。状態通知を出し、生の保存値を書き出す/再試行/復旧を案内する。バックアップ読み込みは検査・件数確認・置換確認を経て実行する。コピー成功時だけ履歴を記録し、最大100件。利用回数は辞書からの選択・プリセット読み込みで更新する。

## 確認と次作業の優先順位

1. 公開された固定URLをiPhone Safariで開き、選択→手動編集→重み→並び替え→解除→コピーの一連の操作を確認する。
2. 390px幅・キーボード表示中・日本語変換中のフォーカス/スクロール/完成パネルの重なりを確認する。
3. 辞書/カテゴリCRUD、一括追加、お気に入り/最近/頻度、プリセット/履歴の復元を確認する。
4. 再読み込み後に保存が残ることと、JSON書出→読み込みの往復を確認する。
5. 不具合が出たら使ったURL・ブラウザ・操作順・期待結果を記録し、該当ロジックを修正する。純粋JSに関係する不具合は回帰テストを追加する。
6. 公開環境を変更するときは先にバックアップを書き出し、移行後に読み込む。端末同期/PWA等は別の追加要件として扱う。

このファイルには検証前の不具合を推測で記載しない。公開状態・検証結果・判明した未完了事項は実装完了時の説明や後続コミットと併せて確認する。

## Lovableへの依存

実行コードと日常利用にLovableへの依存はない。旧ソースとデータの参照元としてのみ残す。元Lovable URLのLocalStorageには別ホストからアクセスできない。古い辞書を持っている場合は旧環境でJSONを取得して新環境の「バックアップを読み込む」で移す必要がある。

## この実装で修正した問題

手動入力の同一語が誤って削除/重み変更される問題、複数語の重み/解除、部分括弧入力による選択喪失、細かい重みの丸め、保存取得/書込み失敗と不正JSONの上書き、インポート途中の2キー不一致、古いモーダルへの画像反映、検索キーボードと完成欄の重なり、長い本文の横はみ出しをコード上で対処した。公開ブラウザでの操作確認はユーザー担当。

初期データは既存辞書のIDを維持した62項目・20カテゴリ。削除した辞書を起動時に勝手に再投入しない。Node標準テストは本文25件・保存23件、合計48件。V8等価実行では全通過。Node実行結果はGitHub Actionsの結果を確認する。
