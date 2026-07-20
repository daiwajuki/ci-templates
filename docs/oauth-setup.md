# OAuth Setup for Cloud Run Deployments

`@daiwajuki/auth` 採用 SaaS を Cloud Run にデプロイする際の Google OAuth + Secret Manager 連携手順。

## 前提

- GCP プロジェクト: `integratedconstructionplatform`
- Google OAuth Client は **SaaS ごとに専用のものを発行する**(Workspace 全体で 1 クライアントを共有する設計ではない。2026-07 時点で GCP Console を実地確認したところ、Google OAuth を有効化した SaaS 15 件が例外なく専用クライアントを持っており、共有クライアントは一度も作られていなかった。詳細: [`_auth/docs/oauth-setup.md`](../../_auth/docs/oauth-setup.md))
- 各 SaaS は本 repo の `deploy-cloudrun-next.yml` reusable workflow を使う

## Secret Manager のセットアップ

### Google OAuth Client ID / Secret (SaaS ごとに毎回)

```bash
SLUG=<newsaas>   # 例: daiwa-ops-app (そのSaaSの他secretの命名に合わせる)

echo -n "<発行された client id>" | \
    gcloud secrets create ${SLUG}-google-client-id \
        --replication-policy=automatic \
        --data-file=- \
        --project=integratedconstructionplatform

echo -n "<発行された client secret>" | \
    gcloud secrets create ${SLUG}-google-client-secret \
        --replication-policy=automatic \
        --data-file=- \
        --project=integratedconstructionplatform
```

GitHub Actions repository secrets を使う場合(PayrollManager・CompanyWebsite が採用しているパターン)は、上記の代わりに該当リポジトリの Settings > Secrets に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を登録し、デプロイ workflow 側で `${{ secrets.GOOGLE_CLIENT_ID }}` 形式で参照する。

### AUTH_SECRET / MFA_ENCRYPTION_KEY

Google OAuth クライアントとは別軸の設計(本ドキュメントの今回の改訂では変更していない)。既存プロジェクトの命名慣習(`<project>-auth-secret` 等、Secret Manager 上の既存エントリを `gcloud secrets list` で確認)に合わせて作成する:

```bash
openssl rand -base64 32 | \
    gcloud secrets create <project>-auth-secret \
        --replication-policy=automatic \
        --data-file=- \
        --project=integratedconstructionplatform
```

## Cloud Run サービスアカウントに read 権限付与

各 SaaS の Cloud Run runner サービスアカウントに、そのプロジェクト自身の secret 群への secretAccessor ロールを付与する:

```bash
PROJECT=integratedconstructionplatform
SLUG=<newsaas>
SA="<該当SaaSのrunner SA>@${PROJECT}.iam.gserviceaccount.com"

for s in "${SLUG}-google-client-id" "${SLUG}-google-client-secret" "${SLUG}-auth-secret"; do
    gcloud secrets add-iam-policy-binding "$s" \
        --member="serviceAccount:$SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT
done
```

## デプロイ workflow での参照

```yaml
# .github/workflows/deploy-web.yml (各 SaaS 側)
name: Deploy Web
on:
    push:
        branches: [main]
        paths: ['web/**']
jobs:
    deploy:
        uses: daiwajuki/ci-templates/.github/workflows/deploy-cloudrun-next.yml@v0
        with:
            service-name: <service>
            source-path: ./web
            secrets-yaml: |
                GOOGLE_CLIENT_ID=<slug>-google-client-id:latest
                GOOGLE_CLIENT_SECRET=<slug>-google-client-secret:latest
                AUTH_SECRET=<slug>-auth-secret:latest
            env-vars: |
                AUTH_URL=https://<your-cloud-run-url>
        secrets: inherit
```

(secret 名は実プロジェクトの既存命名に合わせること。GitHub Actions secrets 方式の場合は `${{ secrets.GOOGLE_CLIENT_ID }}` 形式で参照)

## OAuth Client へのリダイレクト URI 追加 (新規 SaaS 時)

新規 SaaS の Cloud Run URL が決まったら、その URL を**そのSaaS専用の** OAuth Client の Authorized redirect URIs に追加:

```bash
# 単一プロジェクトの URI を出力
node _tools/cli/manage-oauth.mjs --list-required-uris --project=<NewSaaS> --kind=both --copy

# → GCP Console > Credentials > <NewSaaS> 専用の OAuth Client > ADD URI で貼り付け
```

## ローテーション

### Google OAuth Client Secret

GCP Console > Credentials > **該当 SaaS 専用**の Client > 「ADD SECRET」で新規発行 → そのSaaSの `<slug>-google-client-secret` に新規 version 追加 → 次デプロイで自動切替 → 旧 secret を Web Console から削除。他 SaaS には影響しない(専用クライアントのため)。

### AUTH_SECRET / MFA_ENCRYPTION_KEY

GCP Secret Manager の version を追加 → `:latest` 参照なので次デプロイで自動切替:

```bash
openssl rand -base64 32 | \
    gcloud secrets versions add <project>-auth-secret --data-file=-
```

- **AUTH_SECRET**: 7 日並行運用窓口を設けてから旧 version を destroy
- **MFA_ENCRYPTION_KEY**: 鍵を変えると既存 TOTP secret が復号不能になるため、別運用が必要 (`_auth/scripts/migrate-encrypt-mfa-secrets.mjs` の re-encrypt モードを追加実装する必要あり)

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| Cloud Run 起動時 `Failed to access secret` | runner SA に secretAccessor 未付与 | 上記 IAM bind コマンドで該当 SA を追加 |
| Auth.js v5 `MissingSecret` | `AUTH_SECRET` 注入されていない | `secrets-yaml` に該当プロジェクトの `*-auth-secret:latest` を追加 |
| Google ログイン後 `redirect_uri_mismatch` | **そのSaaS専用**の OAuth Client に Cloud Run URL が登録されていない(共有クライアントは存在しないため、他 SaaS のクライアントに URI を足しても効果はない) | `manage-oauth.mjs --project=<Name> --kind=both --copy` → 該当 SaaS 専用クライアントの Web Console に貼付 |

## 関連

- [`usage-deploy-next.md`](./usage-deploy-next.md) — deploy-cloudrun-next.yml 全体ガイド
- [`_auth/docs/oauth-setup.md`](../../_auth/docs/oauth-setup.md) — ローカル開発側のセットアップ
- [`_auth/scripts/seed-env.mjs`](../../_auth/scripts/seed-env.mjs) — `.env.local` 配給スクリプト (AUTH_SECRET / AUTH_URL / MFA_ENCRYPTION_KEY のみ。Google OAuth は対象外)
- [`_tools/cli/manage-oauth.mjs`](../../_tools/cli/manage-oauth.mjs) — URI 列挙 CLI
