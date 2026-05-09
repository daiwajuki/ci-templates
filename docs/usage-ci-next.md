# ci-next.yml 利用ガイド

## 基本的な使い方

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

## inputs 一覧

| input | 型 | デフォルト | 説明 |
|---|---|---|---|
| `node-version` | string | `'20'` | Volta フィールドがない場合のフォールバック |
| `working-directory` | string | `'.'` | Next.js プロジェクトルート |
| `run-lint` | boolean | `true` | `npm run lint` を実行するか |
| `run-typecheck` | boolean | `true` | `npm run typecheck` を実行するか |
| `run-build` | boolean | `true` | `npm run build` を実行するか |
| `build-env-file` | string | `''` | ビルド時に `.env.local` としてコピーする env ファイルのパス |
| `build-env` | string | `''` | ビルド時に `.env.local` に追記する KEY=VALUE 複数行（`build-env-file` の後に追記） |
| `colocate-repo` | string | `''` | lint/typecheck/build 前に sibling パスへ配置する外部リポジトリ（`owner/repo` 形式） |
| `colocate-ref` | string | `''` | colocate-repo のチェックアウト ref（タグ・ブランチ・SHA） |
| `colocate-path` | string | `''` | colocate-repo の配置先（`GITHUB_WORKSPACE` からの相対パス） |

## secrets 一覧

| secret | 必須 | 説明 |
|---|---|---|
| `colocate-token` | optional | colocate-repo がプライベートの場合のアクセストークン（未指定時は `github.token`） |

## ケース別設定例

### ICPCostHub のような Next.js + FastAPI 構成（web/ サブディレクトリ）

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      working-directory: web
```

### ビルドに環境変数が必要なプロジェクト

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      build-env-file: .env.ci
    secrets: inherit
```

`.env.ci` を `build-env-file` で指定すると、ビルド前に `.env.local` としてコピーされる。  
機密値は GitHub Secrets に入れて workflow_call 側から `secrets: inherit` で伝搬させる。

### ビルド時に固定の環境変数（fixture）を注入する

DB 接続文字列のようにビルド時に必要だが機密ではない値（`localhost` 向け fixture 等）はインラインで渡せる:

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      build-env: |
        DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app
        NEXT_PUBLIC_API_BASE=http://localhost:3000
```

機密値は `build-env-file` + `secrets: inherit` で渡すこと（`build-env` はワークフローログに値が露出する可能性がある）。

### `_design-system` のような兄弟リポジトリを co-locate する

`globals.css` の `@import "../../_design-system/..."` のように、ワークスペースの親ディレクトリに兄弟パッケージが必要なプロジェクト向け:

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      colocate-repo: r-taniguchi-daiwajuki/_design-system
      colocate-ref: v1.11.0
      colocate-path: ../_design-system
    secrets:
      colocate-token: ${{ secrets.DS_REPO_TOKEN }}
```

挙動:
1. `actions/checkout` で `colocate-repo` を `__colocate__/` に取得
2. `cp -r` で `$GITHUB_WORKSPACE/$COLOCATE_PATH` へ配置
3. `__colocate__/` を削除

`colocate-path` が `../*` の場合、ワークスペースの親に配置される。プライベートリポジトリの場合は `colocate-token` 必須。

### lint のみ（typecheck・build はスキップ）

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      run-typecheck: false
      run-build: false
```

## スクリプト自動検出

`lint` / `typecheck` ステップは `package.json` の `scripts` にそのキーが存在する場合のみ実行される。  
スクリプトが無い場合はスキップされるため、エラーにならない。

## Volta 対応

`package.json` に `volta.node` フィールドがある場合、そのバージョンが優先される。

```json
{
  "volta": {
    "node": "20"
  }
}
```

ない場合は `node-version` input（デフォルト `20`）が使われる。

## トラブルシュート

### ビルドが「Missing env variable」で落ちる

ビルド時に必要な環境変数が不足している。  
1. `build-env-file: .env.ci` を指定してリポジトリにコミット済みの env ファイルを渡す
2. または機密値を GitHub Secrets に入れて呼び出し側 workflow で `env:` に展開する

### `npm ci` が失敗する

`package-lock.json` がコミットされているか確認。`.gitignore` で除外されていると CI でエラーになる。
