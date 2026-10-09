# Model Canvas

[English](./README.md) | [日本語](./README.ja.md)

AIと人が一緒に、モデル・関係・制約をサンプルデータで試せる設計キャンバス。

## 開発状況

ブラウザ内で動くローカルデモです。EntityとFieldの編集、一対多Relationの接続、架空レコードでの検証を試せます。UI操作とJSON commandパネルは同じ検証付きの原子的command APIを使います。**AI・LLM・MCP接続は稼働していません。**

## ローカル起動

**Node.js 22.18以上**とnpmを使用します。APIキー、アカウント、バックエンドは不要です。

```sh
git clone https://github.com/ryoryo34/model-canvas.git
cd model-canvas
# 初期デモのPRがマージされるまでは:
git switch issue-1-initial-demo
npm ci
npm run dev
```

<http://127.0.0.1:4311> を開きます。ループバックアドレスのみで待ち受け、4311が使用中なら起動に失敗します。他のサーバーを停止したり、黙って別ポートへ移動したりしません。別ポートを指定する場合は `npm run dev -- --port 4312`。停止はCtrl+Cです。

```sh
npm run typecheck
npm test                 # 意味モデル、command、import/export、保存のテスト
npm run build            # 型チェックを含む。dist/へ出力
npm run preview          # 開発サーバー停止後、dist/をローカル配信
npx playwright install chromium  # 初回のみブラウザをダウンロード
npm run test:e2e          # 専用サーバーを起動。4311のdev/previewは先に停止
```

`npm ci` の依存インストールとChromiumの初回ダウンロードにはネットワークが必要です。インストール後のデモはモデルデータを外部サービスに送信しません。テストには架空fixtureと分離されたブラウザコンテキストを使います。

## 架空サンプルを試す

1. **Customer**と**Project**から始まります。左側またはキャンバスでEntityを選択し、インスペクターで名称変更、Field追加、Field名・型（`string`・`number`・`boolean`）・`required`を変更します。各編集はボタンで適用します。
2. カードのヘッダーをドラッグして移動します。ヘッダーにフォーカスして矢印キーでも移動できます（1回16px）。大きな配置ではキャンバスをスクロールできます。
3. **Project**のサンプル`project_draft`を選択します。初期デモには意図的に3つの問題があります。Titleが空、Budgetが`"twelve"`、Customer IDが`customer_missing`です。タイトル、`4200`などの数値、`customer_lumen`を入力し、**Apply sample**を押すと3つのエラーが消えます。
4. Customer → Projectの関係を**Disconnect**すると、線と参照検証が消えます。sourceに**Customer**、reference fieldに**Customer ID**を選んで再接続できます。既存のサンプル値は保持されます。
5. **＋ Record**でレコードを追加できます。フォームの入力は**Apply sample**を押すまでドキュメントに反映されません。booleanの`false`と数値の`0`は有効で、空入力は`null`になります。数値欄の不正な文字列は文字列のまま保持し、検証結果を表示します。
6. **Save locally**で、このブラウザ・オリジンに現在のドキュメントを明示的に保存します。再読み込みでそのスナップショットを復元し、修正途中のサンプルエラーも保持します。自動保存はありません。保存ボタンの点は読込・保存後のドキュメント変更を示します。未適用のフォーム入力は保存しません。
7. 不正なサンプル参照を修正してから**Export JSON**し、モデルを編集後に**Import JSON**すると、意味モデルと位置を復元できます。importは現在のドキュメントを置き換えますが、ローカル保存には別途保存操作が必要です。不正JSON、未対応version、未知プロパティ、重複ID、モデル・サンプルの参照切れは説明付きで拒否し、現在の状態を保持します。

必須・型エラーのあるサンプルは修正用にimportできますが、参照先レコードの欠落は先に修正してください。このため、意図的に不正な初期例はそのままではimportできません。export自体は現在のドキュメントをそのまま保持します。ローカル保存・復元は作業途中を保持するため、不正なサンプル参照も復元します。保存済みデータが破損している場合はデモを表示し、明示的に保存するまで元の保存内容を上書きしません。

