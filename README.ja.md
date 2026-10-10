# Model Canvas

[English](./README.md) | [日本語](./README.ja.md)

AIと人が一緒に、モデル・関係・制約をサンプルデータで試せる設計キャンバス。

## 開発状況

ブラウザ内で動くローカルデモと、任意で使えるMCP + ブラウザ共有モードです。EntityとFieldの編集、一対多Relationの接続、架空レコードでの検証を試せます。UI操作とJSON commandパネルは同じ検証付きの原子的command APIを使います。ブラウザデモにはバックエンドが不要です。共有モードは実際のstdio MCPサーバーを提供します。**LLMチャットやモデルAPI呼出は含みません。**

## ローカル起動

**Node.js 22.18以上**とnpmを使用します。APIキーとアカウントは不要です。標準のブラウザデモにはバックエンドも不要です。

```sh
git clone https://github.com/ryoryo34/model-canvas.git
cd model-canvas
# 共有モードのPRがマージされるまでは:
git switch issue-3-mcp-collaboration
npm ci
npm run dev
```

<http://127.0.0.1:4311> を開きます。ループバックアドレスのみで待ち受け、4311が使用中なら起動に失敗します。他のサーバーを停止したり、黙って別ポートへ移動したりしません。別ポートを指定する場合は `npm run dev -- --port 4312`。停止はCtrl+Cです。

```sh
npm run typecheck
npm test                 # モデル・storeと実MCP + HTTP統合テスト
npm run build            # 型チェックを含む。dist/へ出力
npm run preview          # 開発サーバー停止後、dist/をローカル配信
npx playwright install chromium  # 初回のみブラウザをダウンロード
npm run test:e2e          # UIビルド後、デモは4312、共有テストは空きポートを使用
```

`npm ci` の依存インストールとChromiumの初回ダウンロードにはネットワークが必要です。インストール後のデモはモデルデータを外部サービスに送信しません。テストには架空fixtureと分離されたブラウザコンテキストを使います。4312が使用中なら`MODEL_CANVAS_TEST_PORT=4314 npm run test:e2e`で変更できます。他のサーバーを再利用・停止しません。

## 共有モード: MCP + ブラウザ

共有モードでは**1つのローカルNodeプロセス**が、正本の`DocumentStore`、stdio MCPサーバー、HTTP UIを提供します。LLMは呼び出しません。UIをビルドし、MCPホストからサーバーを起動します。

```sh
npm run build
mkdir -p work
```

stdio設定例です。絶対パスは環境に合わせて変更してください。このプロジェクトがホスト設定を書き換えることはありません。

```json
{
  "mcpServers": {
    "model-canvas": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "/absolute/path/model-canvas/server/main.ts",
        "--document",
        "/absolute/path/model-canvas/work/shared.json",
        "--port",
        "4313"
      ]
    }
  }
}
```

ホストが`node`を見つけられない場合はNode実行ファイルも絶対パスにします。stdio設定では通常のnpmスクリプトを経由せず、**`node`を直接起動**してください。npmのバナーがprotocol用stdoutに混ざるためです。サーバーはブラウザURLをstderrだけに出力します。<http://127.0.0.1:4313/?shared=1> を開くと、**Shared mode · MCP + browser**と表示します。ルートURLもここへ転送します。プロセスはホストが管理するため、ホスト側で切断・停止するとHTTPを終了してファイルロックを解放します。同じファイル・ポート用に別サーバーを起動しないでください。ポート使用中なら、他のプロセスを止めず起動に失敗します。

共有サーバーをブラウザだけで試す場合は、ターミナルで`npm run shared -- --document "$PWD/work/shared.json" --port 4313`を実行し、stdinを開いたままにします。停止はCtrl+Cです。これだけではMCPクライアントは接続しません。別モデルを使うには起動時のファイルパスを変更します。toolから任意パスを読み書きする機能はありません。

### ツールとトランザクション

