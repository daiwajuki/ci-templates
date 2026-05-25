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
      colocate-repo: daiwajuki/daiwajuki-UIdesign
      colocate-ref: v1.12.0
      colocate-path: _design-system
      env-vars: |
        INTERNAL_API_BASE_URL=https://bidflow-api-501453986862.asia-northeast1.run.app
        INTERNAL_API_TOKEN=${{ secrets.INTERNAL_API_TOKEN }}
    secrets:
      COLOCATE_TOKEN: ${{ secrets.DS_REPO_TOKEN }}
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
| `colocate-repo` | string | `''` | ビルド前に sibling 配置する外部リポジトリ（旧パターン。新規利用は `additional-build-context-repos` 推奨）|
| `colocate-ref` | string | `''` | colocate-repo の ref |
| `colocate-path` | string | `''` | 配置先（リポジトリルートからの相対パス）|
| `additional-build-context-repos` | string | `''` | v0.7+ — BuildKit additional contexts に渡す追加 repo（改行区切り `name=owner/repo[@ref]`、image モードのみ）|
| `timeout-minutes` | number | `25` | ジョブタイムアウト |

### secrets

| secret | 必須 | 説明 |
|---|---|---|
| `COLOCATE_TOKEN` | 任意 | colocate-repo がプライベートの場合の PAT。未指定時は `github.token`。**v0.6.0 で `colocate-token` から rename**（GitHub Actions secret 名にハイフン不可のため） |
| `GH_PACKAGES_TOKEN` | 任意 | GitHub Packages の private dependency を取得するためのトークン (例: `@daiwajuki/ui-design`)。未指定時は `secrets.GITHUB_TOKEN` に自動フォールバック (同 owner の package まで読める)。詳細は下記「GitHub Packages 経由の private dependency」を参照 |
| `external-checkout-token` | 任意 | v0.7+ — `additional-build-context-repos` の private repo を clone する PAT。GitHub App 方式を使うならこれは不要 |
| `external-checkout-app-id` | 任意 | v0.7+ — GitHub App ID（推奨）。private key と組で install token を mint |
| `external-checkout-app-private-key` | 任意 | v0.7+ — GitHub App private key (PEM)。app-id と組で必須 |

## Workspace 共有 OAuth (推奨パターン)

`@daiwajuki/auth` を使う SaaS は **同じ Google OAuth Client を 19 SaaS で共有** する設計。
Cloud Run 側は `secrets-yaml` で Secret Manager の `workspace-google-*` を参照する:

```yaml
jobs:
    deploy:
        uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-next.yml@v0
        with:
            service-name: portal-web
            source-path: ./web
            secrets-yaml: |
                GOOGLE_CLIENT_ID=workspace-google-client-id:latest
                GOOGLE_CLIENT_SECRET=workspace-google-client-secret:latest
                AUTH_SECRET=workspace-auth-secret:latest
                MFA_ENCRYPTION_KEY=workspace-mfa-encryption-key:latest
            env-vars: |
                AUTH_URL=https://portal-web-xxxxxx.run.app
```

Secret Manager の事前作成 / Cloud Run サービスアカウントへの read 権限付与は
[docs/oauth-setup.md](./oauth-setup.md) を参照。

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

### caller 側の permissions

reusable workflow を呼ぶ caller workflow には最低限以下が必要：

```yaml
permissions:
  contents: read
  id-token: write
```

**GitHub Packages を `github.token` 経由で install したい場合**は `packages: read` も追加：

```yaml
permissions:
  contents: read
  id-token: write
  packages: read   # ← github.token で @daiwajuki/* 等を読む場合のみ
```

PAT (`GH_PACKAGES_TOKEN` org secret) を使うフローでは `packages: read` は不要。

> 📌 **v0.9.3 で修正:** v0.6.0〜v0.9.2 では reusable workflow 側が `packages: read` を要求していたため、caller がこれを granting していないと **startup_failure で 0 job のまま即終了** した（GitHub Actions の reusable workflow permissions 仕様）。v0.9.3 でテンプレートから外したため `@v0` 追従なら自動修復。

## GitHub Packages 経由の private dependency

