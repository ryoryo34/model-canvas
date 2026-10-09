# Initial demo verification / 初期デモの検証

Scope: [Issue #1](https://github.com/ryoryo34/model-canvas/issues/1), branch `issue-1-initial-demo`.

Verified on 2026-10-10 with macOS arm64, Node.js 25.4.0, npm 11.7.0, and Playwright Chromium 156.0.8078.4. Only fictional fixture data was used.

| Check / 確認 | Result / 結果 |
| --- | --- |
| Clean dependency installation / クリーンインストール | `npm ci` succeeded from the lockfile; npm reported zero known vulnerabilities at verification time. |
| Type checking / 型チェック | `npm run typecheck` passed with strict TypeScript settings. |
| Model and boundary tests / モデル・境界テスト | `npm test`: 41 passed, 0 failed. |
| Production build / 本番ビルド | `npm run build` passed. |
| Browser interaction / ブラウザ操作 | `npm run test:e2e`: 6 passed, 0 failed, using a real Chromium browser through Playwright. |
| Production preview / 本番成果物の起動 | `npm run preview` served `dist/`; browser loaded the model, applied the example JSON command, and rejected its duplicate. No runtime errors or external requests were observed in this smoke check. |
| Visual inspection / 表示確認 | Inspected full-page screenshots at 1440px and 390px widths. No page-level horizontal overflow at 390px; the canvas scrolls within its own area. |
| Patch hygiene / 差分確認 | `git diff --check` passed. |

## Acceptance coverage / 完了条件との対応

- Entity/Field creation and editing update the diagram, inspector and generated form; boolean `false` survives form submission and export.
- Required, type and missing-reference errors identify the affected record and field. Correcting the three intentional fixture errors clears all diagnostics.
- Disconnecting/reconnecting Customer → Project changes both the SVG relation and sample reference checking without destroying values.
- Dragging and keyboard movement change layout; export/import restores the exact model and coordinates. Invalid JSON, unsupported versions and dangling model references leave the edited browser document unchanged. Unit tests also cover dangling sample references.
- UI rename and JSON rename produce the same exported document as `applyCommand`. Unit tests compare the complete typed-command sequence against JSON commands, including entities, fields, samples, relations and movement.
- Unknown IDs, duplicate IDs, invalid relation fields, reserved prototype IDs, non-JSON objects, malformed commands and non-finite coordinates/values fail atomically. Frozen input tests guard against mutation and caller-owned object aliasing.
- Local saves survive browser reloads. Corrupt/unavailable storage and quota failures are handled without overwriting or discarding the working state.

## Known limits / 既知の制約

No unresolved failures remain within Issue #1's tested scope. This was local verification; other browsers, operating systems, large models, and deployment were not tested. There is no hosted service or AI connection.

Import rejects missing source-record references, including the intentionally broken reference in the initial fixture. Correct it before an export/import round trip. Required/type-invalid samples remain importable, and local saves preserve all editable diagnostics. These behaviors are documented in both READMEs.

Screenshots, browser traces, installed dependencies and build output are ignored by Git. Verification is reproducible with the README commands; no personal logs or credentials are included in this report.
