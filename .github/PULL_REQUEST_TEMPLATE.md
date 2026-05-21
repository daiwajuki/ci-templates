<!--
governance-plan v3 Wave B ステップ 14 で 3 共通基盤統一テンプレ。
本ファイルは _ci-templates / _auth / _design-system 共通フォーマット。
-->

## 概要

<!-- 1-3 文で「何を変えるか / なぜ変えるか」。 -->

## 変更タイプ

<!-- Conventional Commits の type を選択。複数該当する場合は、最も影響範囲が大きいものを選ぶ。 -->

- [ ] `feat:` 新機能追加（MINOR bump）
- [ ] `fix:` バグ修正（PATCH bump）
- [ ] `perf:` パフォーマンス改善（PATCH bump）
- [ ] `docs:` ドキュメント変更のみ（リリースなし）
- [ ] `chore:` 内部メンテ（リリースなし）
- [ ] `ci:` CI 設定変更（リリースなし）
- [ ] `test:` テスト追加・修正（リリースなし）
- [ ] `refactor:` リファクタ（リリースなし）
- [ ] `style:` フォーマット変更のみ（リリースなし）

## ⚠ Breaking change?

<!-- 採用側 (consumer プロジェクト) に追従修正を強いる変更か？ -->

- [ ] **Yes** — Breaking change を含む（`feat!:` または body に `BREAKING CHANGE:` を含める）
- [ ] **No** — 後方互換

### Breaking change がある場合の必須記載

<!-- Yes を選んだ場合、以下を埋める。release-please が CHANGELOG に自動転記する。 -->

**影響範囲**: <!-- どの API / 設定 / secret 名が変わるか -->

**Before / After**:

```yaml
# Before (vX.Y.Z)

# After (vX.Y.Z+1)
```

**採用側の追従手順**: <!-- 各 consumer プロジェクトでやるべき修正の最小手順 -->

## Test plan

<!-- レビュアーが merge 前に確認できるチェック項目。 -->

- [ ] CI が green
- [ ] 該当する fixture / consumer プロジェクトで動作確認済み
- [ ]
- [ ]

## 関連

<!-- リンク先 issue / PR / ADR / governance-plan のステップ番号など。 -->

-
