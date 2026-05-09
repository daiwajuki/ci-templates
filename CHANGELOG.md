# Changelog

## [0.5.0] - 2026-05-09

### Added

- `deploy-cloudrun-next.yml`: `GH_PACKAGES_TOKEN` secret を受け付け（#9）。image モードで `npm ci` が GitHub Packages の private パッケージ（`@daiwajuki/auth` 等）を解決する用途
- `deploy-cloudrun-next.yml`: `GH_PACKAGES_TOKEN` 未指定時に `secrets.GITHUB_TOKEN` から自動注入（#7）。呼び出し側で明示しなくても same-repo / 同一 owner の private パッケージにアクセス可能

### Fixed

- `deploy-cloudrun-next.yml`: `build-args` input description 内の `${{ }}`-like syntax を完全に剥がして reusable workflow パース失敗を回避（#8）

### Notes

- 既存呼び出し側に変更不要（追加 secret はオプショナル、`GITHUB_TOKEN` フォールバックあり）
- private パッケージ参照側（`colocate-repo` で `_design-system` を取り込み、その中で GitHub Packages の `@daiwajuki/auth` を `npm ci` するケース等）は `GH_PACKAGES_TOKEN: ${{ secrets.GH_PACKAGES_TOKEN }}` を呼び出し側に明示すると、cross-owner の private パッケージにもアクセス可能
- `@v0` floating tag は本リリースを指す

## [0.4.3] - 2026-05-09

### Fixed

- `deploy-cloudrun-next.yml`: `build-args` input description 内の `${{ }}` リテラルが reusable workflow としてパースされる問題を回避するため description をエスケープ（#6）

## [0.4.2] - 2026-05-09

### Added

- `deploy-cloudrun-next.yml`: `build-args` input を追加（#5）。Dockerfile ビルド時の `--build-arg` を改行区切りで複数渡せる（image モードのみ）

## [0.4.1] - 2026-05-09

### Fixed

- `ci-next.yml`: `colocate-token` secret を `COLOCATE_TOKEN` にリネーム。GitHub Actions の secret 名はハイフン不可（英数字とアンダースコアのみ）の仕様で、旧名は空文字に評価されて `github.token` フォールバックが効き、クロスリポジトリ private アクセスで 403 になっていた

### Breaking change（v0.2.0〜v0.4.0 の `colocate-token` 利用者向け）

呼び出し側の `secrets:` ブロックを以下のように更新する必要あり:

```yaml
# Before (v0.2.0〜v0.4.0)
secrets:
  colocate-token: ${{ secrets.DS_REPO_TOKEN }}

# After (v0.4.1+)
secrets:
  COLOCATE_TOKEN: ${{ secrets.DS_REPO_TOKEN }}
```

`@v0` floating tag は本リリースを指す。旧名のまま `colocate-repo` を private で使っていた呼び出し側は build 失敗するため、本フィックスに合わせて更新が必要。

## [0.4.0] - 2026-05-09

### Added

- `deploy-cloudrun-next.yml`: Next.js 用 Cloud Run デプロイ Reusable Workflow
  - `build-mode: source|image` 切替（Buildpacks / Dockerfile）
  - `colocate-repo` サポート（image モードで `_design-system` 等を Docker context に含める用）
  - `smoke-path` / `smoke-expected-statuses` で柔軟なスモーク（auth redirect の 302/307 許容デフォルト）
  - 失敗時 rollback、route-to-latest
- `docs/usage-deploy-next.md`: 利用ガイド

### Notes

- これで Next.js / Laravel / FastAPI の 3 スタック × CI / Deploy で **6 種の reusable workflow** が揃った
- 既存呼び出し側に変更不要

## [0.3.0] - 2026-05-09

### Added

- `ci-laravel.yml`: Laravel 用 reusable workflow（PHP setup → composer → optional pint → artisan test）
  - inputs: `php-version` / `working-directory` / `php-extensions` / `composer-args` / `run-pint` / `run-tests` / `test-args` / `env-from-example` / `cache-composer`
- `ci-fastapi.yml`: FastAPI / Python 用 reusable workflow（uv / poetry / pip 切替）
  - inputs: `python-version` / `working-directory` / `package-manager` / `install-command` / `extra-test-deps` / `test-command` / `run-tests` / `run-ruff` / `run-mypy`
- `deploy-cloudrun-laravel.yml`: Cloud Run デプロイ（`build-mode: source|image` 切替対応）
  - source モード: Buildpacks（Dockerfile 不要）/ image モード: Dockerfile + buildx
  - OIDC ID Token によるスモークテスト、追加検証パス対応、失敗時 rollback
- `deploy-cloudrun-fastapi.yml`: Cloud Run デプロイ（image 固定）
  - buildx + Artifact Registry push、多パススモーク（順次試行）、失敗時 rollback
- `docs/usage-ci-laravel.md` / `docs/usage-ci-fastapi.md` / `docs/usage-deploy-laravel.md` / `docs/usage-deploy-fastapi.md`: 各 workflow の利用ガイド

### Notes

- 既存 `ci-next.yml` 呼び出し側に変更不要
- MINOR バージョン更新のため `@v0` floating tag は本リリースを指す
- Laravel デプロイは多数派の Buildpacks 方式をデフォルト、Dockerfile 派は `build-mode: image` で同一 workflow 内分岐
- FastAPI デプロイは現状全プロジェクトが Dockerfile 必須要件（Playwright 等）のため image 固定

## [0.2.0] - 2026-05-09

### Added

- `ci-next.yml`: `build-env` 入力を追加。`.env.local` に KEY=VALUE 複数行を追記する（`build-env-file` と併用可、後追記）
- `ci-next.yml`: `colocate-repo` / `colocate-ref` / `colocate-path` 入力 + `colocate-token` secret を追加。lint / typecheck / build 前に外部リポジトリを `GITHUB_WORKSPACE` 配下の相対パスへ配置する（兄弟ディレクトリ参照を要する `_design-system` 等向け）

### Notes

- 既存呼び出し側に変更不要（追加 input・secret は全てオプショナル）
- MINOR バージョン更新のため `@v0` floating tag は本リリースを指す

## [0.1.0] - 2026-05-09

### Added

- `ci-next.yml`: Next.js 用 reusable workflow（lint / typecheck / build）
  - inputs で各ステップの on/off、working-directory、build-env-file を制御可能
  - `package.json` の `scripts` を自動検出し、存在しないスクリプトはスキップ
- `.github/actions/setup-node-volta`: Volta フィールドを尊重した Node セットアップ composite action
- `self-test.yml`: `fixtures/minimal-next` を使った ci-next.yml のスモークテスト
- `docs/usage-ci-next.md`: ci-next.yml 利用ガイド
- `docs/versioning.md`: semver 運用・git タグ戦略
