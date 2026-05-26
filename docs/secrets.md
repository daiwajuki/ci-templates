# Secrets Management Runbook

> **対象**: `daiwajuki` org の 14 業務 SaaS プロジェクト + 5 共通基盤 (`_auth` / `_design-system` / `_ci-templates` / `_pdf-forms` / `_tools`)
> **位置付け**: governance-plan v3 Wave 0 ステップ 6 で確立した secret 体系の正本
> **前提**: 1 人開発体制（r-taniguchi@daiwajuki.co.jp）、machine user は採らない、fine-grained PAT で運用
> **最終棚卸し**: 2026-05-26（旧 spec から実態へ整合）

## トークン一覧（実態ベース、2026-05-26 現在）

### org-level secret

| トークン名 | 用途 | 配備 | 中身 PAT | 備考 |
|---|---|---|---|---|
| `ORG_REPO_TOKEN` | (a) `@daiwajuki/*` private packages の install、(b) `daiwajuki/daiwajuki-UIdesign` の cross-repo clone を兼用 | visibility: all | fine-grained `daiwajuki-org-ci` (`contents: read` + `metadata: read`, 1 年) | 旧 spec の `GH_PACKAGES_TOKEN` + `DS_REPO_TOKEN` を統合した実装名。GitHub App 横展開完了後は (b) の役割を App credentials へ移譲し、本 secret は `read:packages` 専用に scope を絞る |

### repo-level secret（共通基盤）

| Repo | Secret | 用途 |
|---|---|---|
| `_auth` (daiwajuki/daiwajuki-auth) | （なし） | release-please / publish は `GITHUB_TOKEN` のみで完結 |
| `_design-system` (daiwajuki/daiwajuki-UIdesign) | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Storybook を Cloudflare Pages に deploy (`storybook-deploy.yml`) |
| `_ci-templates` (daiwajuki/ci-templates) | `ADOPTER_NOTIFY_TOKEN` | 採用側 14 リポへの Issue 投稿 (`notify-adopters.yml` / `audit-drift.yml`) |
| `_pdf-forms` (daiwajuki/pdf-forms) | `RELEASE_PAT` | release-please の tag push downstream trigger 用 (`release-please.yml:63`)。`secrets.GITHUB_TOKEN` fallback 付き |
| `_tools` (daiwajuki/tools) | `GH_PAT_READONLY` | `snapshot-adoption.yml:37` で `|| github.token` フォールバック付き参照。現状は fallback 経路で稼働 |

### repo-level secret（consumer 14 repo）

| Repo | DS_REPO_TOKEN | App credentials | その他 |
|---|---|---|---|
| BidFlow | ⚠️ 旧 PAT (2026-05-03、403 確定) | — | — |
| DailyLogs | ⚠️ 旧 PAT (同上) | — | — |
| ICPContacts | ⚠️ 旧 PAT (同上) | — | GCP_* (WIF) |
| PayrollManager | ⚠️ 旧 PAT (同上) | — | DB / Auth 系 |
| ICPEstimating | ⚠️ 旧 PAT (同上) | — | — |
| HydraulicCalculation | ⚠️ 旧 PAT (同上) | — | GCP_* (WIF) |
| CompanyWebsite | ⚠️ 中身は `daiwajuki-org-ci` PAT 流用 (2026-05-23 更新) | — | OAuth 系 |
| ICPSitePhotos | 残置 (2026-05-03、未使用) | — | `ORG_REPO_TOKEN` (repo に重複配備、2026-05-11) |
| **ICPCostHub** | 残置 (2026-05-03) | ✅ `DAIWAJUKI_APP_ID` / `DAIWAJUKI_APP_PRIVATE_KEY` | `PDF_FORMS_REPO_TOKEN` |
| portal | — | — | — |
| StridePlan | — | — | — |
| builddeck | — | — | — |
| contracthub-frontend | — | — | — |
| contracthub-backend | — | — | — |

**ICPCostHub の `DAIWAJUKI_APP_*` は GitHub App `daiwajuki-cross-repo-checkout` (app_id: 3820205) の credentials**。同 App permissions = `contents: read` + `metadata: read`。これが PAT 廃止に向けた推奨パターン（後述 OIDC ロードマップ）。

### 旧 spec で定義していたが、現在は配備していない

| 旧 spec 名 | 状態 | 理由 |
|---|---|---|
| `GH_PACKAGES_TOKEN` | 未配備 | `ORG_REPO_TOKEN` が兼用しているため |
| `AUTH_REPO_TOKEN` | 未配備 | `_auth` は GitHub Packages 経由で `@daiwajuki/auth` install しているため不要 |
| `EXTERNAL_CHECKOUT_TOKEN` | 未配備 | ICPCostHub のみ別名 `PDF_FORMS_REPO_TOKEN` で配備 |
| `EXTERNAL_CHECKOUT_APP_ID/PRIVATE_KEY` | 未配備 | ICPCostHub のみ別名 `DAIWAJUKI_APP_ID/PRIVATE_KEY` で配備 |

