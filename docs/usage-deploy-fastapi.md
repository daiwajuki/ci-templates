# deploy-cloudrun-fastapi.yml 利用ガイド

FastAPI / Python サービスを Cloud Run にデプロイする Reusable Workflow。**Dockerfile 必須**（Buildx で build → Artifact Registry に push → image-deploy）。

## なぜ image 固定か

FastAPI 系の現行プロジェクト（BidFlow `server-py` / BidFlow `scraper` / HydraulicCalculation `app`）はすべて Dockerfile を持っており、Playwright・日本語フォント・mecab 等の OS パッケージを同梱する必要がある。Buildpacks では拡張不能な要件があるため image 固定とする。

## 基本

```yaml
# .github/workflows/deploy-server-py.yml
name: Deploy server-py (Cloud Run)
on:
  push:
    branches: [master]
    paths:
      - 'server-py/**'
      - '.github/workflows/deploy-server-py.yml'
  workflow_dispatch:

concurrency:
  group: deploy-server-py-${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-fastapi.yml@v0
    with:
      service-name: bidflow-api
      source-path: ./server-py
      ar-repo: bidflow
      image-name: api
      env-vars: |
        ALLOWED_ORIGINS=https://bidflow-web-501453986862.asia-northeast1.run.app,https://bidflow-web-knfuh5vtxa-an.a.run.app
```

## inputs 一覧

| input | 型 | デフォルト | 説明 |
|---|---|---|---|
| `service-name` | string | **必須** | Cloud Run サービス名 |
| `source-path` | string | **必須** | Dockerfile を含むビルドコンテキスト |
| `ar-repo` | string | **必須** | Artifact Registry リポジトリ名 |
| `image-name` | string | **必須** | イメージ名（例: `api`, `scraper`） |
| `region` | string | `''` | 空の場合 `vars.GCP_REGION` を使用 |
| `env-vars` | string | `''` | Cloud Run env_vars |
| `secrets-yaml` | string | `''` | Secret Manager 注入 |
| `smoke-paths` | string | `'/health /healthz / /docs'` | スモーク試行パス（スペース区切り、順次試行） |
| `enable-rollback` | boolean | `true` | 失敗時に前リビジョンへ戻す |
| `route-to-latest` | boolean | `true` | 成功時に latest へ 100% トラフィック |
| `timeout-minutes` | number | `25` | ジョブタイムアウト |

## イメージタグの命名

`<region>-docker.pkg.dev/<project>/<ar-repo>/<image-name>:<sha>` と `:latest` の 2 つを push する。`<sha>` は `github.sha` 全長。

## スモークテストの動作

`smoke-paths` のリストを順次試行：

| HTTP ステータス | 扱い |
|---|---|
| 200 / 307 | **成功**として step を抜ける |
| 404 | 「サーバ起動済み・ルート未定義」と判断、次のパスへ |
| その他 / 接続失敗 | 5 秒待って 3 回リトライ、ダメなら次のパス |

すべてのパスで成功しなかった場合のみ失敗扱い。Laravel 版と違い OIDC ID Token は付けない（FastAPI 側は通常 unauthenticated 公開 or 別途認証）。認証必須のサービスでは `smoke-paths` に認証不要のヘルスチェック用パスを用意するか、独自スモーク step を追加すること。

## BidFlow 多サービス構成での使い分け

BidFlow は `server-py`（API）と `scraper`（バッチ）を別 Cloud Run サービスとしてデプロイしている：

```yaml
# deploy-server-py.yml
jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-fastapi.yml@v0
    with:
      service-name: bidflow-api
      source-path: ./server-py
      ar-repo: bidflow
      image-name: api

# deploy-scraper.yml（別ファイル）
jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-fastapi.yml@v0
    with:
      service-name: bidflow-scraper
      source-path: ./scraper
      ar-repo: bidflow
      image-name: scraper
      smoke-paths: '/healthz'
```

`ar-repo` は共有可能。`image-name` で識別する。
