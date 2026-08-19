# Dockerfile Templates

`@daiwajuki/ci-templates` の Dockerfile テンプレート集。
**copy 配布**（live 参照ではない）— 採用側が `node sync-templates.mjs` で取得します。

## 一覧

| stack | path | variants |
|---|---|---|
| Next.js | [`next/`](next/) | `Dockerfile.alpine`, `Dockerfile.slim` |
| FastAPI | [`fastapi/`](fastapi/) | `Dockerfile.uv`, `Dockerfile.poetry` |
| Laravel | [`laravel/`](laravel/) | `Dockerfile.fpm-nginx`, `Dockerfile.frankenphp` |

各スタックには `dockerignore`（配置時に `.dockerignore` へリネーム）が同梱されており、
`sync-templates.mjs` が Dockerfile と**セットで**配布します。

詳細は各ディレクトリの `README.md` を参照。

使い方は [../docs/usage-sync-templates.md](../docs/usage-sync-templates.md) を参照。

## ⚠️ .dockerignore は必須

`.dockerignore` が無いと、ビルドコンテキストのローカル `.env` が
**そのままイメージへ焼き込まれる**。Laravel / FastAPI は最終ステージで
ソースツリーを `COPY` するため実害が出る。

Laravel ではイメージ内 `.env` が Cloud Run の env / secrets **より優先される**ため、
正しい本番設定を注入していても開発用設定で動く。

実例（daiwajuki/Orders, 2026-08-15）:

- Cloud Run に `DB_CONNECTION=pgsql` + Cloud SQL 接続 + Secret Manager の
  `DB_PASSWORD` を設定済みだったが、`/api/health/db` が
  `Database file at path [/app/database/database.sqlite] does not exist` を返した
- 原因はイメージに焼き込まれた `api/.env`。開発用の実 DB 接続情報と `APP_KEY` も同梱
- あわせて dev 依存込みの `bootstrap/cache/packages.php` も混入し、
  `--no-dev` ビルドで `php artisan route:cache` が Class not found で失敗

Next.js の standalone マルチステージビルドは最終イメージにビルド成果物しか
入らないため実害は限定的だが、転送量削減と builder ステージでの秘密情報混入
防止のため同様に配置すること。

**build-context をリポルートにしている場合**（monorepo で兄弟ディレクトリを
参照する構成）は、`.dockerignore` を**リポルート**に置く必要がある。
docker は build-context 直下の `.dockerignore` しか読まないため、
`next-app/.dockerignore` を置いても効かない。この場合はパスに接頭辞を付ける:

```
next-app/.env
api/.env
```

## 設計原則

1. **Cloud Run 標準準拠** — port 8080 listen、non-root user、HEALTHCHECK
2. **Asia/Tokyo 固定** — 締め日基準の業務ロジックが UTC でズレるのを防ぐ
3. **Multi-stage** — 最小ランタイム（Next.js standalone、Python venv コピー、Composer vendor 分離）
4. **`# CUSTOMIZE:` コメント** — 採用側が触っていい箇所を明示。それ以外は template 更新で上書きされる
5. **既存採用との差分は各 README に列挙** — 採用側が現在のローカル構成と何が違うかを把握できる

## 配布方式

| 配布方式 | 対象 | 取り込み | 採用側のファイル所有 |
|---|---|---|---|
| **live 参照** | reusable workflow | `uses: daiwajuki/ci-templates/...@v0` | `_ci-templates` 側が随時更新 |
| **copy 配布** | Dockerfile / docker-compose | `node sync-templates.mjs ...` | 採用側が所有・カスタマイズ自由 |

copy 配布の trade-off:
- 採用側で `# CUSTOMIZE:` 部分を自由に変更できる
- template 更新時に **drift が発生**（Phase F の `audit-ci-drift` で検知予定）
