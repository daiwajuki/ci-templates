# Changelog

## [0.1.0] - 2026-05-09

### Added

- `ci-next.yml`: Next.js 用 reusable workflow（lint / typecheck / build）
  - inputs で各ステップの on/off、working-directory、build-env-file を制御可能
  - `package.json` の `scripts` を自動検出し、存在しないスクリプトはスキップ
- `.github/actions/setup-node-volta`: Volta フィールドを尊重した Node セットアップ composite action
- `self-test.yml`: `fixtures/minimal-next` を使った ci-next.yml のスモークテスト
- `docs/usage-ci-next.md`: ci-next.yml 利用ガイド
- `docs/versioning.md`: semver 運用・git タグ戦略