- `get_document {}`は`{ revision, document }`を返します。
- `apply_commands { expectedRevision, commands }`は成功時に`{ ok, revision, document }`を返します。下記command APIのcommandを1〜100件指定します。各commandは既存`applyCommand`を使用し、全件成功時だけ1回保存してrevisionを1つ進めます。途中のcommand失敗、古いrevision、保存失敗では何も確定しません。アプリケーションエラーには`code`、`error`、現在の`revision`を含め、MCPの`isError`を設定します。競合時は再取得して変更内容を見直し、無条件に再送しないでください。
- `validate_samples {}`はモデルを変更せず`{ revision, diagnostics }`を返します。

入出力JSON SchemaはMCPの`listTools`で取得でき、結果にはtextとstructured contentを含みます。revision 0を取得した後の例です。

```json
{
  "expectedRevision": 0,
  "commands": [
    {
      "type": "addEntity",
      "entity": { "id": "milestone", "name": "Milestone", "fields": [] },
      "position": { "x": 80, "y": 300 }
    },
    {
      "type": "updateEntity",
      "entityId": "milestone",
      "name": "Release milestone"
    }
  ]
}
```

ブラウザを開いたまま実行するとカードが追加されます。インスペクターで名称を変更し、`get_document`を呼ぶと画面の変更を取得できます。`npm test`は実SDKクライアントとサーバーをstdioで接続してinitialize・一覧・取得・編集・検証を行います。`npm run test:e2e`はUIをビルドし、実Chromiumと同じSDK transportで往復を確認します。モデルAPIキーは不要です。**Codex/Claudeホストへの設定と、LLMが操作する実エージェントセッションは未確認です。**

### 同期と永続化

接続中はブラウザが750msごとに共有スナップショットを取得します。UI commandは表示中のrevisionを使い、サーバー保存後だけ成功を表示します。フォームやドラッグを編集するまでは外部更新を自動反映します。別フォームの未送信入力を保護するため、一度編集すると送信成功後もdraft保護を維持します。その後に別の書き手が更新すると、pollingを止めて再読込を案内します。競合・保存失敗・通信断では表示モデルとフォーム入力を保持し、追加送信を止め、**Reload shared document (discard drafts)**を必要とします。未送信テキストは先にコピーしてください。Export JSONに含まれるのは表示モデルのみで、draftは含みません。再読込は取得成功後にdraftを破棄し、再接続失敗時は保持します。自動マージやオフライン再送はありません。応答だけ失われた場合は保存済みの可能性があるため、再送前に状態を確認してください。ブラウザ再読み込み・終了ではdraftが失われることがあり、未保存警告をブラウザに要求します。

適用した共有編集は起動時指定ファイルへ自動保存し、localStorageの読込・書込は行いません。共有モードでは**Import JSON**と**Save locally**を無効にし、**Export JSON**は使用できます。既存モデルで開始するには、サーバーを停止してexport済み`ModelDocument`を起動ファイルに指定します（revision 0で読込）。ファイルがなければ架空デモから開始します。親ディレクトリは事前に作成してください。最初の編集成功時に`{ storeVersion: 1, revision, document }`形式で保存し、再起動時には修正途中のサンプルエラーを含めて復元します。

不正ファイル、未対応version、ディレクトリ、symlinkはリセットせず拒否します。同じディレクトリ内の権限制限付き一時ファイルへ書き込み、flush後にatomic renameしてからメモリを更新します。`.lock`により、同じ正規化パスを使う別の対応プロセスの同時起動を拒否します。クラッシュ・SIGKILL後にはロックや一時ファイルが残ることがあります。記録されたPIDがそのドキュメントを使用していないことを確認し、ファイルをバックアップしてから、古いロック・一時ファイルだけを削除してください。ロック復旧のためにドキュメントを削除しないでください。サーバー稼働中は外部からファイルを編集しないでください。ローカルファイルシステムを使用し、ネットワークファイルシステム、hard-link経由の別名、停電時の耐久性は保証対象外です。

### ローカルの保護と制限

HTTPは`127.0.0.1`だけにbindします。Host/Originの完全一致、Fetch Metadata、API必須ヘッダー`X-Model-Canvas: 1`、JSON限定の書込、CORSを許可しない構成で、別サイトからのブラウザアクセスを拒否します。HTTP APIはブラウザ用の接続経路で、MCP HTTP transportではありません。ローカルプロセスは信頼する前提で、多人数向けの認証サービスではありません。プロキシやインターネットに公開しないでください。

