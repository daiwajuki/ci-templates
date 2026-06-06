# secret-scan.yml 利用ガイド

リポジトリの秘密情報漏洩を [gitleaks](https://github.com/gitleaks/gitleaks) でスキャンする Reusable Workflow。

`gitleaks-action@v2` は organization（daiwajuki）配下で `GITLEAKS_LICENSE` secret を要求し、未設定だと `missing gitleaks license` で失敗する。本 workflow は **gitleaks CLI を直接 DL・実行する（ライセンス不要）** ため、org でも secret 不要で動く。

## 基本的な使い方

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  secret-scan:
    uses: daiwajuki/ci-templates/.github/workflows/secret-scan.yml@v0
    permissions:
      contents: read
```

`secrets: inherit` は不要（外部 secret を一切使わない）。`permissions: contents: read` のみ必要。

## inputs 一覧

| input | 型 | デフォルト | 説明 |
|---|---|---|---|
| `gitleaks-version` | string | `'8.21.2'` | gitleaks CLI のバージョン（GitHub Releases タグから `v` を除いた値） |
| `config-path` | string | `''` | `.gitleaks.toml` 等の設定ファイルパス。空ならデフォルトルール（リポジトリ直下に `.gitleaks.toml` があれば gitleaks が自動採用するため通常は未指定） |
| `fetch-depth` | number | `0` | checkout の fetch-depth。`0` で全 git 履歴をスキャン、`1` で working tree のみ |
| `extra-args` | string | `''` | `gitleaks detect` への追加引数（例: `--log-opts=--since=2024-01-01`） |

## 挙動

- `actions/checkout@v4`（`fetch-depth: 0`）→ gitleaks CLI を取得 → `gitleaks detect --source=. --redact --no-banner --exit-code=1`
- 検出値は `--redact` でマスクされ、生の秘密情報はログに出ない
- 検出時は exit 1 で fail し、`$GITHUB_STEP_SUMMARY` に対応手順を出力

## 誤検知への対処

リポジトリ直下に `.gitleaks.toml` を置いて allowlist を定義する（gitleaks が自動採用）。任意パスに置く場合は `config-path` で指定する。

```toml
# .gitleaks.toml
[extend]
useDefault = true

[[rules.allowlist]]
regexes = ['''dummy-for-build-ci-only''']
```

## 検出されたときの原則

1. 実在の秘密なら **まずトークン／鍵をローテーション**（git 履歴に残るため revert だけでは不十分）
2. 値をコードから除去し `.env` / Secret Manager 参照へ移す
3. 誤検知なら `.gitleaks.toml` に allowlist 追加
