# Model Canvas

## 構想

単なるお絵描きや図生成ではなく、Entity・Field・Relation・Constraintを構造化データとして持つ。人のキャンバス操作とAIの操作が同じ意味を持つ操作APIを通り、変更結果をサンプルデータとフォームで確かめられる。将来はMCP接続とJSON Schema出力に広げる。業務モデリング、DDD、ローコードのアプリ設計経験を活かす実用OSS。

## 最初の到達点

第三者がローカル起動し、顧客・案件のモデルを編集して、関係とサンプルデータの整合性をその場で試せるデモを作る。後でAIを接続できる型付き操作境界を最初から置く。

## 後続Issueの候補（未着手）

- MCPから同じcommand APIを使うAI共同編集
- JSON Schemaエクスポートとモデル移行
- 複雑な制約とドメインシナリオのシミュレーション

候補へ着手する際に、背景・目的・範囲・完了条件・参考・依存関係を持つGitHub Issueを作り、別セッションで実装する。

## 参考

- https://github.com/excalidraw/excalidraw
- https://github.com/excalidraw/excalidraw-mcp
- https://github.com/Comfy-Org/ComfyUI
