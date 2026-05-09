# バージョニング運用ガイド

## semver 規則

| バージョン | 条件 |
|---|---|
| **MAJOR** | reusable workflow の `inputs` / `secrets` 削除・型変更、composite action の必須 inputs 追加、base image のメジャー変更（Node 20→22 等） |
| **MINOR** | 新規 workflow / composite action 追加、optional inputs 追加、Dockerfile テンプレート追加 |
| **PATCH** | バグ修正、依存 action のバージョン上げ（破壊なし）、ドキュメント修正 |

## `v0.x` の間

`v0.x` は**破壊変更を MINOR で行うことがある**。`v1.0.0` リリース以降から上記 semver を厳格適用する。

## git タグ戦略

```bash
# リリース時
git tag v0.1.0
git tag -f v0   # floating major タグを更新

# v1.0.0 以降
git tag v1.0.0
git tag -f v1
git push origin v1.0.0
git push origin v1 --force
```

各プロジェクトの `uses:` では floating major タグを参照する：

```yaml
uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v1
```

これにより **PATCH / MINOR は全プロジェクトに自動波及**し、MAJOR はタグを上げる明示的な操作が必要になる。

## CHANGELOG

`CHANGELOG.md` は [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) 形式で管理する。  
Breaking Change には `### Breaking` セクションを必ず追加する。

## プロジェクト側での追従

MAJOR バージョンアップ時は `audit-ci-drift.mjs`（Phase C 以降）が全プロジェクトのドリフトを検出する。  
それまでは `_ci-templates` の CHANGELOG を確認し、各プロジェクトの `uses: @vN` のタグを手動更新する。