## 共通command API

`src/model.ts`に`ModelDocument`、`Command`、`applyCommand`、`validateSamples`、`exportDocument`、`importDocument`を定義しています。安定IDは編集可能なラベルから独立しています。`documentVersion: 1`と`model`が意味データを持ち、`layout`がEntity IDごとの位置を持ちます。

UIのドキュメント編集はすべて`applyCommand(current, command)`を通ります。型のない入力を実行時検証し、ドキュメントをコピーして変更後の構造を検査したうえで、`{ ok: true, document }`または`{ ok: false, error }`を返します。失敗時は入力ドキュメントを変更しません。JSON commandパネルも同じ関数を使います。importは同じ構造検証に加え、サンプル参照先の欠落も拒否します。

**Command API**を開き、次の単一JSON commandを適用できます。

```json
{
  "type": "addField",
  "entityId": "project",
  "field": {
    "id": "project_notes",
    "name": "Notes",
    "type": "string",
    "required": false
  }
}
```

新しいFieldがカード、インスペクター、生成フォームに反映されます。同じcommandを再適用すると重複IDとして拒否します。対応commandは`addEntity`、`updateEntity`、`addField`、`updateField`、`addRelation`、`removeRelation`、`setSample`、`removeSample`、`moveEntity`です。`setSample`は同じ安定IDのレコードを追加・置換しますが、所属Entityは変更できません。参照されているレコードを削除すると参照エラーを表示します。Relationの参照フィールドは、名称や業務キーではなく**参照元のサンプルレコードID**を保持するstring型です。1つの参照フィールドに設定できるRelationは1つです。そのFieldをstring以外に変更する前に関係を切断してください。

型付きcommand・JSON command・実際のUI編集が同じ状態を生成することをテストしています。[検証記録](docs/VERIFICATION.md)を参照してください。

## 技術方針と制約

- TypeScript + React + Vite。HTMLカードとSVGの線を自作し、キャンバスフレームワークへの依存を省いています。実行時依存はReactとReact DOMのみ。テストはNode標準test runnerとPlaywrightを使います。`package-lock.json`にバージョンを固定し、単体テストのTypeScript実行にNode 22.18以上を使用します。公式情報: [Vite](https://vite.dev/guide/)、[React](https://react.dev/versions)、[TypeScript](https://www.typescriptlang.org/download/)。
- 小規模なローカルモデル向けです。プリミティブ型と一対多関係のみ。ネスト値、一意性制約、任意制約、Entity/Field削除、undo/redo、ズーム、移行機能はありません。ノード座標は0〜4000です。IDはEntity・Field・Relation・Sample全体で一意とし、英数字・`_`・`-`を使い、prototype関連の予約名は使えません。
- ローカル保存はブラウザ・オリジンごとで、容量制限があり、バックアップではありません。明示的に保存し、持ち運びにはJSON exportを使ってください。保存失敗を表示しても編集中のドキュメントは破棄しません。ブラウザ再読み込みで未保存の変更と未適用のフォーム入力は失われます。
- ログイン、共同編集、クラウド保存、LLM/MCPサーバー、kintone連携、本番DB生成、完全なJSON Schema exportは未実装です。将来構想を稼働中の機能として表示しません。テレメトリー、外部フォント、実行時の外部リクエストは含みません。

## 開発

[構想](docs/VISION.md)、[開発フロー](docs/WORKFLOW.md)、[Issue](https://github.com/ryoryo34/model-canvas/issues)を参照してください。1 Issueにつき1つのCodexセッションと実装ブランチを使います。このデモの範囲は[Issue #1](https://github.com/ryoryo34/model-canvas/issues/1)です。公開リポジトリには架空データのみを収録します。

## ライセンス

[MIT](LICENSE)
