# Secrets Management Runbook

> **対象**: `daiwajuki` org の 14 業務 SaaS プロジェクト + 3 共通基盤
> **位置付け**: governance-plan v3 Wave 0 ステップ 6 で確立した secret 体系の正本
> **前提**: 1 人開発体制（r-taniguchi@daiwajuki.co.jp）、machine user は採らない、fine-grained PAT で運用

## トークン一覧

| トークン名 | 用途 | スコープ | 有効期限 | 保管場所 | 配備先 |
|---|---|---|---|---|---|
| `GH_PACKAGES_TOKEN` | `@daiwajuki/*` private packages の install | `read:packages` | 1 年 | 1Password `daiwajuki-ops` ボルト | `daiwajuki` org secret (All repositories) |
| `AUTH_REPO_TOKEN` | `_auth` リポを cross-repo clone | `contents: read` (`daiwajuki/daiwajuki-auth` のみ) | 1 年 | 同上 | 各 consumer repo の secret |
| `DS_REPO_TOKEN` | `_design-system` リポを cross-repo clone | `contents: read` (`daiwajuki/daiwajuki-UIdesign` のみ) | 1 年 | 同上 | 各 consumer repo の secret |
| `ADOPTER_NOTIFY_TOKEN`（将来） | 採用側 14 リポへの Issue 投稿 | `issues: write` (`daiwajuki/*` 全リポ) | 1 年 | 同上 | `_auth` / `_design-system` / `_ci-templates` の secret |

**重要**: 上記すべて **r-taniguchi 個人名義の fine-grained PAT** で発行する。machine user は採らない（GitHub Team 課金 +$4/月と 2FA 管理の負担に見合わないため）。

## 発行手順（fine-grained PAT）

GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → **Generate new token**:

1. **Token name**: `daiwajuki-<purpose>-<YYYYMM>`
   - 例: `daiwajuki-packages-202605`
2. **Resource owner**: `daiwajuki` org（個人ではなく org を選択）
3. **Expiration**: Custom → 1 year
4. **Repository access**:
   - `GH_PACKAGES_TOKEN`: All repositories
   - `AUTH_REPO_TOKEN`: Only select repositories → `daiwajuki-auth`
   - `DS_REPO_TOKEN`: Only select repositories → `daiwajuki-UIdesign`
   - `ADOPTER_NOTIFY_TOKEN`: All repositories（or 14 consumer リポ個別）
5. **Permissions**: Repository permissions の必要最小スコープ（上の表を参照）
6. **Generate** → トークン文字列を **すぐに** 1Password に保存（画面遷移すると二度と見られない）

## 配備手順

```bash
# daiwajuki org secret に配備（GH_PACKAGES_TOKEN 等の org-wide secret）
gh secret set GH_PACKAGES_TOKEN \
  --org daiwajuki \
  --visibility all \
  --body "<token-string>"

# 各 consumer repo に配備（AUTH_REPO_TOKEN / DS_REPO_TOKEN）
gh secret set AUTH_REPO_TOKEN --repo daiwajuki/Portal --body "<token-string>"
gh secret set DS_REPO_TOKEN  --repo daiwajuki/Portal --body "<token-string>"
# ... 14 consumer リポに同様に配備

# 配備の確認
gh secret list --org daiwajuki
gh secret list --repo daiwajuki/Portal
```

ファンアウト配備は `_auth/scripts/deploy-auth-yml.mjs` を参考に `_ci-templates/scripts/deploy-secrets.mjs`（未実装、必要時に追加）を作る想定。

## secret 名の制約と reusable workflow での扱い

### 制約 1: secret 名は UPPER_SNAKE_CASE のみ

GitHub Actions の仕様で secret 名にハイフンは使えない（実装上は受理されるが、`${{ secrets.foo-bar }}` の参照で空文字に評価される）。

```
❌ colocate-token           # 空文字に評価される、認証が github.token フォールバックに落ちる
✅ COLOCATE_TOKEN           # 正常
✅ GH_PACKAGES_TOKEN
```

過去事故: `_ci-templates` v0.4.1 で `colocate-token` 名のまま PATCH リリースした結果、`@v0` 採用側 14 プロジェクト中 13 の CI が静かに壊れた（フォールバックされた `github.token` では cross-repo package が 403 になるため）。

### 制約 2: 採用側は `secrets: inherit` 必須

`_ci-templates` の reusable workflow を呼ぶ採用側 workflow は **`secrets: inherit` を必ず付ける**。これがないと org-level secret (`GH_PACKAGES_TOKEN` 等) が reusable workflow に届かない。

```yaml
# 採用側 (各 consumer リポ) の .github/workflows/ci.yml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    secrets: inherit   # ★ 必須。これがないと GH_PACKAGES_TOKEN が届かない
```

