# OAuth Setup for Cloud Run Deployments

`@daiwajuki/auth` 採用 SaaS を Cloud Run にデプロイする際の Google OAuth + Secret Manager 連携手順。

## 前提

- GCP プロジェクト: `integratedconstructionplatform`
- Workspace 共有 OAuth Client は既に発行済 (詳細: [`_auth/docs/oauth-setup.md`](../../_auth/docs/oauth-setup.md))
- 各 SaaS は本 repo の `deploy-cloudrun-next.yml` reusable workflow を使う

## Secret Manager のセットアップ (一回限り)

Workspace 全 SaaS で共有するため、**1 セット作るだけ**で 19 SaaS が共用可能。

```bash
# === Workspace 共有 secret 4 つを Secret Manager に作成 ===

# 1. Google OAuth Client ID
echo -n "1234567890-xxxxx.apps.googleusercontent.com" | \
    gcloud secrets create workspace-google-client-id \
        --replication-policy=automatic \
        --data-file=- \
        --project=integratedconstructionplatform

# 2. Google OAuth Client Secret
echo -n "GOCSPX-xxxxx" | \
    gcloud secrets create workspace-google-client-secret \
        --replication-policy=automatic \
        --data-file=- \
        --project=integratedconstructionplatform

# 3. AUTH_SECRET (Auth.js v5 の JWT 暗号鍵)
openssl rand -base64 32 | \
    gcloud secrets create workspace-auth-secret \
        --replication-policy=automatic \
        --data-file=- \
        --project=integratedconstructionplatform

# 4. MFA_ENCRYPTION_KEY (TOTP secret encryption-at-rest 用 AES-256-GCM 鍵)
openssl rand -base64 32 | \
    gcloud secrets create workspace-mfa-encryption-key \
        --replication-policy=automatic \
        --data-file=- \
        --project=integratedconstructionplatform
```

## Cloud Run サービスアカウントに read 権限付与

各 SaaS の Cloud Run runner サービスアカウント (例: `portal-runner@<project>.iam.gserviceaccount.com`)
に Secret Manager の secretAccessor ロールを付与:

```bash
SECRETS=("workspace-google-client-id" "workspace-google-client-secret" "workspace-auth-secret" "workspace-mfa-encryption-key")
SA="portal-runner@integratedconstructionplatform.iam.gserviceaccount.com"

for s in "${SECRETS[@]}"; do
    gcloud secrets add-iam-policy-binding "$s" \
        --member="serviceAccount:$SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=integratedconstructionplatform
done
```

新規 SaaS 追加時はその SaaS の runner SA を同じ secret 群に追加するだけ。

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
            service-name: portal-web
            source-path: ./web
            secrets-yaml: |
                GOOGLE_CLIENT_ID=workspace-google-client-id:latest
                GOOGLE_CLIENT_SECRET=workspace-google-client-secret:latest
                AUTH_SECRET=workspace-auth-secret:latest
                MFA_ENCRYPTION_KEY=workspace-mfa-encryption-key:latest
            env-vars: |
                AUTH_URL=https://portal-web-xxxxxx.run.app
        secrets: inherit
```

## OAuth Client へのリダイレクト URI 追加 (新規 SaaS 時)

新規 SaaS の Cloud Run URL が決まったら、その URL を OAuth Client の Authorized redirect URIs に追加:

```bash
# 単一プロジェクトの URI を出力
node _tools/cli/manage-oauth.mjs --list-required-uris --project=<NewSaaS> --kind=both --copy

# → GCP Console > Credentials > 該当 OAuth Client > ADD URI で貼り付け
```

## ローテーション

### AUTH_SECRET / MFA_ENCRYPTION_KEY

GCP Secret Manager の version を追加 → `:latest` 参照なので次デプロイで自動切替:

```bash
openssl rand -base64 32 | \
    gcloud secrets versions add workspace-auth-secret --data-file=-
```

- **AUTH_SECRET**: 7 日並行運用窓口を設けてから旧 version を destroy
- **MFA_ENCRYPTION_KEY**: 鍵を変えると既存 TOTP secret が復号不能になるため、別運用が必要 (`_auth/scripts/migrate-encrypt-mfa-secrets.mjs` の re-encrypt モードを追加実装する必要あり)

### Google OAuth Client Secret

GCP Console > Credentials > 該当 Client > 「ADD SECRET」で新規発行 → `workspace-google-client-secret` の新規 version 追加 → 全 SaaS 次デプロイで自動切替 → 旧 secret を Web Console から削除。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| Cloud Run 起動時 `Failed to access secret` | runner SA に secretAccessor 未付与 | 上記 IAM bind コマンドで該当 SA を追加 |
| Auth.js v5 `MissingSecret` | `AUTH_SECRET` 注入されていない | `secrets-yaml` に `AUTH_SECRET=workspace-auth-secret:latest` を追加 |
| Google ログイン後 `redirect_uri_mismatch` | OAuth Client に Cloud Run URL が登録されていない | `manage-oauth.mjs --project=<Name> --kind=both --copy` → Web Console に貼付 |
| Workspace 内の別 SaaS で同 secret を参照したい | 既に共有設計なので OK | 該当 SaaS の runner SA を IAM bind するだけ |

## 関連

- [`usage-deploy-next.md`](./usage-deploy-next.md) — deploy-cloudrun-next.yml 全体ガイド (Workspace 共有 OAuth セクション含む)
- [`_auth/docs/oauth-setup.md`](../../_auth/docs/oauth-setup.md) — ローカル開発側のセットアップ
- [`_auth/scripts/seed-env.mjs`](../../_auth/scripts/seed-env.mjs) — `.env.local` 配給スクリプト
- [`_tools/cli/manage-oauth.mjs`](../../_tools/cli/manage-oauth.mjs) — URI 列挙 CLI
