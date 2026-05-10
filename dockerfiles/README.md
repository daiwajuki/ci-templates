# Dockerfile Templates

`@daiwajuki/ci-templates` の Dockerfile テンプレート集。
**copy 配布**（live 参照ではない）— 採用側が `node sync-templates.mjs` で取得します。

## 一覧

| stack | path | variants |
|---|---|---|
| Next.js | [`next/`](next/) | `Dockerfile.alpine`, `Dockerfile.slim` |
| FastAPI | [`fastapi/`](fastapi/) | `Dockerfile.uv`, `Dockerfile.poetry` |
| Laravel | [`laravel/`](laravel/) | `Dockerfile.fpm-nginx`, `Dockerfile.frankenphp` |

詳細は各ディレクトリの `README.md` を参照。

使い方は [../docs/usage-sync-templates.md](../docs/usage-sync-templates.md) を参照。

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
