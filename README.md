# @daiwajuki/ci-templates

大和住器 業務 SaaS 14 プロジェクト共通の GitHub Actions Reusable Workflow / Composite Action / Dockerfile テンプレート基盤。

## 提供物

| 種類 | パス | 配布方式 |
|---|---|---|
| Reusable Workflow | `.github/workflows/ci-next.yml` | live 参照（`uses:`） |
| Reusable Workflow | `.github/workflows/ci-laravel.yml` | live 参照（`uses:`） |
| Reusable Workflow | `.github/workflows/ci-fastapi.yml` | live 参照（`uses:`） |
| Reusable Workflow | `.github/workflows/deploy-cloudrun-next.yml` | live 参照（`uses:`） |
| Reusable Workflow | `.github/workflows/deploy-cloudrun-laravel.yml` | live 参照（`uses:`） |
| Reusable Workflow | `.github/workflows/deploy-cloudrun-fastapi.yml` | live 参照（`uses:`） |
| Composite Action | `.github/actions/setup-node-volta/` | live 参照（`uses:`） |
| Dockerfile テンプレート | `dockerfiles/` | copy 配布（Phase C〜） |
| docker-compose テンプレート | `docker-compose/` | copy 配布（Phase C〜） |
| Renovate / release-please | `configs/` | copy 配布（Phase C〜） |

## 利用方法

### Next.js CI（lint / typecheck / build）

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
```

詳細は [docs/usage-ci-next.md](docs/usage-ci-next.md) 参照。

### Next.js Cloud Run デプロイ

```yaml
jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-next.yml@v0
    with:
      service-name: my-web
      source-path: ./web
```

詳細は [docs/usage-deploy-next.md](docs/usage-deploy-next.md) 参照。

### Laravel CI / Cloud Run デプロイ

```yaml
jobs:
  api:
    uses: daiwajuki/ci-templates/.github/workflows/ci-laravel.yml@v0
    with:
      working-directory: api

  deploy:
    needs: api
    if: github.ref == 'refs/heads/main'
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-laravel.yml@v0
    with:
      service-name: my-api
      source-path: ./api
      smoke-health-path: /up
```

詳細は [docs/usage-ci-laravel.md](docs/usage-ci-laravel.md) / [docs/usage-deploy-laravel.md](docs/usage-deploy-laravel.md) 参照。

### FastAPI CI / Cloud Run デプロイ

```yaml
jobs:
  test:
    uses: daiwajuki/ci-templates/.github/workflows/ci-fastapi.yml@v0
    with:
      working-directory: server-py

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-fastapi.yml@v0
    with:
      service-name: my-api
      source-path: ./server-py
      ar-repo: my-project
      image-name: api
