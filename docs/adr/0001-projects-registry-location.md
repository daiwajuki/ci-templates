# ADR 0001: プロジェクトレジストリの所在と責務分離

- **Status**: Accepted
- **Date**: 2026-05-22
- **Author**: r-taniguchi@daiwajuki.co.jp
- **Related**: [governance-plan v3](../../../../.claude/plans/github-sharded-platypus.md) Wave 0 ステップ 1

> **Note (2026-05-24)**: 本 ADR の決定は維持されるが、`projects-meta.json` と `ports.json` の格納場所はワークスペース直下 `scripts/` から `_tools/data/` に移管された（`_tools` リポを共通基盤として正式化）。本文中の path 参照はすべて新パスに更新済。

## Context

ワークスペース `C:\Users\daiwa\Develop\` 配下に「プロジェクトレジストリ」を持つ JSON ファイルが複数存在する。governance 計画 (本リポ運用ベストプラクティス v3) の Wave 0 ステップ 1 で、これらを統合 / 移管すべきかの判断が必要になった。特に Wave D「採用状況の可視化」スクリプトを書く前に、どのレジストリを正本 / 参照先にするかを確定する必要がある。

### 現状のレジストリ群（2026-05-22 棚卸し）

| パス | 責務 | フィールド | 収載数 |
|---|---|---|---|
| `_tools/data/projects-meta.json` | **全業務プロジェクトのメタデータ**（ダッシュボード表示用） | displayName / description / githubRepo (空欄多数) / status / icon / tags / links | 19 件 |
| `_auth/scripts/projects.json` | **認証統合対象プロジェクト**（disable-user / rotate-keys / deploy-auth-yml が参照） | githubRepo / databaseUrlEnv / authMode / googleMode / wave | 15 件 |
| `_pdf-forms/scripts/projects.json` | **PDF 帳票配給対象プロジェクト**（audit:* / replace:stamps / deploy:forms-yml が参照） | path / pdfRuntime / pdfLibraries / pdfWave / pdfPhase / pdfDocuments / pdfDb / notes | 10 件 |
| `_tools/data/ports.json` | **ポート静的割当レジストリ**（アプリ + インフラ） | ports / categories | （別責務、参考） |

### 浮き上がった問題

1. governance v2 で「`_auth/scripts/projects.json` は本来認証基盤の責務ではない、`_ci-templates/scripts/projects.json` への移管 ADR を別途」と書いたが、棚卸しの結果 **既に責務別に分離されている** ことが判明した
2. Wave D 採用ダッシュボードで使う「全プロジェクト × 共通基盤バージョン」のマトリクス用に、全プロジェクト共通の join key が必要
3. `_tools/data/projects-meta.json` の `githubRepo` フィールドが全件空欄で、join key として機能していない
4. 新発見: `_tools/data/projects-meta.json` に **`genba-chosa`** という、他のレジストリ・CLAUDE.md にも記載のないプロジェクトが収載されている（19 件目）

## Decision

**4 つのレジストリは責務別に維持する。統合しない。** その代わり以下のルールを確立する:

### 1. 責務マトリクス（不変条件）

| レジストリ | 唯一の正本となる責務 | 参照するスクリプト |
|---|---|---|
| `_tools/data/projects-meta.json` | **全業務プロジェクトのメタデータ** — どのプロジェクトが存在し、本番 URL / GitHub repo は何か | dashboards (Wave D 採用ダッシュボード含む) / 横断ツール |
| `_auth/scripts/projects.json` | **認証統合プロジェクトのみ** — authMode / googleMode / wave 情報 | `_auth/scripts/*.mjs` の運用スクリプト群 |
| `_pdf-forms/scripts/projects.json` | **PDF 帳票配給対象** — pdfRuntime / pdfPhase / pdfDocuments | `_pdf-forms/scripts/*.mjs` |
| `_tools/data/ports.json` | **ポート割り当て** | `_tools/cli/manage-ports.mjs` / `_tools/cli/generate-dashboard.mjs` |

### 2. join key は **プロジェクト名（ディレクトリ名）** で統一

全レジストリでキーは **PascalCase のディレクトリ名**（例: `BidFlow`, `ICPCostHub`）を共通使用。`_tools/data/projects-meta.json` の `displayName` も同名にする。Wave D 採用ダッシュボードは projects-meta の `displayName` をループしながら、各レジストリと `auth/` `pdf-forms/` を join する。

### 3. `_tools/data/projects-meta.json` の `githubRepo` を埋める（**本 ADR の唯一の実装タスク**）

19 件の `githubRepo` フィールドを実際の owner/repo 名で埋める。Wave 0 transfer 完了前は `r-taniguchi-daiwajuki/<name>`、完了後に `daiwajuki/<name>` に一括書き換え（governance プラン Wave 0 ステップ 2 と同期）。

### 4. レジストリ間の **逆参照は許可、循環参照は禁止**

- `_tools/data/projects-meta.json` は他レジストリを参照しない（最下層）
- `_auth/scripts/projects.json` は projects-meta を読んで存在チェックしてもよい（projects-meta が正本）
- `_pdf-forms/scripts/projects.json` も同じ
- 逆に projects-meta が `_auth` / `_pdf-forms` を読むことは禁止（循環参照になる）

### 5. プロジェクト追加時の更新順序

新規プロジェクト追加時は **必ず以下の順** で更新:
1. `_tools/data/projects-meta.json` に追加（存在の宣言）
2. `_auth/scripts/projects.json` に追加（認証統合する場合のみ）
3. `_pdf-forms/scripts/projects.json` に追加（PDF 帳票配給する場合のみ）
4. `_tools/data/ports.json` にポート割当（dev サーバ持つ場合のみ）

## Alternatives Considered

### A. 4 つを 1 つに統合（rejected）

- 利点: 単一の真実源、join 不要
- 欠点: ファイルが巨大化、`_auth` / `_pdf-forms` 単独で完結しなくなり、各基盤の独立性が失われる。MAJOR 変更時の影響範囲も拡大
- 判断: 1 人開発でも責務分離は維持価値あり。統合の利得が小さい

### B. `_ci-templates/scripts/projects.json` に統合（rejected — governance v2 で提案）

- 利点: 「CI 横断の責務」という名目に合う
- 欠点: 認証ロジック / PDF 帳票ロジックを CI 基盤の知識として強要することになる。実際の参照スクリプトは `_auth/` `_pdf-forms/` 内にあるので、移管は単に「読みに行く先が遠くなる」だけで価値がない
- 判断: 棚卸しの結果、現行の責務分離が既に妥当だったため移管不要

### C. 責務別維持 + projects-meta を共通 join key として整備（**accepted**）

- 利点: 既存構造を尊重、追加実装は projects-meta の `githubRepo` 埋めのみ（最小コスト）
- 欠点: なし（join 処理は採用ダッシュボードスクリプトに 1 回書けば済む）
- 判断: 採用

## Consequences

### Positive

- governance プラン Wave 0 ステップ 1 を **30 分作業**で完了させられる（projects-meta の `githubRepo` 19 件埋めるだけ）
- Wave D 採用ダッシュボードの実装が単純化（projects-meta を join key として使えば良い）
- 各共通基盤 (`_auth` / `_pdf-forms` / `_ci-templates`) の独立性を維持
- 新規プロジェクト追加時の手順が明確化（5 で示した順序）

### Negative

- 4 つのレジストリが分散していることで、新規参加者が「どれが正本か」迷う可能性 → 本 ADR と各 CLAUDE.md への記述で対処
- プロジェクト名のドリフト（PascalCase / kebab-case の混在、例: `genba-chosa`）が顕在化する可能性 → 命名規則を別 ADR で確立する余地あり

### Follow-up

- **即時**: `_tools/data/projects-meta.json` の `githubRepo` を埋める（Wave 0 ステップ 2a に組み込み）
- **Wave 0 ステップ 2 完了後**: projects-meta の `githubRepo` を `daiwajuki/<name>` に一括書き換え
- **Wave D 着手時**: 採用ダッシュボードの join 元として projects-meta を使用する旨を実装に反映
- **将来**: `genba-chosa` プロジェクトの実態調査（CLAUDE.md / projects.json に未収載なので追加要否を判断）
- **将来**: プロジェクト名の命名規則 ADR（PascalCase 統一 or kebab-case 許容）

## References

- governance-plan v3: `~/.claude/plans/github-sharded-platypus.md` Wave 0 ステップ 1
- `_auth/CLAUDE.md` §「認証方式・採用モード」（projects.json 責務の出典）
- `_pdf-forms/CLAUDE.md` §「配給対象プロジェクトと Phase」
- `C:\Users\daiwa\Develop\CLAUDE.md` §「プロジェクト一覧」（projects-meta.json 責務の出典）
