# docker-compose Templates

`@daiwajuki/ci-templates` の docker-compose テンプレート集。
**copy 配布** — `node sync-templates.mjs --target=compose --compose-variant=<name>` で取得。

## variant

| ファイル | サービス | 用途 |
|---|---|---|
| `postgres-only.yml`  | PostgreSQL 16-alpine                  | DB のみのローカル開発 |
| `postgres-redis.yml` | PostgreSQL 16-alpine + Redis 7-alpine | キャッシュ・セッションストアも含む開発 |

## 起動

```bash
# .env で POSTGRES_PORT=5438 等を上書き（ports.json の割当）
docker compose up -d

# 停止
docker compose down

# データボリューム削除（データ完全消去）
docker compose down -v
```

## ポート競合への対応

ワークスペース全体で `scripts/ports.json` がポートを静的管理しています。
**自動フォールバック禁止**（グローバルルール 7）。

各プロジェクトの `.env` で `ports.json` の割当を指定:

```bash
POSTGRES_PORT=5438     # ports.json の PostgreSQL 帯（5433-5442）
REDIS_PORT=6379        # 採用側で割り当て
```

競合時は対象プロセスを `taskkill` で終了してから再起動（自動別ポート切替はしない）。

## 既存採用パターンとの差分

| 採用元 | テンプレとの差分 | 対応方針 |
|---|---|---|
| ICPCostHub | db + api + web の 3-service 構成（compose で全部起動） | full-stack template は将来検討（Phase C 範囲外）。`postgres-only` を base に各プロジェクトで services を追加 |
| Portal     | docker-compose 不使用（Cloud Run 直接） | このテンプレ採用は将来検討 |

## 関連

- 使い方: [../docs/usage-sync-templates.md](../docs/usage-sync-templates.md)
- ポートレジストリ: [../../scripts/ports.json](../../scripts/ports.json)
