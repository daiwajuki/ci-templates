#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates/scripts/audit-secrets
 *
 * 14 プロジェクトの secret 配備状況を gh CLI 経由で監査する。
 * repo-level secret (`DAIWAJUKI_APP_ID`, `DAIWAJUKI_APP_PRIVATE_KEY`, `DS_REPO_TOKEN`)
 * が必要箇所に配備されているか確認し、Markdown 表で出力。
 *
 * 参照: governance-plan v3 Wave A ステップ 12 / docs/secrets.md (2026-05-26 v2)
 *
 * Free プラン制約 (2026-05-26 発見):
 *   daiwajuki org は GitHub Free プランで、org-level secret は private repo の
 *   workflow context に配信されない。GitHub App `daiwajuki-cross-repo-checkout`
 *   credentials (DAIWAJUKI_APP_ID/PRIVATE_KEY) が現在の標準パターン。
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
const PROJECTS_META = path.join(DEVELOP_DIR, "_tools", "data", "projects-meta.json");

const JSON_OUTPUT = process.argv.includes("--json");

// 監査対象 secret 名は本体で直接参照: DAIWAJUKI_APP_ID / DAIWAJUKI_APP_PRIVATE_KEY (現行標準),
// DS_REPO_TOKEN / ORG_REPO_TOKEN (旧、残置検知用)。命名変更時は本体の includes() 呼び出しと
// docs/secrets.md の両方を必ず同期更新する。

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

    // 1. org-level secret を取得（Free プラン制約で実質意味なしだが、検査として残置）
    const orgSecrets = ghSecretList("--org daiwajuki");
    const orgSecretCount = !orgSecrets.error ? orgSecrets.length : "(error)";

    // 2. 各リポを巡回
    const rows = [];
    for (const [name, meta] of Object.entries(projectsMeta)) {
        if (!meta.githubRepo) {
            rows.push({ name, repo: "(未設定)", appId: "—", appKey: "—", dsRepo: "—", orgRepo: "—", note: meta.tags?.join(",") || "" });
            continue;
        }

        const repoSecrets = ghSecretList(`--repo ${meta.githubRepo}`);
        if (repoSecrets.error) {
            rows.push({ name, repo: meta.githubRepo, appId: "❓", appKey: "❓", dsRepo: "❓", orgRepo: "❓", note: `error: ${repoSecrets.error}` });
            continue;
        }

        const checks = {
            appId: repoSecrets.includes("DAIWAJUKI_APP_ID") ? "✅" : "—",
            appKey: repoSecrets.includes("DAIWAJUKI_APP_PRIVATE_KEY") ? "✅" : "—",
            dsRepo: repoSecrets.includes("DS_REPO_TOKEN") ? "⚠️ 残置" : "—",
            orgRepo: repoSecrets.includes("ORG_REPO_TOKEN") ? "⚠️ 残置" : "—",
        };
        rows.push({ name, repo: meta.githubRepo, ...checks, note: "" });
    }

    // 3. 出力
    if (JSON_OUTPUT) {
        console.log(JSON.stringify({ orgSecrets, rows }, null, 2));
        return;
    }

    console.log("# Secret deployment audit\n");
    console.log(`org-level secrets count: ${orgSecretCount} (Free プラン制約により private repo には届かないため期待値 0)\n`);
    console.log("| Project | Repo | APP_ID (標準) | APP_PRIVATE_KEY (標準) | DS_REPO_TOKEN (旧) | ORG_REPO_TOKEN (旧) | Note |");
    console.log("|---|---|---|---|---|---|---|");
    for (const r of rows) {
        console.log(`| ${r.name} | ${r.repo} | ${r.appId} | ${r.appKey} | ${r.dsRepo} | ${r.orgRepo} | ${r.note} |`);
    }

    // 終了コード: App credentials 配備済 repo に対する整合性違反 (片方だけ配備) があれば exit 1
    const incomplete = rows.filter((r) => (r.appId === "✅") !== (r.appKey === "✅")).length;
    if (incomplete > 0) {
        console.log(`\n⚠️ ${incomplete} リポで APP_ID / APP_PRIVATE_KEY 片方のみ配備（両方揃える必要あり）`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
