# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリの性質

`@daiwajuki/ci-templates` は **大和住器 業務 SaaS 14 プロジェクト共通の GitHub Actions Reusable Workflow / Composite Action 配給基盤**。ここで動くコードは存在せず、コミットされた YAML を採用側プロジェクトが `uses: daiwajuki/ci-templates/.github/workflows/<name>@v0` で **live 参照** することで価値が出る。

つまり：

- **ローカルでビルド・テスト・lint コマンドは無い**（package.json は metadata のみ）
- **「テスト」とは self-test workflow が CI 上で reusable workflow を呼び出して動くこと** — `fixtures/minimal-{next,laravel,fastapi}/` が最小フィクスチャ
- **「リリース」とは tag 付与 + `v0` floating tag 移動** — release-please が完全自動化済み
- **採用側 (Portal / ICPCostHub / ICPEstimating / PayrollManager + 残り 10) が踏むまで壊れに気づけない構造的リスクがあり**、self-test と actionlint がそれを防ぐ唯一のセーフティネット

採用側のうち何プロジェクトが何 workflow を引いているかは [README.md](README.md) の採用状況テーブルが正本。

## 編集 → 検証 → リリースのフロー

### 1. ブランチを切って YAML / Dockerfile / scripts を編集

編集対象：

- `.github/workflows/*.yml`（reusable workflows）と `.github/actions/setup-node-volta/`（composite action）— **live 参照**
- `dockerfiles/{next,laravel,fastapi}/Dockerfile.*` と `docker-compose/*.yml` — **copy 配布**（`sync-templates.mjs` 経由で raw URL fetch）
- `scripts/*.mjs` — 採用側 / CI から実行される Node スクリプト
- `docs/` — 採用側が引く reference。同じ PR で更新

### 2. PR を出すと self-test が走る

- `lint-workflows` (actionlint) — 全 `*.yml` の構文 / 式 / shellcheck / reusable workflow 互換性
- `test-ci-{next,laravel,fastapi}` — 各 fixture から実際に reusable workflow を呼び出し

actionlint は **shellcheck severity デフォルト**（info 以上を error 扱い）で動く。`>> $GITHUB_OUTPUT` のような未クォート展開は failing。

### 3. マージしたら release-please が release PR を開く

- `feat:` → MINOR bump、`fix:` → PATCH bump、`feat!:`/`BREAKING CHANGE:` → MINOR bump（`bump-minor-pre-major: true` のため、v0.x では Breaking も MINOR）
- `docs:` / `chore:` / `ci:` / `test:` / `refactor:` は CHANGELOG に出ない（hidden、release も発火しない）
- release PR がない＝今 release すべき変更がない、という意味

### 4. release PR をマージすると自動でタグ + リリース + `v0` 移動

`release-please.yml` の 2 ジョブ目 (`update-floating-tag`) が `v0` annotated tag を新コミットに force 移動する。**手動で `git tag -f v0` を打たない**。

## 守るべき規約（事故予防）

### PATCH に Breaking Change を入れない（v0.x でも厳格）

呼び出し側の YAML / `secrets:` ブロック / `with:` の input 名・型に変更を強いる修正は **必ず `feat:` / `feat!:` で MINOR bump**。`fix:` で送ると release-please は PATCH を切るため、`@v0` 採用側の CI が静かに壊れる（過去事例: 0.4.1 で `colocate-token` → `COLOCATE_TOKEN` を PATCH に含めた事故）。

詳細は [docs/versioning.md](docs/versioning.md)。

### `${{ }}` リテラルを input/secret の `description` に書かない

reusable workflow としてパースされる際 GitHub Actions のテンプレートエンジンが先に評価しに行き、parse error を起こす。例示が必要なら `\${{ }}` ではなく Markdown コードブロックなしの素のテキストで `[double-curly]` のように代替表現する（過去事例: PR #5→#6→#8 の 3 連続修正）。

### secret 名はハイフン不可、英数字とアンダースコアのみ

GitHub Actions の制約。`colocate-token` は **空文字に評価される** ため secret 経由の認証が黙って `github.token` フォールバックに落ちる。`COLOCATE_TOKEN` のように UPPER_SNAKE で書く。

### floating tag の前提

採用側は `@v0` を pin している。SHA は **release-please が動かす前提**。手動で動かさない。途中で repo を作り直したり tag を消したりすると採用側全部の CI が壊れる。

