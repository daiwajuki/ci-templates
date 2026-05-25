# audit-ci-drift 設計と実装

> **ステータス**: F-1 (push 通知) 実装済み、F-5 (drift 検出 script) も実装済み。実装は
> [.github/workflows/notify-adopters.yml](../.github/workflows/notify-adopters.yml) /
> [.github/adopters.json](../.github/adopters.json) /
> [scripts/audit-ci-drift.mjs](../scripts/audit-ci-drift.mjs) に存在。本ドキュメントは設計判断の記録と運用手順を兼ねる。

`@v0` floating tag を pin している採用側プロジェクト（現在 4、目標 14）に対し、
**`v0` の指す SHA が変わった = 新リリースが降ってきた**ことを知らせる仕組み。

## 解決したい問題

| 痛点 | 現状の挙動 |
|---|---|
| Breaking を含む MINOR がリリースされても採用側は気づかない | GitHub Releases 通知は Watch 設定次第（漏れやすい） |
| `@v0` は floating なので **次の CI 実行時に勝手に降ってくる** | 壊れて初めて気づく（0.4.1 の `colocate-token` rename 事故再現リスク） |
| 採用側で `@v0` か `@v0.5.1` か選ぶ判断材料がない | リリースの内容をプロアクティブに伝える経路がない |

## 設計選択

### 候補比較

| # | 方式 | 配置 | Pro | Con |
|---|---|---|---|---|
| **A** | Push 通知（_ci-templates → 各採用側に Issue 投稿） | _ci-templates に集約 | 一箇所で完結。release-please の `release: published` トリガーと自然に接続 | 各採用側 repo への `issues: write` 権限が必要（GitHub App or PAT） |
| **B** | Pull 検知（各採用側で日次 cron） | 各採用側に workflow 配給 | 採用側の **実際の usage**（どの workflow を `@v0` で引いているか）を反映できる | 14 プロジェクト全部に workflow を配布・追従するコスト |
| **C** | Renovate / Dependabot | 各採用側に config | 業界標準ツール | Renovate は floating tag を即座に固定 PIN（`@v0` → `@v0.5.1`）に書き換えるため、**floating の意図と衝突** |
| **D** | Watch 通知のみ | 人間運用 | 実装ゼロ | 漏れやすい（特に複数人運用時） |

### 推奨: **A（Push 通知）**

理由：
- _ci-templates は元々「14 プロジェクトの単一情報源」として設計されている → 通知も集約が一貫
- release-please の `release: published` がトリガとして既に存在（仕組みを増やさない）
- B は workflow を 14 個分メンテする = 0.4.1 同様の "uses ブランチ名で混乱" 系事故の再生産
- C の Renovate は別レイヤーで価値があるが、`@v0` floating の運用思想とは別物

## A の実装スケッチ

### 1. 採用側リスト（`.github/adopters.json`）

```json
{
  "adopters": [
    { "repo": "daiwajuki/Portal",         "uses": ["ci-next", "deploy-cloudrun-next"] },
    { "repo": "daiwajuki/ICPCostHub",     "uses": ["ci-next", "deploy-cloudrun-next", "deploy-cloudrun-laravel"] },
    { "repo": "daiwajuki/ICPEstimating",  "uses": ["deploy-cloudrun-next", "deploy-cloudrun-laravel"] },
    { "repo": "daiwajuki/PayrollManager", "uses": ["ci-next"] }
  ]
}
```

採用側追加時はこのファイルを更新（README の採用状況テーブル更新と一体化できる）。

### 2. 通知 workflow（`.github/workflows/notify-adopters.yml`）

