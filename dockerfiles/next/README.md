# Next.js Dockerfile Templates

`@daiwajuki/ci-templates` の Next.js 用 Dockerfile テンプレート。
**copy 配布** — `node sync-templates.mjs --target=dockerfile --stack=next --variant=<alpine|slim>` で取得。

## variant

| ファイル | ベース | サイズ | 用途 |
|---|---|---|---|
| `Dockerfile.alpine` | `node:20-alpine` | ~50MB | 標準。新規プロジェクトはこちら |
| `Dockerfile.slim`   | `node:20-slim`   | ~120MB | glibc 必須の native deps（puppeteer / sharp / canvas 等） |

## 前提

- `next.config.js` または `next.config.ts` で `output: 'standalone'` を設定
- Cloud Run の listen port: 8080（テンプレ既定）
- Node 20 LTS（Volta `volta pin node@20 npm@10` 推奨）

## カスタマイズポイント

template 内の `# CUSTOMIZE:` コメント箇所:

1. **`GH_PACKAGES_TOKEN`** ARG — GitHub Packages から `@daiwajuki/*` を取らない場合は ARG 行ごと削除可
2. **`.npmrc`** — 持たないプロジェクトは `COPY` から `.npmrc*` を削除
3. **`--legacy-peer-deps`** — peer dep 競合がある場合に追加（Next.js 16 + next-auth ベータ等）
4. **build 時の dummy ENV** — Next.js が静的解析で API route を評価する場合、`DATABASE_URL` 等のダミー値を渡す
5. **slim 版のみ**: native build 用 OS パッケージ（canvas / sharp）

## 既存採用パターンとの差分

| 採用元 | テンプレとの差分 | 対応 |
|---|---|---|
| Portal | ほぼ同一（このテンプレが Portal ベース）。Portal は PORT=3025 を独自指定 | Cloud Run 標準 8080 に揃える |
| ICPCostHub/web | `npm install` で lock 再構築（Windows lock 不整合対策） | 必要に応じて採用側で `npm ci` → `npm install` に変更 |
| PayrollManager | 2-stage（deps を builder に統合） | 3-stage の方がキャッシュ効率良いためテンプレに揃える |

## 関連

- 使い方: [../../docs/usage-sync-templates.md](../../docs/usage-sync-templates.md)
- ワークスペース全体のポート規約: [../../../_tools/data/ports.json](../../../_tools/data/ports.json)
