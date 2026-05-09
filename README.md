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

- `v0.x`: 初期フェーズ。破壊変更は MINOR に含まれる場合あり
- `v1.0.0` 以降: [semver](https://semver.org/) 厳格適用

各プロジェクトは floating major タグ（`@v0`, `@v1`）を参照する。詳細は [docs/versioning.md](docs/versioning.md) 参照。

## 構成

```
_ci-templates/
├── .github/
│   ├── workflows/
│   │   ├── ci-next.yml          # Next.js CI（lint/typecheck/build）
│   │   └── self-test.yml        # 自己テスト
│   └── actions/
│       └── setup-node-volta/    # Volta 対応 Node セットアップ
├── docs/
│   ├── usage-ci-next.md
│   └── versioning.md
└── fixtures/
    └── minimal-next/            # self-test 用フィクスチャ
```

## ロードマップ

| Phase | 内容 |
|---|---|
| **A（現行）** | リポジトリ初期化・`ci-next.yml` 公開 |
| **B** | Portal で試験導入・deploy-cloudrun-next.yml 追加 |
| **C** | Dockerfile / docker-compose の copy 配布・`sync-templates.mjs` |
| **D** | Workload Identity Federation composite action・JSON キー廃止 |
| **E** | 残り 13 プロジェクトに横展開・FastAPI / Laravel 用 CI 追加 |
| **F** | release-please / Renovate 配給・`audit-ci-drift.mjs` 有効化 |

## 採用状況（最終確認: 2026-05-09）

各プロジェクトの `.github/workflows/*.yml` に `daiwajuki/ci-templates` の `uses:` を持つかで実測：

| プロジェクト | 状態 | 採用 workflow | 備考 |
|---|---|---|---|
| Portal | ✅ 採用済み | ci.yml, deploy.yml | Phase B（試験導入） |
| ICPCostHub | ✅ 採用済み | ci.yml, deploy-api.yml, deploy-web.yml | Phase E 横展開 |
| ICPEstimating | ✅ 採用済み | deploy-api.yml, deploy-web.yml | Phase E 横展開（CI は別途） |
| PayrollManager | ✅ 採用済み | ci.yml | Phase E 横展開 |
| 残り 10 | ⏳ 未採用 | — | Phase E で順次横展開 |

確認コマンド:
```bash
grep -rl 'daiwajuki/ci-templates' */.github/workflows/
```

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