### GitHub Packages cross-repo 認証は org secret `GH_PACKAGES_TOKEN` が前提

`@daiwajuki/auth` や `@daiwajuki/ui-design` のような **publish 元と install 元が別リポジトリ** の private package は、GitHub Actions の `github.token` / `secrets.GITHUB_TOKEN` では **403 になる**（`packages: read` permission を付けても解決しない、これは GitHub Packages の仕様）。

解決構造：
1. org `daiwajuki` レベルに **`GH_PACKAGES_TOKEN`** secret（`read:packages` 権限の PAT、All repositories アクセス）を 1 個用意
2. reusable workflow 側は `secrets.GH_PACKAGES_TOKEN || github.token` でフォールバック（same-repo は github.token で動くため）
3. **採用側は `secrets: inherit`** を必ず付ける（これがないと org secret が reusable workflow に届かない）

採用側 README / docs に「`secrets: inherit` 必須」を必ず明記する。過去事例: Portal CI が 5 連続失敗（v0.5.0 リリース時の 0.4.x 系試行錯誤）。

### cross-repo checkout は GitHub App credentials を第一選択に

`deploy-cloudrun-laravel.yml` の `additional-build-context-repos` のように **別 repo を BuildKit context へ注入** する場合、認証は以下の優先順で解決される:

1. `external-checkout-app-id` + `external-checkout-app-private-key`（**推奨**: `actions/create-github-app-token` で install token を mint。短命・権限境界が明確）
2. `external-checkout-token`（PAT。後方互換のため残置）
3. `github.token`（fallback。同 repo・public のみ。private cross-repo は 403）

新規 deploy 系 workflow に cross-repo checkout を足す場合は **同じ優先順を踏襲**する（`fastapi` / `next` 版への展開は Phase 3 で予定、commit 1d992a4 参照）。

### `gcloud run` の `--to-latest` を使わない（deploy-cloudrun-* 共通）

deploy-cloudrun-{next,laravel,fastapi}.yml の "Route 100% traffic" / "Rollback" step は **必ず `jq` で `Ready=True` の revision を抽出して `--to-revisions=NAME=100` で明示指定**する。`--to-latest` や `gcloud --filter "status.conditions.type=Ready AND status=True"` は broken revision (Ready=False, Active=True, ...) を通すため、Cloud Run の `spec.traffic` が一度壊れると後続の全 deploy が黙って前 Ready リビジョンへ fallback serving に落ち、`update-traffic` を手動で叩くまで CI 上の deploy が「成功扱いだが反映されない」状態が続く。

`gcloud --filter` の AND が配列要素間でスコープされない点が罠の本体。jq で `any(.status.conditions[]?; .type=="Ready" and .status=="True")` を使えば述語を同一要素にスコープできる。

