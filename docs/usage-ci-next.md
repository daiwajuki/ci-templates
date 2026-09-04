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
| `run-test` | boolean | `false`（opt-in） | `npm test` を実行するか |
| `run-audit` | boolean | `false`（opt-in） | `npm audit` を実行するか |
| `audit-level` | string | `'high'` | `npm audit --audit-level` に渡す最小重要度 |
| `audit-omit-dev` | boolean | `false` | `npm audit` に `--omit=dev` を付与し、本番依存のみをゲート対象にする。devDependencies（lint/test 系ツールチェーン）の脆弱性に上流の非破壊修正が無く全 PR がブロックされ続ける場合の逃げ道。本番依存の防御は維持される |
| `audit-fail-on-registry-error` | boolean | `false` | `npm audit` がレジストリの audit エンドポイント障害で落ちたときにジョブを失敗させるか。既定は 3 回リトライ後に warning を出して監査をスキップする（脆弱性が見つかった場合はこの値に関係なく失敗する） |
| `legacy-peer-deps` | boolean | `false` | `npm ci` に `--legacy-peer-deps` を付与するか（Next.js メジャーバージョン先取り等で peer dependency が ERESOLVE になる consumer 向け） |
| `build-env-file` | string | `''` | ビルド時に `.env.local` としてコピーする env ファイルのパス |
| `build-env` | string | `''` | ビルド時に `.env.local` に追記する KEY=VALUE 複数行（`build-env-file` の後に追記） |
| `colocate-repo` | string | `''` | lint/typecheck/build 前に sibling パスへ配置する外部リポジトリ（`owner/repo` 形式） |
| `colocate-ref` | string | `''` | colocate-repo のチェックアウト ref（タグ・ブランチ・SHA） |
| `colocate-path` | string | `''` | colocate-repo の配置先（`GITHUB_WORKSPACE` からの相対パス） |
| `colocate-repo-2` | string | `''` | 2つ目の colocate 対象リポジトリ。`_auth` + `_design-system` の両方を `file:` 依存する consumer 向け |
| `colocate-ref-2` | string | `''` | colocate-repo-2 のチェックアウト ref |
| `colocate-path-2` | string | `''` | colocate-repo-2 の配置先 |

## secrets 一覧

| secret | 必須 | 説明 |
|---|---|---|
| `COLOCATE_TOKEN` | optional | colocate-repo がプライベートの場合のアクセストークン（未指定時は `github.token`） |

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
      colocate-repo: daiwajuki/daiwajuki-UIdesign
      colocate-ref: v1.11.0
      colocate-path: ../_design-system
    secrets:
      COLOCATE_TOKEN: ${{ secrets.DS_REPO_TOKEN }}
```

挙動:
1. `actions/checkout` で `colocate-repo` を `__colocate__/` に取得
2. `cp -r` で `$GITHUB_WORKSPACE/$COLOCATE_PATH` へ配置
3. `__colocate__/` を削除

`colocate-path` が `../*` の場合、ワークスペースの親に配置される。プライベートリポジトリの場合は `COLOCATE_TOKEN` 必須。

### `_auth` + `_design-system` の両方を co-locate する

`@daiwajuki/auth`（`file:../../_auth`）と `@daiwajuki/ui-design`（`file:../../_design-system`）の両方に依存する
consumer（14 プロジェクト共通構成）向け。`colocate-repo-2` は `colocate-repo` と独立して動作し、同じトークン
（App-mint > `COLOCATE_TOKEN` > `github.token`）を再利用する:

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      colocate-repo: daiwajuki/daiwajuki-auth
      colocate-ref: main
      colocate-path: ../_auth
      colocate-repo-2: daiwajuki/daiwajuki-UIdesign
      colocate-ref-2: main
      colocate-path-2: ../_design-system
    secrets:
      external-checkout-app-id: ${{ secrets.DAIWAJUKI_APP_ID }}
      external-checkout-app-private-key: ${{ secrets.DAIWAJUKI_APP_PRIVATE_KEY }}
```

### lint のみ（typecheck・build はスキップ）

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      run-typecheck: false
      run-build: false
```

### test / audit を有効化する

`run-test` / `run-audit` は既存 caller への影響を避けるため既定 `false`（opt-in）。  
テストが DB 等の外部リソースを要さない単体テストのみで完結するプロジェクト向け:

```yaml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      run-test: true
      run-audit: true
      audit-level: high
```

`npm test` が DB 接続等を必要とする場合は、この reusable workflow では対応しない
（サービスコンテナ等は呼び出し側 workflow で個別に組む、または将来 input で拡張する）。

#### レジストリ障害時の挙動

`npm audit` の失敗は「脆弱性が見つかった」と「レジストリの audit エンドポイントが応答しない」の 2 種類があり、
前者だけがゲートとして意味を持つ。後者はコード側に打つ手が無く、そのまま落とすと障害の間すべての PR が止まる
（2026-09-04 に npm の bulk advisory エンドポイントが断続的に無応答になり、npm 10 が退役済みの legacy quick
エンドポイントへフォールバックして 503 / 400 で落ちた）。

Audit ステップは npm CLI の固定文言 `audit endpoint returned an error` で両者を見分け、後者なら
`--fetch-timeout=30000` で 3 回リトライしたうえで **warning を出して監査をスキップ**する（ジョブは成功）。
障害でも必ず失敗させたい場合は `audit-fail-on-registry-error: true` を指定する。

## スクリプト自動検出

`lint` / `typecheck` / `test` ステップは `package.json` の `scripts` にそのキーが存在する場合のみ実行される。  
スクリプトが無い場合はスキップされるため、エラーにならない。`audit` はスクリプト検出の対象外（`npm audit` 組み込みコマンドを直接実行）。

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
