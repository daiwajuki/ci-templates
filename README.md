# @daiwajuki/ci-templates

大和住器 業務 SaaS 14 プロジェクト共通の GitHub Actions Reusable Workflow / Composite Action / Dockerfile テンプレート基盤。

## 提供物

| 種類 | パス | 配布方式 |
|---|---|---|
| Reusable Workflow | `.github/workflows/ci-next.yml` | live 参照（`uses:`） |
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

## 関連基盤

- [`_auth`](../_auth/) — 共通認証基盤（`@daiwajuki/auth`）
- [`_design-system`](../_design-system/) — 共通デザイン基盤（`@daiwajuki/ui-design`）