過去事例: 2026-05-23 ICPCostHub revision 00017 が Ready=False のまま spec.traffic を握り続け、後続 deploy 全部が黙って前リビジョン serving のままだった（[#33](https://github.com/daiwajuki/ci-templates/pull/33) / [#34](https://github.com/daiwajuki/ci-templates/pull/34)）。

### Rollback step の `if:` を `failure() && steps.deploy.conclusion == 'success'` に絞る

`if: failure() && inputs.enable-rollback` だけだと WIF validation / `google-github-actions/auth` / build 段階で落ちたときにも rollback が起動し、`gcloud not authenticated` で本来の失敗原因が埋もれる。さらに新しい broken revision が無い状態で前世代へ巻き戻すと、無関係な service にダウンタイムを誘発する。

deploy step 自体が通った後の route / smoke 失敗に限定する条件を必ず維持する（[#36](https://github.com/daiwajuki/ci-templates/pull/36)）。

### Reusable workflow の `permissions:` を caller の super-set にしない

reusable workflow の `permissions:` ブロックは **caller の `permissions:` の subset でなければならない**（GitHub Actions の仕様）。super-set だと caller のジョブは **0 job のまま `startup_failure` で即終了**し、step 単位のエラーログすら出ない。

deploy-cloudrun-next.yml に一度 `packages: read` を入れたら v0.6.0〜v0.9.2 で全 next スタック採用側 (Portal / ICPCostHub / ICPEstimating / PayrollManager) の CI を直撃した。

対処方針：
- reusable 側は `contents: read` + `id-token: write` だけに留める
- GitHub Packages を `github.token` で読みたい caller は **自分の workflow** の `permissions:` に `packages: read` を足す
- PAT (`GH_PACKAGES_TOKEN`) 経由なら caller 側の permissions は不要

過去事例: [#39](https://github.com/daiwajuki/ci-templates/pull/39) (v0.9.3 で revert)。

## ファイル構造の要点

### 提供物の配布方式 2 種

| 配布方式 | 対象 | 採用側の取り込み方 |
|---|---|---|
| **live 参照** | `.github/workflows/*.yml`（reusable workflow）、`.github/actions/setup-node-volta/`（composite action） | `uses: daiwajuki/ci-templates/...@v0` |
| **copy 配布** | `dockerfiles/{next,laravel,fastapi}/Dockerfile.*`、`docker-compose/*.yml` | `node ../_ci-templates/scripts/sync-templates.mjs --target=dockerfile --stack=next --variant=alpine` |

**新規 reusable workflow を足したら必ず self-test fixture と self-test job も追加**する（fixture 無しでマージすると採用側に「動くか不明な workflow」が降る）。copy 配布物を追加した場合は `sync-templates.mjs` の variant マップと `docs/usage-sync-templates.md` を同期する。

### reusable workflow 一覧

| ファイル | スタック × 役割 | self-test fixture |
|---|---|---|
| `ci-next.yml` | Next.js × CI（lint/typecheck/build） | `fixtures/minimal-next/` |
| `ci-laravel.yml` | Laravel × CI（pint/test） | `fixtures/minimal-laravel/` |
| `ci-fastapi.yml` | FastAPI × CI（uv/poetry/pip + ruff/mypy/pytest） | `fixtures/minimal-fastapi/` |
| `deploy-cloudrun-next.yml` | Next.js × Cloud Run deploy（buildpacks / Dockerfile） | self-test なし（GCP credentials 必須） |
| `deploy-cloudrun-laravel.yml` | Laravel × Cloud Run deploy | 同上 |
| `deploy-cloudrun-fastapi.yml` | FastAPI × Cloud Run deploy | 同上 |
| `lint-commit-author.yml` | PR 新規 commit の author email を正規表現チェック（テスト用メール拒否） | self-test なし |
| `snapshot-adoption.yml` | nightly 集計用 internal workflow（採用側からは呼ばない） | — |

deploy 系は actionlint だけで保護されている。本物の deploy 検証は採用側で初めて踏む。

### scripts/（Node 20+ 標準 fetch、追加 dep 不要）

| ファイル | 実行場所 | 役割 |
|---|---|---|
| `sync-templates.mjs` | 採用側プロジェクト | GitHub raw URL から Dockerfile / compose を fetch してコピー。`.ci-templates.json` に履歴記録 |
| `swap-deps-to-registry.mjs` | 採用側 CI（build 直前、commit しない） | `package.json` の `"@daiwajuki/X": "file:../_X"` を `"^X.Y.Z"` に書き換え。GitHub Packages から install させる |
| `audit-secrets.mjs` | ローカル / メンテナ運用 | `gh secret list` で 14 プロジェクトの `GH_PACKAGES_TOKEN` / `AUTH_REPO_TOKEN` / `DS_REPO_TOKEN` 配備状況を Markdown 表で監査 |
| `build-adoption-snapshot.mjs` | `snapshot-adoption.yml` (nightly) / ローカル | 全プロジェクトの `@daiwajuki/*` 採用バージョンを集計、Markdown + JSON 出力。`_tools/data/projects-meta.json` をワークスペース直下から読む（リポ内に sync copy がある前提） |
| `deploy-secrets.mjs` | ローカル / メンテナ運用 | 14 プロジェクトへの secret 一括配備 (`gh secret set --org` の fanout)。`GH_PACKAGES_TOKEN` / `AUTH_REPO_TOKEN` / `DS_REPO_TOKEN` のローテに使う |
| `show-legacy-peer-deps-status.mjs` | ローカル / メンテナ運用 | 各 consumer の `.npmrc` から `legacy-peer-deps=true` 残置を一覧化。Wave E（peer-deps 卒業）の exit decision 判定用 |
| `audit-ci-drift.mjs` | ローカル / メンテナ運用 / CI (将来) | `.github/adopters.json` と実態の drift を検出 (missing / stale / uses-mismatch / stale-pin / unknown-workflow)。`--remote` で `gh search code` を使い org 全体をスキャン、`--strict` で stale-pin も exit 1 扱い |

### 設定ファイル

| ファイル | 役割 |
|---|---|
| `release-please-config.json` | `bump-minor-pre-major: true` で v0.x の Breaking を MINOR に。CHANGELOG 表示 type を制御 |
| `.release-please-manifest.json` | 現バージョンの正本 — 直接編集しない、release PR が更新する |
| `.github/workflows/self-test.yml` | actionlint + 3 fixture の検証 orchestration |
| `.github/workflows/release-please.yml` | release PR 生成 + マージ後の tag/v0 自動更新 |
| `.github/workflows/notify-adopters.yml` | `release: published` で `.github/adopters.json` の各 repo に Issue を自動投稿（採用側への能動通知チャネル、v0.9.0〜） |
| `.github/adopters.json` | `notify-adopters.yml` の宛先リスト。採用 repo を増減させたらここを更新する |
| `docs/adr/` | 設計判断の Architecture Decision Records（例: 0001 = projects registry の所在） |
| `docs/versioning.md` / `docs/secrets.md` / `docs/usage-*.md` | 採用側が引く reference。input/secret を変えたら同じ PR で更新する |

## ワークスペースとの関係

このリポジトリは [`C:\Users\daiwa\Develop\`](../../) ワークスペース全体の共通基盤の一つ。`_auth`（認証基盤）、`_design-system`（UI 基盤）と並列の位置づけ。

ワークスペース直下の `CLAUDE.md` は同居する 14 SaaS プロジェクト全体のルールを扱う。本ファイルは **このリポジトリ単体の運用ルール** に専念する。

## よくある作業の入口

| やりたいこと | 起点 |
|---|---|
| 新 reusable workflow を足す | YAML 追加 → 同 PR で fixture と self-test job 追加 → [`.github/adopters.schema.json`](.github/adopters.schema.json) の `uses` enum にも追加（self-test の schema 検証 step が壊れるので忘れない）→ `feat:` でコミット |
| 既存 workflow にオプション input を足す（後方互換） | `feat:` でコミット → MINOR bump |
| input/secret の rename・型変更 | `feat!:` でコミット → MINOR bump（v0.x 特例）。CHANGELOG に Before/After 移行手順を必ず書く |
| バグ修正（呼び出し側に変更を強いない） | `fix:` でコミット → PATCH bump |
| docs / 内部リファクタ | `docs:` / `refactor:` でコミット → リリース発火しない |
| 採用側に Breaking を能動通知したい | [docs/audit-ci-drift-design.md](docs/audit-ci-drift-design.md) 参照（drift 検出は未実装、設計のみ）。release 公開時の Issue 投稿だけは [notify-adopters.yml](.github/workflows/notify-adopters.yml) で稼働中 |
| 採用 repo の追加・削除（通知宛先の更新） | `.github/adopters.json` を編集 → `feat:` でコミット。次回 release から Issue が届く / 止まる |
| ローカルで actionlint を試したい | **CI と完全に同じコマンド**（severity = info、shellcheck デフォルト）: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color` — `-shellcheck "shellcheck -S warning"` を付けると **info/style を取り逃して CI で fail する**（過去事例 #29: SC2129 / SC2016）。問題切り分けに severity を下げたいときだけ `-shellcheck "shellcheck -S warning"` を追加する |
| 新 fixture を追加する | 最小構成は `fixtures/minimal-next/package.json` 参考（`scripts.lint = "echo 'lint ok'"` のようなダミーで OK）。CI 通過の事実だけ確認すれば良い |
| 新 Dockerfile variant を足す | `dockerfiles/<stack>/Dockerfile.<variant>` を追加 → `scripts/sync-templates.mjs` の variant マップに登録 → `docs/usage-sync-templates.md` 更新 → `feat:` でコミット |
| 14 プロジェクトの採用バージョンを今すぐ見たい | `node scripts/build-adoption-snapshot.mjs`（ローカル）または GitHub Actions の Snapshot Adoption workflow を `workflow_dispatch` |
| adopters.json と実態の drift を確認したい | `node scripts/audit-ci-drift.mjs`（ローカル、workspace 直下を grep）/ `--remote` で `gh search code` 経由 / `--strict` で stale-pin も exit 1 |
| secret 配備状況を確認したい | `gh auth status` で daiwajuki org ログイン後、`node scripts/audit-secrets.mjs` |
