# deploy-cloudrun-laravel.yml 利用ガイド

Laravel API を Cloud Run にデプロイする Reusable Workflow。WIF 認証 → ビルド → デプロイ → OIDC スモーク → 失敗時 rollback まで一気通貫。

## ビルドモードの選択

| `build-mode` | 仕組み | 必要なファイル | 推奨ケース |
|---|---|---|---|
| `source`（デフォルト） | Cloud Build + Buildpacks（PHP buildpack 自動選択）| `composer.json` のみ | 標準的な Laravel API |
| `image` | runner 上で Docker buildx → Artifact Registry に push | `Dockerfile` 必須 | wkhtmltopdf / imagick / 日本語フォント等の追加 OS パッケージが必要 |

詳細な比較は本リポジトリ README、または各プロジェクトの `CLAUDE.md` を参照。

## 基本（source モード）

```yaml
# .github/workflows/deploy-api.yml
name: Deploy API (Laravel)
on:
  push:
    branches: [main]
    paths:
      - 'api/**'
      - '.github/workflows/deploy-api.yml'
  workflow_dispatch:

jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-laravel.yml@v0
    with:
      service-name: icp-cost-hub-api
      source-path: ./api
      smoke-health-path: /up
      smoke-extra-path: /api/auth/google/redirect
      smoke-extra-expected-status: '302'
      secrets-yaml: |
        APP_KEY=icp-cost-hub-app-key:latest
```

## image モード（Dockerfile 派）

```yaml
jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-laravel.yml@v0
    with:
      build-mode: image
      service-name: my-laravel-api
      source-path: ./api
      ar-repo: my-project
      image-name: api
      smoke-health-path: /up
```

## inputs 一覧

| input | 型 | デフォルト | 説明 |
|---|---|---|---|
| `service-name` | string | **必須** | Cloud Run サービス名 |
| `source-path` | string | `'./api'` | source モード時のデプロイ対象 / image モード時のビルドコンテキスト |
| `region` | string | `''` | 空の場合 `vars.GCP_REGION` を使用 |
| `build-mode` | string | `'source'` | `source` または `image` |
| `ar-repo` | string | `''` | image モード時に必須 |
| `image-name` | string | `''` | image モード時に必須 |
| `env-vars` | string | `''` | Cloud Run env_vars（KEY=VALUE 改行区切り） |
| `secrets-yaml` | string | `''` | Secret Manager 注入（KEY=secret-name:version 改行区切り） |
| `smoke-health-path` | string | `'/up'` | スモーク用ヘルスエンドポイント（200 期待） |
| `smoke-extra-path` | string | `''` | 追加検証パス（空なら無効） |
| `smoke-extra-expected-status` | string | `'302'` | 追加パスの期待ステータス |
| `enable-rollback` | boolean | `true` | 失敗時に前リビジョンへ戻す |
| `route-to-latest` | boolean | `true` | 成功時に latest へ 100% トラフィック |
| `timeout-minutes` | number | `20` | ジョブタイムアウト |

## 必要な GitHub 設定

caller の repository に以下を設定すること：

### Variables（Settings → Variables → Actions）
- `WIF_PROVIDER` — `projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`
- `WIF_SERVICE_ACCOUNT` — `cloudrun-deployer@<project>.iam.gserviceaccount.com`
- `GCP_PROJECT_ID`
- `GCP_REGION`（input で `region` を指定する場合は不要）

### Secrets
- 不要（WIF を使うため SA キーは持たない）。Secret Manager 経由は `secrets-yaml` で注入。

## スモークテストの動作

1. デプロイ完了後、WIF SA を audience に **OIDC ID Token** を mint
2. `Authorization: Bearer <ID_TOKEN>` を付けて `smoke-health-path` を最大 5 回（5 秒間隔）リトライ
3. 200 が返れば次の step へ。返らなければ rollback step に流れる
4. `smoke-extra-path` が指定されていれば、`--max-redirs 0` で 1 回叩いて `smoke-extra-expected-status` と一致するかチェック

ICPCostHub では `/api/auth/google/redirect` を 302 期待で検証している（APP_KEY 破損時に 500 になる cipher エラー検知）。

## rollback の挙動

`enable-rollback: true` のとき、いずれかのステップが失敗すると：

1. `gcloud run revisions list --limit=2` で 1 つ前のリビジョン名を取得
2. `update-traffic --to-revisions=<PREV>=100` でトラフィックを差し戻す
3. `Job Summary` には FAILED と URL が記録される

`route-to-latest: true` でも、rollback 後は latest が古いリビジョンを指していないため整合する。