```yaml
name: Notify adopters of new release

on:
  release:
    types: [published]

jobs:
  notify:
    if: >
      !github.event.release.draft &&
      !github.event.release.prerelease &&
      github.event.release.tag_name != 'v0'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Detect breaking change
        id: detect
        env:
          BODY: ${{ github.event.release.body }}
        run: |
          if echo "$BODY" | grep -qiE '(^|\n)### *(Breaking|破壊)'; then
            echo "is_breaking=true" >> "$GITHUB_OUTPUT"
          else
            echo "is_breaking=false" >> "$GITHUB_OUTPUT"
          fi
      - name: Open notification issue in each adopter
        env:
          GH_TOKEN: ${{ secrets.ADOPTER_NOTIFY_TOKEN }}
          RELEASE_TAG: ${{ github.event.release.tag_name }}
          RELEASE_URL: ${{ github.event.release.html_url }}
          RELEASE_BODY: ${{ github.event.release.body }}
          IS_BREAKING: ${{ steps.detect.outputs.is_breaking }}
        run: |
          set -euo pipefail
          jq -c '.adopters[]' .github/adopters.json | while read -r adopter; do
            repo=$(echo "$adopter" | jq -r '.repo')
            uses=$(echo "$adopter" | jq -r '.uses | join(", ")')
            label="ci-templates-update"
            title="ci-templates ${RELEASE_TAG} がリリースされました"
            if [ "${IS_BREAKING}" = "true" ]; then
              title="⚠ ${title} (Breaking Change 含む)"
              label="ci-templates-update,breaking-change"
            fi
            gh issue create \
              --repo "$repo" \
              --title "$title" \
              --label "$label" \
              --body "$(cat <<EOF
**\`@v0\` floating tag が ${RELEASE_TAG} に移動しました。**

- リリース詳細: ${RELEASE_URL}
- このリポジトリで使用中の workflow: ${uses}

${IS_BREAKING:+⚠ **Breaking Change が含まれています**。次回 CI 実行前に CHANGELOG を確認し、必要に応じて呼び出し側を修正してください。}

---

#### CHANGELOG 抜粋

${RELEASE_BODY}

---

🤖 自動投稿（_ci-templates の notify-adopters workflow）
EOF
)"
          done
```

### 3. 必要な権限

`ADOPTER_NOTIFY_TOKEN` secret が必要：

| 選択肢 | 設定 | Pro / Con |
|---|---|---|
| GitHub App | 新規 App 作成、各採用側 repo に install、`issues: write` 権限 | 監査しやすい、scope が明確、運用ベストプラクティス |
| Fine-grained PAT | r-taniguchi が PAT 発行（`issues: write` × 14 repos） | 設定が早い、ただし個人トークン依存（離職リスク） |
| Classic PAT | `repo` scope の classic PAT | 最も簡単、ただし scope が広すぎる |

**推奨**: 現状 4 採用 → fine-grained PAT で開始、14 採用達成時点で GitHub App に移行。

### 4. 採用側で受け取るラベル運用

各採用側 repo に以下のラベルを事前に作成：

- `ci-templates-update` — 通常更新
- `breaking-change` — Breaking 含む更新（`ci-templates-update` と併用）

ラベル作成も自動化可能（同 workflow で `gh label create` を冪等に走らせる）。

## 段階的ロールアウト

| Phase | 内容 |
|---|---|
| **F-1** | `.github/adopters.json` を作成（README adoption table と同期）、`notify-adopters.yml` を作成・dry-run（`--dry-run` フラグで Issue 作成は skip） |
| **F-2** | PAT を発行・secret 登録、4 採用に対し本番有効化 |
| **F-3** | 採用側のラベル準備（一度だけ手動 or 同 workflow で自動） |
| **F-4** | 14 採用達成時点で GitHub App 化（PAT 廃止） |

## 既知の限界

- **採用側の actual usage（どの workflow を `@v0` で引いているか）はリストに依存**。実態と乖離する可能性。
  - **対応 (F-5 実装済み)**: [scripts/audit-ci-drift.mjs](../scripts/audit-ci-drift.mjs) が `.github/adopters.json` と実態の drift を検出する。`--remote` で `gh search code "daiwajuki/ci-templates" --owner=daiwajuki --extension=yml` 経由でも動作。検出種別は missing / stale / uses-mismatch / stale-pin / unknown-workflow の 5 つ。実際に 2026-05-26 の初回ローカル実行で daiwa-ops-app / ICPSitePhotos / BidFlow / HydraulicCalculation の 4 件抜けが見つかり、commit 69f23a3 で同期した。
