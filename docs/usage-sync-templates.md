# usage-sync-templates.md

## 概要

`_ci-templates` の Dockerfile / docker-compose テンプレートを **copy 配布** で
取り込むための CLI。採用側プロジェクトで以下を実行する:

```bash
# Dockerfile を取得（Next.js alpine）
node <path-to-ci-templates>/scripts/sync-templates.mjs \
  --target=dockerfile --stack=next --variant=alpine

# docker-compose を取得（PostgreSQL のみ）
node <path-to-ci-templates>/scripts/sync-templates.mjs \
  --target=compose --compose-variant=postgres-only
```

このスクリプトは Node 20+ の標準 `fetch` のみを使い、追加 npm 依存は不要です。
GitHub の raw URL から指定 version のファイルを取得します。

## 配布方式の違い

| 配布方式 | 対象 | 取り込み | 採用側ファイルの所有 |
|---|---|---|---|
| **live 参照** | reusable workflow | `uses: daiwajuki/ci-templates/...@v0` | `_ci-templates` 側が随時更新 |
| **copy 配布** | Dockerfile / docker-compose | `node sync-templates.mjs ...` で取得 | 採用側が所有・カスタマイズ自由 |

copy 配布は、採用側で `# CUSTOMIZE:` 部分を自由に変更できる代わりに、
template が更新されたときに drift が発生します（Phase F の audit-ci-drift で検知予定）。

## 推奨ディレクトリ配置

採用側は `_ci-templates` を兄弟ディレクトリにクローンしているケースが多いため、
以下のような相対参照で運用できます:

```
Develop/
├── _ci-templates/
│   └── scripts/sync-templates.mjs
├── Portal/                           # 採用側
│   ├── Dockerfile                    ← sync-templates.mjs が書き込む
│   └── .ci-templates.json            ← 同期履歴（コミット推奨）
└── ...
```

```bash
cd Portal
node ../_ci-templates/scripts/sync-templates.mjs \
  --target=dockerfile --stack=next --variant=alpine
```

## オプション一覧

| オプション | 値 | 用途 |
|---|---|---|
| `--target` | `dockerfile`, `compose`, `all` | 取得対象 |
| `--stack` | `next`, `fastapi`, `laravel` | Dockerfile に必要 |
| `--variant` | スタック依存（下表） | Dockerfile の variant |
| `--compose-variant` | `postgres-only`, `postgres-redis` | docker-compose variant（既定: `postgres-only`） |
| `--version` | `v0`, `v0.6.0` | 取得バージョン（floating タグ推奨） |
| `--output` | パス | 出力先（既定: `./Dockerfile`, `./docker-compose.yml`） |
| `--dry-run` | flag | 書き込まずプレビューのみ |
| `--force` | flag | 既存ファイルを上書き（必須 — 既存があれば停止する） |

### variant 一覧

| stack | variant | 用途 |
|---|---|---|
| `next` | `alpine` | 標準（最小サイズ） |
| `next` | `slim` | glibc が必要な native deps（puppeteer / sharp 等） |
| `fastapi` | `uv` | Astral uv 管理（推奨） |
| `fastapi` | `poetry` | 既存 Poetry プロジェクト用 |
| `laravel` | `fpm-nginx` | PHP-FPM + Nginx + Supervisor（オーソドックス） |
| `laravel` | `frankenphp` | FrankenPHP 単一バイナリ（軽量） |

## ワークフロー例

### 新規プロジェクトに Dockerfile + docker-compose を一括導入

```bash
cd MyNewProject
node ../_ci-templates/scripts/sync-templates.mjs \
  --target=all --stack=next --variant=alpine --compose-variant=postgres-only
```

→ `Dockerfile`, `docker-compose.yml`, `.ci-templates.json` の 3 ファイルが生成される。

### 既存 Dockerfile を template 由来に置換

```bash
cd ICPCostHub
# まず差分プレビュー
node ../_ci-templates/scripts/sync-templates.mjs \
  --target=dockerfile --stack=next --variant=alpine \
  --output=web/Dockerfile --dry-run

# 問題なければ上書き
node ../_ci-templates/scripts/sync-templates.mjs \
  --target=dockerfile --stack=next --variant=alpine \
  --output=web/Dockerfile --force
```

### 特定バージョンに pin

```bash
# v0 floating ではなく v0.6.0 で固定取得
node ../_ci-templates/scripts/sync-templates.mjs \
  --target=dockerfile --stack=next --variant=alpine \
  --version=v0.6.0
```

## 同期履歴 (`.ci-templates.json`)

実行ごとに以下の JSON が記録されます:

```json
{
  "repo": "daiwajuki/ci-templates",
  "synced": [
    {
      "target": "Dockerfile",
      "source": "dockerfiles/next/Dockerfile.alpine",
      "version": "v0",
      "sha": "a1b2c3d4e5f6",
      "synced_at": "2026-05-10T10:00:00.000Z"
    }
  ]
}
```

`sha` は取得ファイルの SHA-256 先頭 12 桁。Phase F の `audit-ci-drift` がこれを
チェックして「採用側のローカル変更」と「template 更新」を区別します。

`.ci-templates.json` は **コミット推奨**（drift 検知の起点になるため）。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `fetch failed: 404` | source path / version 指定ミス | URL を直接ブラウザで叩いて確認。version は `v0` / `v0.6.0` 形式 |
| `Dockerfile は既存で内容が異なります` | 上書き保護 | `--dry-run` で差分確認 → `--force` で上書き |
| Cloud Run で `port 3000` を listen している | template は `PORT=8080`、採用側で別 PORT を強制している | `next.config.js` 等で PORT override を削除 or `--output` で別パスに保存して手調整 |
| `compose` で port 競合 | `ports.json` の割当を `.env` に反映していない | `POSTGRES_PORT=5438` 等を `.env` に追加 |
| `node: command not found` | Node 20+ 未インストール | `volta install node@20` |

## 関連

- 配布対象一覧: [../dockerfiles/README.md](../dockerfiles/README.md), [../docker-compose/README.md](../docker-compose/README.md)
- バージョニング規約: [versioning.md](versioning.md)
- Phase F の drift 検知設計: [audit-ci-drift-design.md](audit-ci-drift-design.md)