**重要**: 上記すべて **r-taniguchi 個人名義の fine-grained PAT** で発行する。machine user は採らない（GitHub Team 課金 +$4/月と 2FA 管理の負担に見合わないため）。

**Spec vs 実態の同期義務**: secret の追加・削除・命名変更を行ったら、本 doc の上記表を**必ず同時更新**する。過去事例: 本 doc は 2026-05-22 初版から 2026-05-26 まで 4 日間放置され、実態とは大きく乖離していた（governance-plan の `GH_PACKAGES_TOKEN` / `AUTH_REPO_TOKEN` が一度も配備されないまま、ICPSitePhotos の `ORG_REPO_TOKEN` 創設や ICPCostHub の GitHub App 採用が先行していた）。

## 発行手順（fine-grained PAT）

GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → **Generate new token**:

1. **Token name**: `daiwajuki-<purpose>-<YYYYMM>`
   - 例: `daiwajuki-packages-202605`
2. **Resource owner**: `daiwajuki` org（個人ではなく org を選択）
3. **Expiration**: Custom → 1 year
4. **Repository access**:
   - `ORG_REPO_TOKEN`: All repositories（packages install + cross-repo clone 兼用のため）
   - `EXTERNAL_CHECKOUT_TOKEN` (旧 spec 名、現状 `PDF_FORMS_REPO_TOKEN` 等個別命名): Only select repositories → 対象 repo
   - `ADOPTER_NOTIFY_TOKEN`: All repositories（or 14 consumer リポ個別）
5. **Permissions**: Repository permissions の必要最小スコープ（上の表を参照）
6. **Generate** → トークン文字列を **すぐに** 1Password に保存（画面遷移すると二度と見られない）

**新規 GitHub App による cross-repo checkout（推奨パターン、ICPCostHub 採用済）**:

PAT の代わりに GitHub App `daiwajuki-cross-repo-checkout` (app_id: 3820205) の credentials を使う。手順は [oauth-setup.md](oauth-setup.md) または ICPCostHub の `.github/workflows/ci.yml:50-70` を参照。

## 配備手順

```bash
# daiwajuki org secret に配備（org-wide secret = ORG_REPO_TOKEN）
gh secret set ORG_REPO_TOKEN \
  --org daiwajuki \
  --visibility all \
  --body "<token-string>"

# 各 consumer repo に GitHub App credentials を配備（ICPCostHub 採用パターン）
gh secret set DAIWAJUKI_APP_ID         --repo daiwajuki/ICPCostHub --body "<app-id>"
gh secret set DAIWAJUKI_APP_PRIVATE_KEY --repo daiwajuki/ICPCostHub --body-file ./app-private-key.pem

# 配備の確認
gh secret list --org daiwajuki
gh secret list --repo daiwajuki/ICPCostHub
```

> 旧 spec は repo-level に `AUTH_REPO_TOKEN` / `DS_REPO_TOKEN` を全 consumer 配備する想定だったが、現状は org-level `ORG_REPO_TOKEN` + `secrets: inherit` で代替している。

## ファンアウト配備 (scripts/deploy-secrets.mjs)

14 プロジェクトに同じ secret を一括配備するための CLI。**デフォルト dry-run** で、`--commit` を明示しないと書き込まない。

```bash
# org-level secret (ORG_REPO_TOKEN など)
ORG_REPO_TOKEN_VAL=ghp_xxxx node scripts/deploy-secrets.mjs \
  --target=ORG_REPO_TOKEN --scope=org \
  --value-from=env:ORG_REPO_TOKEN_VAL --commit

# 14 プロジェクト全部に App credentials を配備（PAT 全廃ロードマップ）
APP_ID_VAL=<app-id> node scripts/deploy-secrets.mjs \
  --target=DAIWAJUKI_APP_ID --scope=repo --projects=active \
  --value-from=env:APP_ID_VAL --commit
node scripts/deploy-secrets.mjs \
  --target=DAIWAJUKI_APP_PRIVATE_KEY --scope=repo --projects=active \
  --value-from=file:./external-checkout-app.pem --commit

# 限定 (例: ICPCostHub と ICPForms だけ)
node scripts/deploy-secrets.mjs \
  --target=EXTERNAL_CHECKOUT_TOKEN --scope=repo \
  --projects=ICPCostHub,ICPForms \
  --value-from=env:EXT_TOKEN_VAL --commit

# 改行を含む値 (App private key の PEM など) はファイル経由
node scripts/deploy-secrets.mjs \
  --target=EXTERNAL_CHECKOUT_APP_PRIVATE_KEY --scope=repo --projects=active \
  --value-from=file:./app-private-key.pem --commit
```