- **Issue 通知が見られなければ意味がない**。各採用側の通知設定（Email / Slack 連携）次第。
  - 補完案: 採用側 repo に Slack 通知 GitHub App を install してもらう運用を別途規定

## 関連

- [docs/versioning.md](versioning.md) — PATCH に Breaking を入れない規約
- [.github/workflows/release-please.yml](../.github/workflows/release-please.yml) — リリース自動化
- [README.md](../README.md) 採用状況テーブル — 4 プロジェクト現況

## 実装状況 (2026-05 時点)

| Phase | 内容 | 状態 |
|---|---|---|
| F-1 | `.github/adopters.json` + `notify-adopters.yml` 実装、`workflow_dispatch` での dry-run サポート | ✅ 実装済み |
| F-2 | `ADOPTER_NOTIFY_TOKEN` を発行・`scripts/deploy-secrets.mjs` で各 adopter repo に配備 | ⏭️ 運用判断 (本実装 PR 後) |
| F-3 | 初回 release で本番有効化 | ⏭️ F-2 後 |
| F-4 | 14 採用達成時点で GitHub App 化 (PAT 廃止) | ⏭️ 採用数次第 |
| F-5 | drift 検出 script (`scripts/audit-ci-drift.mjs`) — local / remote 両モード、missing/stale/uses-mismatch/stale-pin/unknown-workflow を検出 | ✅ 実装済み |
| F-6 | weekly workflow `.github/workflows/audit-drift.yml` で `audit-ci-drift --remote` を回し、drift 検出時に Issue 投稿 / 既存 issue にコメント (`ci-drift` ラベル) | ✅ 実装済み (`ADOPTER_NOTIFY_TOKEN` 未設定時は local fallback で degraded 動作) |

### 設計判断 (F-1 実装で確定したもの)

| 判断 | 採用 | 根拠 |
|---|---|---|
| 認証方式 | **PAT (`ADOPTER_NOTIFY_TOKEN` 単一 secret)** | 現状 4 採用、GitHub App は overkill。F-4 で移行 |
| 通知閾値 | **全リリース通知** | release-please は MINOR/PATCH 単位、頻度が低いので noise にならない |
| ラベル命名 | `ci-templates-update` (緑) / `breaking-change` (赤) | ラベル未存在時は workflow が自動 create (idempotent) |
| dry-run | `workflow_dispatch` の `dry_run` input (default `true`) | 設計通り。本番テスト前に `gh workflow run notify-adopters.yml -f release_tag=v0.6.0 -f dry_run=true` で検証可 |

### 運用手順

```bash
# 1. ADOPTER_NOTIFY_TOKEN を発行 (fine-grained PAT)
#    Resource owner: daiwajuki org
#    Repository access: All repositories (or .github/adopters.json の repo 群)
#    Permissions: Issues = Read and write

# 2. _ci-templates repo に配備
gh secret set ADOPTER_NOTIFY_TOKEN \
  --repo daiwajuki/ci-templates \
  --body "<token-string>"

# 3. dry-run でテスト
gh workflow run notify-adopters.yml \
  --repo daiwajuki/ci-templates \
  -f release_tag=v0.6.0 \
  -f dry_run=true

# 4. 結果確認 → 本番リリース時に release: published で自動発火
```

### 新規 adopter 追加時

[.github/adopters.json](../.github/adopters.json) に追記:

```json
{
  "repo": "daiwajuki/NewProject",
  "uses": ["ci-next", "deploy-cloudrun-next"]
}
```

その PR と同じタイミングで [README.md](../README.md) の採用状況テーブルも更新する。