`@daiwajuki/ui-design` / `@daiwajuki/auth` 等を GitHub Packages から取得する場合の前提。

### 認証フロー

reusable workflow 内部では以下の順で token を解決:

```
secrets.GH_PACKAGES_TOKEN  (caller 側で明示渡し or org secret)
       ↓ 未指定時
secrets.GITHUB_TOKEN       (auto-injected。同 owner の package まで読める)
```

`source` モードでは npm ci の env var、`image` モードでは Docker build-arg として注入される。

### caller 側の最小設定

```yaml
jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-next.yml@v0
    secrets: inherit  # ← これだけで GH_PACKAGES_TOKEN / GITHUB_TOKEN 両方が継承される
    with:
      build-mode: image
      ...
```

### Package 側の access 設定 (**必須**)

> ⚠ ここを忘れると `npm error 403 permission_denied: read_package` で必ず失敗する。これは workflow / token の問題ではなく **package の access policy** の問題。

1. GitHub Web UI で対象 package の settings を開く
   - 例: https://github.com/orgs/daiwajuki/packages/npm/ui-design/settings
2. **Manage Actions access** → **Add Repository** → 利用する consumer リポジトリを Read role で追加
3. (推奨) **Connect Repository** で source repo を link しておくと、source repo の collaborator が自動継承される

複数 package・複数 consumer の組合せがあるため、新規プロジェクト追加時は **必ず両方の package 側で access を付与** すること。

## トラブルシューティング

| 症状 | 原因 | 解決 |
|---|---|---|
| Buildpack が Next.js を検出しない | `package.json` の `scripts.build` が無い | `"build": "next build"` を追加 |
| image build で `COPY _design-system` が失敗 | colocate-path がコンテキスト外 | `build-context: '.'` にする |
| smoke で 503 が返り続ける | コンテナが起動失敗 | Cloud Run logs を確認、`PORT` env を読んでいるか / Dockerfile の CMD を点検 |
| 認証 redirect で 401 になる | `smoke-expected-statuses` に 401 が無い | 専用 health endpoint を作るのが推奨 |
| `npm error 403 permission_denied: read_package` (例: `@daiwajuki/ui-design`) | Package 側の Manage Actions access に consumer repo が無い | 上記「Package 側の access 設定」参照。token 側ではなく package 側の権限問題 |

## v0.7+ 追加: 外部 repo を BuildKit context に同梱

`additional-build-context-repos` で別 repo を build context として注入できる（`colocate-repo` の上位互換、複数 repo 同時に指定可）。

```yaml
jobs:
  deploy:
    uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-next.yml@v0
    with:
      build-mode: image
      service-name: bidflow-web
      source-path: ./web
      build-context: ./web
      dockerfile-path: Dockerfile
      ar-repo: bidflow
      image-name: web
      additional-build-context-repos: |
        ui-design=daiwajuki/daiwajuki-UIdesign@v1.12.0
        forms-py=daiwajuki/pdf-forms@main
    secrets: inherit
```

Dockerfile では `--from=<name>` で参照：

```dockerfile
COPY --from=ui-design . /app/_design-system
COPY --from=forms-py packages/forms-py /tmp/forms-py
```

### colocate-repo との違い

| 観点 | colocate-repo（旧） | additional-build-context-repos（v0.7+） |
|---|---|---|
| 同時に指定できる repo 数 | 1 個 | 複数 |
| build context への組込 | sibling として配置（`COPY ../_design-system`） | BuildKit `--from=<name>` 参照 |
| Dockerfile 側のパス依存 | コンテキスト構造に縛られる | `name` で論理参照、配置自由 |
| 認証 | `COLOCATE_TOKEN` (PAT) | GitHub App credentials (推奨) or PAT or github.token |

新規プロジェクトでは `additional-build-context-repos` を推奨。既存の `colocate-repo` 採用 (BidFlow web 等) は当面そのまま動く。

### 認証方式

優先順:

1. **GitHub App credentials**（推奨。短命・権限境界明確）
2. **PAT** (`external-checkout-token`)
3. **github.token** (fallback、同 repo・public のみ)

詳細は [usage-deploy-laravel.md](usage-deploy-laravel.md) の同セクション参照。

