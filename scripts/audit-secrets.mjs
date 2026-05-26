#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates/scripts/audit-secrets
 *
 * 14 プロジェクトの secret 配備状況を gh CLI 経由で監査する。
 * org-level secret (`ORG_REPO_TOKEN`) と repo-level secret (`DS_REPO_TOKEN`, `DAIWAJUKI_APP_ID`)
 * が必要箇所に配備されているか確認し、Markdown 表で出力。
 *
 * 参照: governance-plan v3 Wave A ステップ 12 / docs/secrets.md (2026-05-26 実態整合)
 *
 * 前提:
 *  - `gh auth status` で daiwajuki org にアクセス可能なアカウントでログイン済み
 *  - `gh secret list` の実行権限あり
 *
 * 使い方:
 *   node scripts/audit-secrets.mjs           # 全 19 プロジェクトを監査
 *   node scripts/audit-secrets.mjs --json    # JSON 出力（CI で使う）
 */

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEVELOP_DIR = path.resolve(__dirname, "..", "..");
const PROJECTS_META = path.join(DEVELOP_DIR, "scripts", "projects-meta.json");

const JSON_OUTPUT = process.argv.includes("--json");

// 各 secret の必要性: 全プロジェクトに必要 / authMode が "todo" 以外なら必要 / 任意
// 2026-05-26: docs/secrets.md と整合（spec 命名 → 実装命名）
const SECRETS_NEEDED = {
    ORG_REPO_TOKEN: { scope: "org-or-repo", required: true, note: "GitHub Packages install + cross-repo clone 兼用 (org-level 推奨)" },
    DS_REPO_TOKEN: { scope: "repo", required: false, note: "[非推奨/移行中] 旧 _design-system clone 用。ORG_REPO_TOKEN または App credentials に統合予定" },
    DAIWAJUKI_APP_ID: { scope: "repo", required: false, note: "[推奨] GitHub App `daiwajuki-cross-repo-checkout` の app-id。横展開で PAT を全廃する経路" },
};

function ghSecretList(target) {
    try {
        const out = execSync(`gh secret list ${target} --json name`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        return JSON.parse(out).map((s) => s.name);
    } catch (e) {
        return { error: e.message.split("\n")[0] };
    }
}

async function main() {
    const projectsMeta = JSON.parse(await readFile(PROJECTS_META, "utf8"));

    // 1. org-level secret を取得
    const orgSecrets = ghSecretList("--org daiwajuki");
    const orgHasOrgRepoToken = !orgSecrets.error && orgSecrets.includes("ORG_REPO_TOKEN");

    // 2. 各リポを巡回
    const rows = [];
    for (const [name, meta] of Object.entries(projectsMeta)) {
        if (!meta.githubRepo) {
            rows.push({ name, repo: "(未設定)", orgRepo: "—", appId: "—", dsRepo: "—", note: meta.tags?.join(",") || "" });
            continue;
        }

        const repoSecrets = ghSecretList(`--repo ${meta.githubRepo}`);
        if (repoSecrets.error) {
            rows.push({ name, repo: meta.githubRepo, orgRepo: "❓", appId: "❓", dsRepo: "❓", note: `error: ${repoSecrets.error}` });
            continue;
        }

        const checks = {
            orgRepo: orgHasOrgRepoToken ? "✅ (org)" : repoSecrets.includes("ORG_REPO_TOKEN") ? "✅ (repo)" : "❌",
            appId: repoSecrets.includes("DAIWAJUKI_APP_ID") ? "✅" : "—",
            dsRepo: repoSecrets.includes("DS_REPO_TOKEN") ? "⚠️ 残置 (要削除)" : "—",
        };
        rows.push({ name, repo: meta.githubRepo, ...checks, note: "" });
    }

    // 3. 出力
    if (JSON_OUTPUT) {
        console.log(JSON.stringify({ orgSecrets, rows }, null, 2));
        return;
    }

    console.log("# Secret deployment audit\n");
    console.log(`org-level ORG_REPO_TOKEN: ${orgHasOrgRepoToken ? "✅" : "❌ (未配備)"}\n`);
    console.log("| Project | Repo | ORG_REPO_TOKEN | DAIWAJUKI_APP_ID (推奨) | DS_REPO_TOKEN (旧) | Note |");
    console.log("|---|---|---|---|---|---|");
    for (const r of rows) {
        console.log(`| ${r.name} | ${r.repo} | ${r.orgRepo} | ${r.appId} | ${r.dsRepo} | ${r.note} |`);
    }

    // 終了コード: org-level ORG_REPO_TOKEN 未配備 or repo error が多い場合は exit 1
    const errorCount = rows.filter((r) => r.orgRepo === "❌" || r.orgRepo === "❓").length;
    if (!orgHasOrgRepoToken || errorCount > rows.length / 3) {
        console.log(`\n⚠️ ${!orgHasOrgRepoToken ? "org-level ORG_REPO_TOKEN 未配備" : `${errorCount} リポで問題検出`}`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
