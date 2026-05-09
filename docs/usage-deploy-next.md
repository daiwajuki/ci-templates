# deploy-cloudrun-next.yml 利用ガイド

Next.js アプリを Cloud Run にデプロイする Reusable Workflow。WIF 認証 → ビルド → デプロイ → スモーク → 失敗時 rollback。

## ビルドモードの選択

| `build-mode` | 仕組み | 必要なファイル | 推奨ケース |
|---|---|---|---|
| `source`（デフォルト）| Cloud Build + Buildpacks（Node.js buildpack 自動選択） | なし | 標準的な Next.js（`npm run build` で済む）|
| `image` | runner 上で Docker buildx → Artifact Registry に push | `Dockerfile` 必須 | スタンドアロン出力・`_design-system` 等の兄弟ディレクトリ参照・カスタムランタイムが必要 |

## 基本（source モード）

```yaml
# .github/workflows/deploy-web.yml
name: Deploy Web (Next.js)
on:
  push:
    branches: [main]
    paths:
      - 'web/**'
      - '.github/workflows/deploy-web.yml'
  workflow_dispatch:

jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-next.yml@v0
    with:
      service-name: icp-cost-hub-web
      source-path: ./web
```

## image モード（_design-system を含む Docker build）

BidFlow のように `_design-system` を兄弟配置してビルドコンテキストに含めるパターン：

```yaml
jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-next.yml@v0
    with:
      build-mode: image
      service-name: bidflow-web
      source-path: ./web
      build-context: '.'
      dockerfile-path: web/Dockerfile
      ar-repo: bidflow
      image-name: web
      colocate-repo: r-taniguchi-daiwajuki/_design-system
      colocate-ref: v1.12.0
      colocate-path: _design-system
      env-vars: |
        INTERNAL_API_BASE_URL=https://bidflow-api-501453986862.asia-northeast1.run.app
        INTERNAL_API_TOKEN=${{ secrets.INTERNAL_API_TOKEN }}
    secrets:
      colocate-token: ${{ secrets.DS_REPO_TOKEN }}
```

## inputs 一覧

| input | 型 | デフォルト | 説明 |
|---|---|---|---|
| `service-name` | string | **必須** | Cloud Run サービス名 |
| `source-path` | string | `'./web'` | source モード時のデプロイ対象 |
| `region` | string | `''` | 空の場合 `vars.GCP_REGION` を使用 |
| `build-mode` | string | `'source'` | `source` または `image` |
| `ar-repo` | string | `''` | image モード時に必須 |
| `image-name` | string | `''` | image モード時に必須 |
| `dockerfile-path` | string | `''` | Dockerfile への相対パス（build-context 基準）。空なら docker のデフォルト探索 |
| `build-context` | string | `''` | image モード時のビルドコンテキスト。空なら source-path を使用。`.` を指定するとリポジトリルート全体 |
| `env-vars` | string | `''` | Cloud Run env_vars |
| `secrets-yaml` | string | `''` | Secret Manager 注入 |
| `smoke-path` | string | `'/'` | スモーク対象パス |
| `smoke-expected-statuses` | string | `'200 302 307'` | 成功と判定する HTTP ステータス（スペース区切り）|
| `enable-rollback` | boolean | `true` | 失敗時に前リビジョンへ戻す |
| `route-to-latest` | boolean | `true` | 成功時に latest へ 100% トラフィック |
| `colocate-repo` | string | `''` | ビルド前に sibling 配置する外部リポジトリ |
| `colocate-ref` | string | `''` | colocate-repo の ref |
| `colocate-path` | string | `''` | 配置先（リポジトリルートからの相対パス）|
| `timeout-minutes` | number | `25` | ジョブタイムアウト |

### secrets

| secret | 必須 | 説明 |
|---|---|---|
| `colocate-token` | 任意 | colocate-repo がプライベートの場合の PAT。未指定時は `github.token` |

## なぜ smoke で 200/302/307 を許容するか

Next.js の認証ミドルウェア（`middleware.ts`）が未認証アクセスを `/login` に 307 リダイレクトする実装が多いため、ルート `/` にアクセスして 200 が返るとは限らない。`200 / 302 / 307` のいずれかが返れば「サーバが起動している」と判定する。

認証不要の専用ヘルスエンドポイント（例: `/api/health`）がある場合は `smoke-path: /api/health` を指定して 200 のみ許容する設計が望ましい。

## colocate-repo の使い所

Next.js の Docker build context に **`_design-system` を含めたい**ケースで使う：

```
リポジトリルート/
├── web/
│   └── Dockerfile        # COPY ../_design-system /app/_design-system
└── _design-system/        # ← colocate-checkout で配置
```

`colocate-path: _design-system` を指定すると、checkout 後に `actions/checkout@v4` が `<workspace>/_design-system` に外部リポを clone する。Dockerfile 内では `COPY _design-system /app/_design-system` で参照可能。

build-context は `.`（リポジトリルート）にする必要がある点に注意。

## 必要な GitHub 設定

caller の repository に以下を設定：

### Variables
- `WIF_PROVIDER` / `WIF_SERVICE_ACCOUNT` / `GCP_PROJECT_ID` / `GCP_REGION`

### Secrets（任意）
- `DS_REPO_TOKEN` — `_design-system` を colocate-repo として使う場合の PAT（Contents: Read-only）

## トラブルシューティング

| 症状 | 原因 | 解決 |
|---|---|---|
| Buildpack が Next.js を検出しない | `package.json` の `scripts.build` が無い | `"build": "next build"` を追加 |
| image build で `COPY _design-system` が失敗 | colocate-path がコンテキスト外 | `build-context: '.'` にする |
| smoke で 503 が返り続ける | コンテナが起動失敗 | Cloud Run logs を確認、`PORT` env を読んでいるか / Dockerfile の CMD を点検 |
| 認証 redirect で 401 になる | `smoke-expected-statuses` に 401 が無い | 専用 health endpoint を作るのが推奨 |
