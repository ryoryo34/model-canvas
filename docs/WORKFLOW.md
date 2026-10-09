# Issue / session workflow

1. 取り掛かる前にGitHub Issueを用意する。背景、目的、対象ユーザー、範囲、完了条件、参考、制約・依存、検証方法を記載する。
2. そのIssue専用のCodexセッションを開始し、Issue URLとリポジトリの絶対パスを渡す。
3. `issue-N-short-description` ブランチで実装する。同じcheckoutで複数セッションを並行編集しない。並行が必要なら別worktreeを使う。
4. 関連する自動テスト、型チェック、ビルドと主要操作を検証する。できなかった確認は明記する。
5. `Closes #N` を含むPRを作成し、変更の目的、実際の挙動、検証結果、制約を記載する。作成したPRをCodexセッションへattachする。
6. セッション終了時にIssue/PR/ブランチ/実行手順/検証結果を報告する。PRを自動マージしない。Issueを実装途中で閉じない。

## Scope changes

完了に必須な小さな修正は同じIssueで扱う。独立した追加機能はIssueを分け、依存関係を明記する。未着手の構想はVISIONの候補であり、実装済み機能ではない。

## GitHub account

Owner: `ryoryo34`。この環境には別アカウントもあるため、投稿前に所有者を確認する。既存のcredential helper等を使い、tokenをログ・ファイル・remote URLへ出力しない。グローバルの認証設定を不用意に変更しない。
