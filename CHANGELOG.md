# Changelog

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
