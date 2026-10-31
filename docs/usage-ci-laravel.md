# ci-laravel.yml 利用ガイド

Laravel プロジェクトの CI（PHP セットアップ → composer install → pint → artisan test）を Reusable Workflow として提供する。

## 基本的な使い方

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  api:
    uses: daiwajuki/ci-templates/.github/workflows/ci-laravel.yml@v0
    with:
      working-directory: api
```

## inputs 一覧

| input | 型 | デフォルト | 説明 |
|---|---|---|---|
| `php-version` | string | `'8.4'` | PHP バージョン |
| `working-directory` | string | `'.'` | Laravel プロジェクトルート |
| `php-extensions` | string | `'mbstring, pdo, pdo_pgsql, pdo_sqlite, bcmath'` | setup-php に渡す拡張 |
| `composer-args` | string | `'--prefer-dist --no-interaction --no-progress'` | composer install 引数 |
| `run-pint` | boolean | `false` | `vendor/bin/pint --test` を実行 |
| `run-tests` | boolean | `true` | `php artisan test` を実行 |
| `test-args` | string | `''` | artisan test 追加引数（例: `--parallel`） |
| `env-from-example` | boolean | `true` | `.env.example` をコピーして `key:generate` |
| `cache-composer` | boolean | `true` | composer キャッシュを使う |
| `colocate-repo` | string | `''` | composer install 前に sibling パスへ配置する外部リポジトリ（`owner/repo` 形式）。composer の path repository で共通基盤を読む consumer 向け。ci / postgres-tests の両ジョブに置く |
| `colocate-ref` | string | `''` | colocate-repo のチェックアウト ref（タグ・ブランチ・SHA） |
| `colocate-path` | string | `''` | colocate-repo の配置先（`GITHUB_WORKSPACE` からの相対パス） |

private な colocate-repo は secrets の `external-checkout-app-id` / `external-checkout-app-private-key`（GitHub App）で checkout する（ci-next.yml と同じ）。

```yaml
    with:
      working-directory: api
      # api/composer.json の path repository: ../../_catalog/packages/catalog-php
      colocate-repo: daiwajuki/catalog
      colocate-ref: catalog-v0.1.0
      colocate-path: ../_catalog
    secrets:
      external-checkout-app-id: ${{ secrets.DAIWAJUKI_APP_ID }}
      external-checkout-app-private-key: ${{ secrets.DAIWAJUKI_APP_PRIVATE_KEY }}
```

## ICPCostHub の `ci.yml` に組み込む例

Next.js 側と Laravel 側を 2 ジョブで並列実行：

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:

jobs:
  web:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      working-directory: web

  api:
    uses: daiwajuki/ci-templates/.github/workflows/ci-laravel.yml@v0
    with:
      working-directory: api
```

## トラブルシューティング

| 症状 | 原因 | 解決 |
|---|---|---|
| `Could not find driver` | 必要な PDO 拡張が未指定 | `php-extensions` に `pdo_mysql` 等を追加 |
| `key:generate` で失敗 | `.env` 未生成 | `.env.example` をコミットに含める |
| `pint` が見つからない | dev 依存に未追加 | `composer require laravel/pint --dev` を実施 |