```

詳細は [docs/usage-ci-fastapi.md](docs/usage-ci-fastapi.md) / [docs/usage-deploy-fastapi.md](docs/usage-deploy-fastapi.md) 参照。

## バージョニング

| バージョン | 含めて良い変更 | 採用側の影響 |
|---|---|---|
| **PATCH** (`0.x.Y`) | バグ修正のみ。**Breaking Change 禁止** | 黙って動く |
| **MINOR** (`0.X.0`) | 新機能 + `v0.x` 特例で Breaking 可（CHANGELOG に明記必須） | `@v0` 採用側は CHANGELOG を確認 |
| **MAJOR** (`X.0.0`) | Breaking Change（`v1.0.0` 以降） | `@vN` → `@vN+1` 手動更新が必要 |

各プロジェクトは floating major タグ（`@v0`, `@v1`）を参照する。詳細は [docs/versioning.md](docs/versioning.md) 参照。

> **重要**: PATCH に Breaking を入れない規約は `v0.x` でも厳格適用。0.4.1 で secret rename を PATCH に含めた事故の再発防止。

## 構成

```
_ci-templates/
├── .github/
│   ├── workflows/
│   │   ├── ci-next.yml                    # Next.js CI（lint/typecheck/build）
│   │   ├── ci-laravel.yml                 # Laravel CI（pint/test）
│   │   ├── ci-fastapi.yml                 # FastAPI CI（ruff/mypy/pytest）
│   │   ├── deploy-cloudrun-next.yml       # Next.js × Cloud Run（WIF）
│   │   ├── deploy-cloudrun-laravel.yml    # Laravel × Cloud Run（WIF）
│   │   ├── deploy-cloudrun-fastapi.yml    # FastAPI × Cloud Run（WIF）
│   │   ├── self-test.yml                  # actionlint + 3 fixture 検証
│   │   ├── release-please.yml             # release PR + v0 floating tag 自動更新
│   │   └── notify-adopters.yml            # ★ release: published で adopters.json の各 repo に Issue 投稿
│   ├── adopters.json                       # ★ notify-adopters.yml の宛先リスト
│   └── actions/
│       └── setup-node-volta/              # Volta 対応 Node セットアップ
├── dockerfiles/                           # ★ Phase C: copy 配布
│   ├── README.md
│   ├── next/                              # Dockerfile.alpine, Dockerfile.slim
│   ├── fastapi/                           # Dockerfile.uv, Dockerfile.poetry
│   └── laravel/                           # Dockerfile.fpm-nginx, Dockerfile.frankenphp
├── docker-compose/                        # ★ Phase C: copy 配布
│   ├── README.md
│   ├── postgres-only.yml
│   └── postgres-redis.yml
├── scripts/
│   └── sync-templates.mjs                 # ★ Phase C: copy 配布の CLI（zero-install）
├── docs/
│   ├── usage-ci-next.md
│   ├── usage-ci-laravel.md
│   ├── usage-ci-fastapi.md
│   ├── usage-deploy-next.md
│   ├── usage-deploy-laravel.md
│   ├── usage-deploy-fastapi.md
│   ├── usage-sync-templates.md            # ★ Phase C: sync-templates CLI 使い方
│   ├── oauth-setup.md                     # Workspace 共有 OAuth + Secret Manager 連携手順
│   ├── versioning.md
│   └── audit-ci-drift-design.md           # Phase F 設計 + F-1 実装記録
├── fixtures/
│   ├── minimal-next/                      # ci-next.yml self-test 用
│   ├── minimal-laravel/                   # ci-laravel.yml self-test 用
│   └── minimal-fastapi/                   # ci-fastapi.yml self-test 用
├── release-please-config.json             # bump-minor-pre-major: true
├── .release-please-manifest.json          # 現バージョン正本（手動編集禁止）
├── CHANGELOG.md                           # release-please が自動生成
├── CLAUDE.md                              # 編集者向け運用ルール
├── LICENSE
├── README.md
└── package.json                           # metadata のみ（ローカルビルド無し）
```

## ロードマップ

| Phase | 内容 | 状態 |
|---|---|---|
| **A** | リポジトリ初期化・`ci-next.yml` 公開 | ✅ 完了 |
| **B** | Portal で試験導入・deploy-cloudrun-next.yml 追加 | ✅ 完了 |
| **C** | Dockerfile / docker-compose の copy 配布・`sync-templates.mjs` | ✅ 実装完了（Dockerfile 6 種 + compose 2 種 + sync-templates CLI、[docs/usage-sync-templates.md](docs/usage-sync-templates.md) 参照） |
| **D** | Workload Identity Federation composite action・JSON キー廃止 | ✅ 完了（`deploy-cloudrun-*.yml` で WIF 実装済み・JSON キー回帰なし） |
| **E** | 残り 12 プロジェクトに横展開・FastAPI / Laravel 用 CI 追加 | 🚧 進行中（6/18 採用、CI/Deploy 6 種公開済み） |
| **F** | release-please / Renovate 配給・`audit-ci-drift.mjs` 有効化 | 🚧 進行中（release-please 完了、audit-ci-drift は [設計済み](docs/audit-ci-drift-design.md)、Renovate 配給方式は未定） |

## 採用状況（最終確認: 2026-05-26）

各プロジェクトの `.github/workflows/*.yml` に `daiwajuki/ci-templates` の `uses:` を持つかで実測（全 18 プロジェクト中 8 件採用）：

| プロジェクト | 状態 | 採用 workflow（reusable 名） | pin | 備考 |
|---|---|---|---|---|
| Portal | ✅ 採用済み | ci-next, deploy-cloudrun-next | `@v0` | Phase B（試験導入） |
| ICPCostHub | ✅ 採用済み | deploy-cloudrun-next, deploy-cloudrun-laravel | `@v0` | Phase E（CI は別途、ci-templates 経由ではない） |
| ICPEstimating | ✅ 採用済み | deploy-cloudrun-next, deploy-cloudrun-laravel | `@v0` | Phase E |
| PayrollManager | ✅ 採用済み | ci-next | `@v0` | Phase E |
| BidFlow | ✅ 採用済み | ci-fastapi, deploy-cloudrun-next, deploy-cloudrun-fastapi | `@v0` | Phase E |
| HydraulicCalculation | ✅ 採用済み | ci-next, deploy-cloudrun-next | `@v0` | Phase E |
| daiwa-ops-app | ✅ 採用済み | ci-next, deploy-cloudrun-next | `@v0` | Phase E |
| ICPSitePhotos | ⚠️ 採用済み（古い pin） | ci-next | `@v0.6.0` | floating tag への切替推奨。v0.7.0+ の hardening を受け取れていない |
| 残り 10 | ⏳ 未採用 | — | — | Phase E で順次横展開（BidCalc / BuildDeck / CompanyWebsite / ContractHub / DailyLogs / genba-chosa / ICPBlankMap / ICPContacts / ICPForms / Orders / StridePlan） |

確認コマンド:
```bash
grep -rn 'daiwajuki/ci-templates' ../*/.github/workflows/*.yml
```

> `.github/adopters.json` は [notify-adopters.yml](.github/workflows/notify-adopters.yml) の宛先正本。このテーブルと乖離させない。

## 取り込みチェックリスト

1. **workflow 配置**: `.github/workflows/ci.yml` を作成（README 冒頭の YAML サンプル参照）
2. **ブランチ保護** (任意): GitHub の branch protection rule に `ci / build` を必須チェックとして登録
3. **secrets 設定**: 必要な GitHub secrets を repo settings に登録（Cloud Run デプロイなら `GCP_SA_KEY` 等。Phase D で WIF に置換予定）
4. **タグ pin の方針**: `@v0` で floating（推奨）／ `@v0.1.0` で厳密 pin（破壊変更を避けたい場合）

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `error parsing called workflow` | タグの指定ミス | `@v0` または `@<sha>` で pin、ブランチ名は不可 |
| Volta セットアップで Node が違う | `package.json` の `volta.node` 未設定 | `volta pin node@20 npm@10` を実行 |
| `secrets.X` が読めない | reusable workflow への secrets inherit 漏れ | 呼び出し側に `secrets: inherit` を追加 |
| MAJOR 更新でジョブ落ち | 入力 API 破壊変更 | `CHANGELOG.md` 確認、tag を `@v0` から `@v1` に上げる前に self-test 通す |

## 関連基盤

- [`_auth`](../_auth/) — 共通認証基盤（`@daiwajuki/auth`）
- [`_design-system`](../_design-system/) — 共通デザイン基盤（`@daiwajuki/ui-design`）
