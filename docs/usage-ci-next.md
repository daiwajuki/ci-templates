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
    uses: daiwajuki/daiwajuki-ci-templates/.github/workflows/ci-next.yml@v0
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

## ケース別設定例

### ICPCostHub のような Next.js + FastAPI 構成（web/ サブディレクトリ）

```yaml
jobs:
  ci:
    uses: daiwajuki/daiwajuki-ci-templates/.github/workflows/ci-next.yml@v0
    with:
      working-directory: web
```

### ビルドに環境変数が必要なプロジェクト

```yaml
jobs:
  ci:
    uses: daiwajuki/daiwajuki-ci-templates/.github/workflows/ci-next.yml@v0
    with:
      build-env-file: .env.ci
    secrets: inherit
```

`.env.ci` を `build-env-file` で指定すると、ビルド前に `.env.local` としてコピーされる。  
機密値は GitHub Secrets に入れて workflow_call 側から `secrets: inherit` で伝搬させる。

### lint のみ（typecheck・build はスキップ）

```yaml
jobs:
  ci:
    uses: daiwajuki/daiwajuki-ci-templates/.github/workflows/ci-next.yml@v0
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
