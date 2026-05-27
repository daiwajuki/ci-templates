#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates/scripts/deploy-secrets
 *
 * 14 業務 SaaS プロジェクト (+ 共通基盤) への secret ファンアウト配備スクリプト。
 * `_auth/scripts/deploy-auth-yml.mjs` パターンを移植。
 *
 * 安全策:
 *  - デフォルト dry-run。`--commit` を明示しないと書き込まない。
 *  - secret value は **絶対に** ログ出力しない（長さと先頭/末尾の一部のみ表示）。
 *  - status="archived" のプロジェクトは対象外（`--include-archived` で含める）。
 *  - githubRepo が空のエントリは skip。
 *
 * 使い方:
 *   # dry-run (デフォルト) — 何が配備されるか確認
 *   GH_PACKAGES_TOKEN_VAL=ghp_xxx node scripts/deploy-secrets.mjs \
 *     --target=GH_PACKAGES_TOKEN --scope=org --value-from=env:GH_PACKAGES_TOKEN_VAL
 *
 *   # 本当に書き込む
 *   GH_PACKAGES_TOKEN_VAL=ghp_xxx node scripts/deploy-secrets.mjs \
 *     --target=GH_PACKAGES_TOKEN --scope=org --value-from=env:GH_PACKAGES_TOKEN_VAL --commit
 *
 *   # repo-level に絞り込み配備
 *   node scripts/deploy-secrets.mjs \
 *     --target=EXTERNAL_CHECKOUT_TOKEN --scope=repo \
 *     --projects=ICPCostHub,ICPForms,Portal \
 *     --value-from=file:./token.txt --commit
 *
 *   # ファイルから読み込む例 (改行を含む PEM など)
 *   node scripts/deploy-secrets.mjs \
 *     --target=EXTERNAL_CHECKOUT_APP_PRIVATE_KEY --scope=repo \
 *     --projects=all \
 *     --value-from=file:./app-private-key.pem --commit
 *
 * CLI:
 *   --target=<NAME>                 配備する secret 名 (必須、UPPER_SNAKE_CASE)
 *   --scope=org|repo                配備先 (デフォルト repo)
 *   --value-from=env:VAR|file:PATH  値の取得元 (必須)
 *   --projects=all|active|<csv>     対象プロジェクト (デフォルト active、scope=repo 時のみ)
 *   --include-archived              archived プロジェクトも含める
 *   --visibility=all|private|selected  scope=org 時のみ (デフォルト all)
 *   --commit                        実際に書き込む (省略時は dry-run)
 *   --json                          JSON 出力 (CI 用)
 *
 * 前提:
 *   - gh auth status で daiwajuki org にアクセス可能なアカウントでログイン済み
 *   - gh secret set の実行権限あり
 */

import { execSync } from "node:child_process";
import { readFile, readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEVELOP_DIR = path.resolve(__dirname, "..", "..");
const PROJECTS_META = path.join(DEVELOP_DIR, "_tools", "data", "projects-meta.json");

const ORG = "daiwajuki";

// ─── arg parser ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { commit: false, json: false, includeArchived: false };
    for (const a of argv) {
        if (a === "--commit") args.commit = true;
        else if (a === "--json") args.json = true;
        else if (a === "--include-archived") args.includeArchived = true;
        else if (a.startsWith("--target=")) args.target = a.slice("--target=".length);
        else if (a.startsWith("--scope=")) args.scope = a.slice("--scope=".length);
        else if (a.startsWith("--value-from=")) args.valueFrom = a.slice("--value-from=".length);
        else if (a.startsWith("--projects=")) args.projects = a.slice("--projects=".length);
        else if (a.startsWith("--visibility=")) args.visibility = a.slice("--visibility=".length);
        else if (a === "--help" || a === "-h") args.help = true;
    }
    return args;
}

function usage() {
    console.log(`Usage:
  node scripts/deploy-secrets.mjs \\
    --target=<NAME> \\
    --scope=org|repo \\
    --value-from=env:<VAR>|file:<PATH> \\
    [--projects=all|active|<csv>] \\
    [--include-archived] \\
    [--visibility=all|private|selected]   # org scope only
    [--commit]                            # default: dry-run
    [--json]

Examples:
  GH_PACKAGES_TOKEN_VAL=ghp_xxx node scripts/deploy-secrets.mjs \\
    --target=GH_PACKAGES_TOKEN --scope=org --value-from=env:GH_PACKAGES_TOKEN_VAL --commit

  node scripts/deploy-secrets.mjs \\
    --target=EXTERNAL_CHECKOUT_APP_PRIVATE_KEY --scope=repo \\
    --projects=ICPCostHub,ICPForms \\
    --value-from=file:./app-key.pem --commit
`);
}

// ─── value loader ─────────────────────────────────────────────────────────────

function loadValue(spec) {
    if (!spec) throw new Error("--value-from is required");
    if (spec.startsWith("env:")) {
        const v = spec.slice("env:".length);
        const val = process.env[v];
        if (val === undefined) throw new Error(`env var ${v} is not set`);
        return val;
    }
    if (spec.startsWith("file:")) {
        const p = spec.slice("file:".length);
        return readFileSync(p, "utf8");
    }
    throw new Error(`unsupported --value-from format: ${spec} (expected env:VAR or file:PATH)`);
}

// 値の preview (長さ + 先頭4 + 末尾4 のみ。中身は絶対に出さない)
function previewValue(val) {
    const len = val.length;
    if (len <= 8) return `(${len} chars)`;
    return `(${len} chars: ${val.slice(0, 4)}…${val.slice(-4)})`;
}