過去事故: Portal CI が `secrets: inherit` 欠落で 5 連続失敗（v0.5.0 リリース時の試行錯誤期）。

## GitHub Security log alert（必須設定）

`daiwajuki` org Settings → **Security log** → **Subscribe**（メール通知）:
- PAT の異常利用（地理的に離れた IP からの利用、急増する API call 等）を即時検知
- 1 年 PAT 有効化のリスクを軽減する最重要設定

## 緊急失効手順

トークン漏洩・退職・端末紛失が疑われる場合:

### 即時（5 分以内に実施）

1. GitHub Settings → Developer settings → Personal access tokens → 該当 PAT の **Delete** ボタン
2. 配備済み org secret / repo secret を delete（`gh secret delete <name> --org daiwajuki`）

### 代替経路: 経営側 org owner による失効

r-taniguchi がアクセス不可状態の場合、経営側で実施:

1. `daiwajuki.co.jp` の **Google Workspace 管理画面** → ユーザー → r-taniguchi → アカウント停止
2. GitHub SSO 連携が切れる
3. GitHub `daiwajuki` org Settings → **People** → r-taniguchi → Manage access → **Remove from organization**
4. 該当 PAT は自動 revoke される（GitHub org の SSO 強制設定により）

### 復旧

1. CI が落ちることを確認（意図した動作）
2. 新管理者が同名 PAT を再発行（上の発行手順を参照）
3. org secret / repo secret を更新
4. 各 consumer リポで CI を手動 trigger（`gh workflow run <workflow.yml>`）→ green を確認

## 年次ローテーション手順

毎年 **12 月** に Google Calendar リマインダーで実施（PAT 期限切れ前に並行運用）:

```bash
# 1. 新 PAT を発行（旧と並行運用、名称に新年月を含める）
#    daiwajuki-packages-202612 など

# 2. org secret を新トークンに更新（旧 secret は名前変更で残す）
gh secret set GH_PACKAGES_TOKEN --org daiwajuki --visibility all --body "<new-token>"
gh secret set GH_PACKAGES_TOKEN_OLD --org daiwajuki --visibility all --body "<old-token>"

# 3. CI で動作確認（最低 1 週）
#    各 consumer の最近の deploy workflow を再走させて green を確認

# 4. 旧 PAT を revoke
#    GitHub Settings → PAT 一覧から旧トークンを Delete

# 5. _OLD secret を削除
gh secret delete GH_PACKAGES_TOKEN_OLD --org daiwajuki

# 6. 1Password の旧エントリを Archive（履歴として残すが現役ではない）
```

## 退職者処理（業務引継ぎ）

1. **org owner 移管**: 新管理者を `daiwajuki` org owner に昇格（GitHub org Settings → People）
2. **1Password ボルト移管**: `daiwajuki-ops` ボルトの共有を新管理者に移管
3. **PAT 失効**: 旧管理者の PAT を順次 revoke（上の緊急失効手順を参照）
4. **PAT 再発行**: 新管理者が同名 PAT を再発行
5. **secret 更新**: org secret / repo secret を新管理者発行のトークンに更新
6. **CI 動作確認**: 全 14 consumer の最近の deploy workflow を再走させて green を確認
7. **Google Workspace**: 旧管理者の `r-taniguchi@daiwajuki.co.jp` アカウントを停止
8. **CompanyWebsite 等の本番運用**: 旧 PAT を使う Cloud Run / Cloud Build トリガーが残っていないか監査

## OIDC で代替できる箇所（PAT を削減するロードマップ）

| 用途 | 現状 | OIDC 化 | 削減対象 |
|---|---|---|---|
| Cloud Run / Artifact Registry へのデプロイ | WIF | ✅ 実装済み | PAT 不要 |
| GitHub Packages の install | `GH_PACKAGES_TOKEN` | ❌ GitHub 仕様で未対応 | 削減不可 |
| `_auth` / `_design-system` の cross-repo clone | `AUTH_REPO_TOKEN` / `DS_REPO_TOKEN` | ⚠ `gh` CLI 経由なら OIDC で代替可能 | 将来削減候補 |
| 採用側 14 リポへの Issue 投稿（将来） | `ADOPTER_NOTIFY_TOKEN`（未実装） | ✅ `gh` CLI + OIDC で実装予定 | PAT 不要 |

## 関連文書

- governance-plan v3: `~/.claude/plans/github-sharded-platypus.md` Wave 0 ステップ 5-6
- `_auth/docs/runbook.md` — secret rotation 章は本ドキュメントへ統合済み
- `_auth/docs/threat-model.md` — 個人 Gmail / 個人 PAT 依存の脅威記述

## 履歴

- 2026-05-22 初版（governance-plan v3 Wave 0 ステップ 6 で作成）