request・stdioバッファは1 MiB、batchは100 command、保存ドキュメントは4 MiBまでです。storeエラーは500文字、MCPエラーテキストは1,000文字までとし、起動・transportエラーで入力やstack traceを出力しません。stdioの上限超過では接続を終了します。同期的なatomic保存で書き手を直列化し、小規模モデルを対象にします。クラウド、テレメトリー、有料API、自然言語チャット、ユーザー設定変更は含みません。

## 架空サンプルを試す

以下は標準のブラウザ単独モード（`npm run dev`）の手順です。

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

ブラウザ単独モードでは、UIのドキュメント編集はすべて`applyCommand(current, command)`を通ります。型のない入力を実行時検証し、ドキュメントをコピーして変更後の構造を検査したうえで、`{ ok: true, document }`または`{ ok: false, error }`を返します。失敗時は入力ドキュメントを変更しません。JSON commandパネルも同じ関数を使います。importは同じ構造検証に加え、サンプル参照先の欠落も拒否します。

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

- TypeScript + React + Vite。HTMLカードとSVGの線を自作し、キャンバスフレームワークへの依存を省いています。実行時依存はReact、React DOM、公式`@modelcontextprotocol/server` 2.3.1、Zod 4.6.5です。公式`@modelcontextprotocol/client` 2.3.1はテスト依存で、ブラウザbundleにはSDKを含めません。MCPパッケージはApache-2.0を宣言し、LICENSEにMITからApacheへの移行を記載しています。ZodはMITです。2026-10-10に確認した現行[v2ドキュメント](https://ts.sdk.modelcontextprotocol.io/v2/)、[stdioガイド](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html)、[clientガイド](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html)に沿って選定しました。SDK v2の従来initialize handshakeと2026-07-28 protocolの両方をテストしています。参考プロジェクトのコード・素材は転用していません。テストはNode標準test runnerとPlaywrightを使います。`package-lock.json`にバージョンを固定し、単体テストのTypeScript実行にNode 22.18以上を使用します。公式情報: [Vite](https://vite.dev/guide/)、[React](https://react.dev/versions)、[TypeScript](https://www.typescriptlang.org/download/)。
- 小規模なローカルモデル向けです。プリミティブ型と一対多関係のみ。ネスト値、一意性制約、任意制約、Entity/Field削除、undo/redo、ズーム、移行機能はありません。ノード座標は0〜4000です。IDはEntity・Field・Relation・Sample全体で一意とし、英数字・`_`・`-`を使い、prototype関連の予約名は使えません。
- ブラウザ単独モードのローカル保存はブラウザ・オリジンごとで、容量制限があり、バックアップではありません。明示的に保存し、持ち運びにはJSON exportを使ってください。保存失敗を表示しても編集中のドキュメントは破棄しません。ブラウザ再読み込みで未保存の変更と未適用のフォーム入力は失われます。
- ログイン、多人数の共同編集、クラウド保存、LLM連携、kintone連携、本番DB生成、完全なJSON Schema exportは未実装です。将来構想を稼働中の機能として表示しません。テレメトリー、外部フォント、実行時の外部リクエストは含みません。共有モードは自身のローカルHTTPサーバーだけを使います。

## 開発

[構想](docs/VISION.md)、[開発フロー](docs/WORKFLOW.md)、[Issue](https://github.com/ryoryo34/model-canvas/issues)を参照してください。1 Issueにつき1つのCodexセッションと実装ブランチを使います。ブラウザデモは[Issue #1](https://github.com/ryoryo34/model-canvas/issues/1)、MCP共有編集は[Issue #3](https://github.com/ryoryo34/model-canvas/issues/3)の範囲です。[共有モードの検証記録](docs/VERIFICATION-MCP.md)も参照してください。公開リポジトリには架空データのみを収録します。

## ライセンス

[MIT](LICENSE)