// ─── secret name validation ───────────────────────────────────────────────────

function validateSecretName(name) {
    if (!name) throw new Error("--target is required");
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
        throw new Error(
            `secret name must be UPPER_SNAKE_CASE (e.g. GH_PACKAGES_TOKEN). got: ${name}\n` +
                `  hint: GitHub Actions secret 名にハイフン不可。${name.replace(/-/g, "_").toUpperCase()} を使う。`
        );
    }
}

// ─── project selection ────────────────────────────────────────────────────────

function selectProjects(meta, args) {
    const all = Object.entries(meta);
    let filtered = all;

    // --projects フィルタ
    if (args.projects === "all" || !args.projects) {
        // 全件 (active も archived も含む。archived は次の filter で外す)
    } else if (args.projects === "active") {
        filtered = filtered.filter(([, m]) => m.status !== "archived");
    } else {
        const wanted = new Set(args.projects.split(",").map((s) => s.trim()));
        filtered = filtered.filter(([name]) => wanted.has(name));
        // 名前指定の場合は archived も含める (ユーザーが明示したので)
    }

    // archived 除外 (--include-archived がなければ)
    if (!args.includeArchived && args.projects !== undefined && !args.projects.includes(",")) {
        filtered = filtered.filter(([, m]) => m.status !== "archived");
    }

    // githubRepo 空は skip
    filtered = filtered.filter(([, m]) => m.githubRepo);

    return filtered;
}

// ─── gh secret set wrapper ────────────────────────────────────────────────────

function ghSecretSet({ name, value, scope, target, visibility, commit }) {
    let cmd;
    if (scope === "org") {
        cmd = `gh secret set ${name} --org ${ORG} --visibility ${visibility || "all"}`;
    } else if (scope === "repo") {
        cmd = `gh secret set ${name} --repo ${target}`;
    } else {
        throw new Error(`unsupported scope: ${scope}`);
    }
    if (!commit) {
        return { ok: true, dryRun: true, cmd: `${cmd} (value via stdin)` };
    }
    try {
        // 値は stdin から渡す (CLI 引数だとプロセス一覧に出るため)
        // gh secret set: --body を省略すると stdin から読む (gh 2.87+)
        execSync(cmd, { input: value, stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" });
        return { ok: true, dryRun: false };
    } catch (e) {
        return { ok: false, error: e.message.split("\n").slice(0, 3).join(" | ") };
    }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        usage();
        return;
    }

    try {
        validateSecretName(args.target);
    } catch (e) {
        console.error(`::error::${e.message}`);
        usage();
        process.exit(2);
    }

    const scope = args.scope || "repo";
    if (scope !== "org" && scope !== "repo") {
        console.error(`::error::--scope must be 'org' or 'repo' (got: ${scope})`);
        process.exit(2);
    }

    let value;
    try {
        value = loadValue(args.valueFrom);
    } catch (e) {
        console.error(`::error::${e.message}`);
        usage();
        process.exit(2);
    }

    // ───────────────── org scope ─────────────────
    if (scope === "org") {
        console.log(`# Deploy secret: ${args.target}`);
        console.log(`scope: org (${ORG})`);
        console.log(`value: ${previewValue(value)}`);
        console.log(`visibility: ${args.visibility || "all"}`);
        console.log(`mode: ${args.commit ? "COMMIT" : "DRY-RUN (pass --commit to actually write)"}\n`);

        const res = ghSecretSet({
            name: args.target,
            value,
            scope: "org",
            visibility: args.visibility,
            commit: args.commit,
        });

        if (args.json) {
            console.log(JSON.stringify({ target: args.target, scope: "org", result: res }, null, 2));
        } else if (res.dryRun) {
            console.log(`(dry-run) ${res.cmd}`);
        } else if (res.ok) {
            console.log(`✅ deployed`);
        } else {
            console.log(`❌ failed: ${res.error}`);
            process.exit(1);
        }
        return;
    }

    // ───────────────── repo scope ─────────────────
    const meta = JSON.parse(await readFileAsync(PROJECTS_META, "utf8"));
    const projects = selectProjects(meta, args);

    if (projects.length === 0) {
        console.error(`::error::no projects matched --projects=${args.projects || "active"}`);
        process.exit(2);
    }

    console.log(`# Deploy secret: ${args.target}`);
    console.log(`scope: repo (${projects.length} projects)`);
    console.log(`value: ${previewValue(value)}`);
    console.log(`mode: ${args.commit ? "COMMIT" : "DRY-RUN (pass --commit to actually write)"}\n`);

    const results = [];
    for (const [name, m] of projects) {
        const res = ghSecretSet({
            name: args.target,
            value,
            scope: "repo",
            target: m.githubRepo,
            commit: args.commit,
        });
        results.push({ name, repo: m.githubRepo, ...res });

        const icon = res.dryRun ? "💡" : res.ok ? "✅" : "❌";
        const detail = res.dryRun ? "(dry-run)" : res.ok ? "" : ` — ${res.error}`;
        console.log(`${icon} ${name.padEnd(24)} ${m.githubRepo.padEnd(38)}${detail}`);
    }

    if (args.json) {
        console.log("\n" + JSON.stringify({ target: args.target, scope: "repo", results }, null, 2));
    }

    const failed = results.filter((r) => r.ok === false).length;
    if (failed > 0) {
        console.log(`\n❌ ${failed}/${results.length} projects failed`);
        process.exit(1);
    }
    if (!args.commit) {
        console.log(`\n💡 DRY-RUN complete. Add --commit to actually deploy.`);
    } else {
        console.log(`\n✅ ${results.length}/${results.length} projects deployed`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