安全策:

- **値は絶対にログに出ない** (長さ + 先頭4 + 末尾4 のみ preview)
- 値の受け渡しは `--body-file -` (stdin) で、プロセス一覧に乗らない
- `status="archived"` のプロジェクトは自動で除外 (`--include-archived` で含める)
- `githubRepo` が空のエントリは自動 skip
- 後方互換のため `--target` は UPPER_SNAKE_CASE のみ受理 (`colocate-token` のような hyphen 名は拒否)

配備後の確認は `node scripts/audit-secrets.mjs` で行う (同じ projects-meta.json を読む)。

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

`_ci-templates` の reusable workflow を呼ぶ採用側 workflow は **`secrets: inherit` を必ず付ける**。これがないと org-level secret (`ORG_REPO_TOKEN` 等) が reusable workflow に届かない。

```yaml
# 採用側 (各 consumer リポ) の .github/workflows/ci.yml
jobs:
  ci:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    secrets: inherit   # ★ 必須。これがないと ORG_REPO_TOKEN が届かない
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
gh secret set ORG_REPO_TOKEN --org daiwajuki --visibility all --body "<new-token>"
gh secret set ORG_REPO_TOKEN_OLD --org daiwajuki --visibility all --body "<old-token>"

# 3. CI で動作確認（最低 1 週）
#    各 consumer の最近の deploy workflow を再走させて green を確認

# 4. 旧 PAT を revoke
#    GitHub Settings → PAT 一覧から旧トークンを Delete

# 5. _OLD secret を削除
gh secret delete ORG_REPO_TOKEN_OLD --org daiwajuki

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

## OIDC / GitHub App で代替できる箇所（PAT 全廃ロードマップ）

| 用途 | 現状 | OIDC / App 化 | 削減対象 |
|---|---|---|---|
| Cloud Run / Artifact Registry へのデプロイ | WIF | ✅ 実装済み | PAT 不要 |
| GitHub Packages の install (`@daiwajuki/*` private) | `ORG_REPO_TOKEN` (兼用) | ❌ GitHub 仕様で OIDC / App 認証不可 | 削減不可 — `read:packages` 専用 PAT として最低 1 個残す |
| `daiwajuki/daiwajuki-UIdesign` の cross-repo clone | `ORG_REPO_TOKEN` (兼用) または旧 `DS_REPO_TOKEN`（403 状態） | ✅ GitHub App `daiwajuki-cross-repo-checkout` に移行可能（ICPCostHub 実証済） | App 横展開で消滅 |
| `additional-build-context-repos` (`_pdf-forms` 等) の clone | ICPCostHub のみ `DAIWAJUKI_APP_*` (App) | ✅ 既に App 化済（参考実装） | 横展開のみ |
| 採用側 14 リポへの Issue 投稿 | `ADOPTER_NOTIFY_TOKEN` (PAT、F-1 実装済み) | ⚠ 将来 GitHub App で代替 (F-4) | F-4 完了時に PAT 廃止 |

**App 横展開ロードマップ**: `daiwajuki-cross-repo-checkout` (app_id: 3820205) を 14 consumer 全部に install + 各 workflow を `actions/create-github-app-token` 経由に統一すれば、`ORG_REPO_TOKEN` から (b) cross-repo clone の役割を完全に剥がせる。残る (a) packages install 用 PAT に scope を絞れば、blast radius が最小化される。詳細計画は別 follow-up task chip 「GitHub App 横展開で PAT 全廃ロードマップ」を参照。

## 関連文書

- governance-plan v3: `~/.claude/plans/github-sharded-platypus.md` Wave 0 ステップ 5-6
- `_auth/docs/runbook.md` — secret rotation 章は本ドキュメントへ統合済み
- `_auth/docs/threat-model.md` — 個人 Gmail / 個人 PAT 依存の脅威記述

## 履歴

- 2026-05-22 初版（governance-plan v3 Wave 0 ステップ 6 で作成）
- 2026-05-26 実態棚卸し結果を反映（spec と実装の乖離を解消）。`GH_PACKAGES_TOKEN`/`AUTH_REPO_TOKEN` 等の理想名から、現状実装の `ORG_REPO_TOKEN`/`DAIWAJUKI_APP_*`/`PDF_FORMS_REPO_TOKEN` 等の実名に統一。配備状況マトリクスを追加。GitHub App 横展開を OIDC ロードマップに正式組み込み。
