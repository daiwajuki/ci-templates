# Laravel Dockerfile Templates

`@daiwajuki/ci-templates` の Laravel 用 Dockerfile テンプレート。
**copy 配布** — `node sync-templates.mjs --target=dockerfile --stack=laravel --variant=<fpm-nginx|frankenphp>` で取得。

## variant

| ファイル | runtime | ベース | 用途 |
|---|---|---|---|
| `Dockerfile.fpm-nginx`  | PHP-FPM + Nginx + Supervisor | `php:8.4-fpm-alpine`        | オーソドックス。複雑だが安定 |
| `Dockerfile.frankenphp` | FrankenPHP 単一バイナリ      | `dunglas/frankenphp:php8.4` | 軽量・高速。新規プロジェクトはこちら推奨 |

## 前提

- Laravel 11+ + PHP 8.3 以上
- `composer.json` / `composer.lock` を持つ
- Cloud Run の listen port: 8080
- 健康チェック endpoint: `/up`（Laravel 11+ 既定）

## fpm-nginx の前提サポートファイル

`docker/` 配下に以下を配置（既存採用 ICPCostHub/api を参考に）:

```
docker/
├── php.ini             # PHP 設定（OPcache 等）
├── www.conf            # PHP-FPM プール設定
├── nginx.conf          # Nginx 設定（port 8080 listen）
├── supervisord.conf    # php-fpm + nginx を起動
└── entrypoint.sh       # migrate / cache 等の起動時処理
```

これらは **テンプレ配布対象外**（プロジェクト固有の調整が大きいため）。
ICPCostHub/api の docker/ をコピーして start するのが最短。

## frankenphp の前提サポートファイル

```
docker/
└── Caddyfile           # FrankenPHP は Caddy ベース、:8080 listen
```

最小例:

```caddy
{
    auto_https off
}

:8080 {
    root * /app/public
    encode gzip
    php_server
}
```

## カスタマイズポイント

`# CUSTOMIZE:` 箇所:

1. **PHP 拡張** — `gd`, `exif`, `intl` 等不要なら削除
2. **OPcache 設定** — 開発用は `validate_timestamps=1`、本番は `0`
3. **HEALTHCHECK パス** — `/up` 以外なら変更

## 既存採用パターンとの差分

| 採用元 | テンプレとの差分 | 対応 |
|---|---|---|
| ICPCostHub/api | ほぼ同一（このテンプレが ICPCostHub/api ベース） | テンプレに揃える |
| ContractHub    | FrankenPHP 単一バイナリ | `Dockerfile.frankenphp` を base に揃える |
| ICPEstimating/api | CLI `artisan serve`、Debian | 本番運用には不向き。fpm-nginx か frankenphp に移行推奨 |
| Orders         | PHP-FPM + Nginx + Supervisor、Alpine | `Dockerfile.fpm-nginx` とほぼ同一 |

## 関連

- 使い方: [../../docs/usage-sync-templates.md](../../docs/usage-sync-templates.md)
- ICPCostHub の `docker/` 設定参考: `../../../ICPCostHub/api/docker/`
