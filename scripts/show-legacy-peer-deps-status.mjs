#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates/scripts/show-legacy-peer-deps-status
 *
 * 14 業務 SaaS プロジェクトで `npm install --no-legacy-peer-deps --dry-run` を
 * 順次実行し、`.npmrc` から `legacy-peer-deps=true` を撤去できる状況にあるかを集計する。
 *
 * 位置付け: governance-plan v3 Wave E ステップ 24 (_design-system@2.0.0 リリース時の
 *           出口判定) のための事前調査ツール。
 *
 * 仕組み:
 *  1. _tools/data/projects-meta.json から active プロジェクトを抽出
 *  2. 各プロジェクトディレクトリの存在と package.json の有無を確認
 *  3. `npm install --no-legacy-peer-deps --dry-run --no-audit --no-fund` を実行
 *  4. 終了コード + ERESOLVE 件数 + npm warn の件数を記録
 *  5. Markdown 表で stdout / 任意で docs/peer-deps-status.md に書き出し
 *
 * 結果の見方:
 *  ✅ 通る              dry-run 成功 + 警告ゼロ → `.npmrc` から legacy 撤去 OK
 *  ⚠️  警告のみ         dry-run 成功するが peer 警告あり → 撤去可だが将来 fix 推奨
 *  ❌ 失敗              dry-run 失敗 (ERESOLVE) → fix が必要
 *  ⏭️  skip             ローカルに repo 無し / package.json 無し / Node プロジェクトでない
 *
 * 使い方:
 *   node scripts/show-legacy-peer-deps-status.mjs
 *   node scripts/show-legacy-peer-deps-status.mjs --projects=Portal,ICPCostHub
 *   node scripts/show-legacy-peer-deps-status.mjs --write   # docs/peer-deps-status.md に保存
 *   node scripts/show-legacy-peer-deps-status.mjs --json    # JSON 出力 (CI 用)
 *   node scripts/show-legacy-peer-deps-status.mjs --timeout=180  # 各プロジェクトのタイムアウト (秒)
 *
 * 前提:
 *  - 各プロジェクトディレクトリが `C:\Users\daiwa\Develop\<ProjectName>` に clone 済み
 *  - npm v10+ がインストール済み
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEVELOP_DIR = path.resolve(REPO_ROOT, "..");
const PROJECTS_META = path.join(DEVELOP_DIR, "_tools", "data", "projects-meta.json");
const OUTPUT_MD = path.join(REPO_ROOT, "docs", "peer-deps-status.md");

// ─── args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { write: false, json: false, timeout: 120 };
    for (const a of argv) {
        if (a === "--write") args.write = true;
        else if (a === "--json") args.json = true;
        else if (a.startsWith("--projects=")) args.projects = a.slice("--projects=".length);
        else if (a.startsWith("--timeout=")) args.timeout = Number(a.slice("--timeout=".length));
        else if (a === "--help" || a === "-h") args.help = true;
    }
    return args;
}

function usage() {
    console.log(`Usage:
  node scripts/show-legacy-peer-deps-status.mjs
  node scripts/show-legacy-peer-deps-status.mjs --projects=<csv>
  node scripts/show-legacy-peer-deps-status.mjs --write
  node scripts/show-legacy-peer-deps-status.mjs --json
  node scripts/show-legacy-peer-deps-status.mjs --timeout=180   # default 120s per project
`);
}

// ─── npm dry-run runner ───────────────────────────────────────────────────────

function runDryRun(projectDir, timeoutSeconds) {
    const res = spawnSync(
        "npm",
        ["install", "--no-legacy-peer-deps", "--dry-run", "--no-audit", "--no-fund"],
        {
            cwd: projectDir,
            encoding: "utf8",
            timeout: timeoutSeconds * 1000,
            // Windows shell でも動くように
            shell: process.platform === "win32",
            // stdout / stderr とも capture
            stdio: ["ignore", "pipe", "pipe"],
            // npm が長時間 silent な場合の最大 buffer
            maxBuffer: 10 * 1024 * 1024,
        }
    );

    // タイムアウト or kill された場合
    if (res.error) {
        return { status: "error", exitCode: -1, eresolve: 0, warnings: 0, error: res.error.message.split("\n")[0] };
    }

    const stdout = res.stdout || "";
    const stderr = res.stderr || "";
    const combined = stdout + "\n" + stderr;
    const eresolve = (combined.match(/ERESOLVE/g) || []).length;
    const warnings = (combined.match(/^npm warn /gm) || []).length;
    const exitCode = res.status ?? -1;

    let status;
    if (exitCode === 0 && warnings === 0) status = "pass";
    else if (exitCode === 0) status = "warn";
    else status = "fail";

    return { status, exitCode, eresolve, warnings };
}

// ─── project selection ────────────────────────────────────────────────────────

function selectProjects(meta, args) {
    let entries = Object.entries(meta).filter(([, m]) => m.status !== "archived");
    if (args.projects) {
        const wanted = new Set(args.projects.split(",").map((s) => s.trim()));
        entries = entries.filter(([name]) => wanted.has(name));
    }
    return entries;
}

function resolveProjectDir(name) {
    const dir = path.join(DEVELOP_DIR, name);
    if (!existsSync(dir)) return null;
    try {
        if (!statSync(dir).isDirectory()) return null;
    } catch {
        return null;
    }
    return dir;
}

function hasPackageJson(dir) {
    return existsSync(path.join(dir, "package.json"));
}

// ─── output ───────────────────────────────────────────────────────────────────

const STATUS_ICON = {
    pass: "✅",
    warn: "⚠️",
    fail: "❌",
    skip: "⏭️",
    error: "⚠️",
};

function formatMarkdown(results) {
    const lines = [];
    lines.push("# Legacy peer-deps status");
    lines.push("");
    lines.push(`generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("各プロジェクトで `npm install --no-legacy-peer-deps --dry-run` を実行した結果。");
    lines.push("`.npmrc` の `legacy-peer-deps=true` 撤去可否を判断するための集計。");
    lines.push("");
    lines.push("| Project | Status | Exit | ERESOLVE | npm warn | Notes |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of results) {
        const icon = STATUS_ICON[r.status] || "?";
        const notes = r.note ? r.note : "";
        lines.push(
            `| ${r.name} | ${icon} ${r.status} | ${r.exitCode ?? "—"} | ${r.eresolve ?? "—"} | ${r.warnings ?? "—"} | ${notes} |`
        );
    }
    lines.push("");
    const total = results.length;
    const pass = results.filter((r) => r.status === "pass").length;
    const warn = results.filter((r) => r.status === "warn").length;
    const fail = results.filter((r) => r.status === "fail").length;
    const skip = results.filter((r) => r.status === "skip").length;
    const error = results.filter((r) => r.status === "error").length;
    lines.push("## サマリ");
    lines.push("");
    lines.push(`- ✅ pass: ${pass}`);
    lines.push(`- ⚠️ warn: ${warn}`);
    lines.push(`- ❌ fail: ${fail}`);
    lines.push(`- ⏭️ skip: ${skip}`);
    if (error > 0) lines.push(`- ⚠️ error (timeout/exec failure): ${error}`);
    lines.push(`- total: ${total}`);
    lines.push("");
    lines.push("## 推奨アクション");
    lines.push("");
    lines.push("- **pass** プロジェクトから順次 `.npmrc` の `legacy-peer-deps=true` 撤去 PR を出す");
    lines.push("- **warn** は撤去可だが、`overrides` か peer 範囲拡張で警告ゼロを目指す");
    lines.push("- **fail** は [docs/legacy-peer-deps.md](legacy-peer-deps.md) Step 3 の対応表に従って fix");
    lines.push("");
    return lines.join("\n");
}

function formatConsole(results) {
    console.log(""); // blank line after progress
    console.log("Project                  Status  Exit  ERESOLVE  warns  Notes");
    console.log("─".repeat(80));
    for (const r of results) {
        const icon = STATUS_ICON[r.status] || "?";
        console.log(
            `${r.name.padEnd(24)} ${icon} ${r.status.padEnd(5)} ${String(r.exitCode ?? "—").padStart(4)}  ${String(r.eresolve ?? "—").padStart(8)}  ${String(r.warnings ?? "—").padStart(5)}  ${r.note || ""}`
        );
    }
    console.log("");
    const pass = results.filter((r) => r.status === "pass").length;
    const warn = results.filter((r) => r.status === "warn").length;
    const fail = results.filter((r) => r.status === "fail").length;
    const skip = results.filter((r) => r.status === "skip").length;
    console.log(`Summary: ✅ pass=${pass}  ⚠️ warn=${warn}  ❌ fail=${fail}  ⏭️ skip=${skip}  total=${results.length}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        usage();
        return;
    }

    // npm の存在確認
    try {
        execSync("npm --version", { stdio: "pipe" });
    } catch {
        console.error("::error::npm not found in PATH");
        process.exit(2);
    }

    const meta = JSON.parse(await readFile(PROJECTS_META, "utf8"));
    const projects = selectProjects(meta, args);

    if (projects.length === 0) {
        console.error("::error::no projects matched");
        process.exit(2);
    }

    if (!args.json) {
        console.log(`# Legacy peer-deps audit (${projects.length} projects, timeout=${args.timeout}s each)\n`);
    }

    const results = [];
    let i = 0;
    for (const [name] of projects) {
        i++;
        const dir = resolveProjectDir(name);
        if (!dir) {
            results.push({ name, status: "skip", note: "local dir not found" });
            if (!args.json) console.log(`[${i}/${projects.length}] ${name}: ⏭️ skip (no local dir)`);
            continue;
        }
        if (!hasPackageJson(dir)) {
            results.push({ name, status: "skip", note: "no package.json (non-Node project)" });
            if (!args.json) console.log(`[${i}/${projects.length}] ${name}: ⏭️ skip (no package.json)`);
            continue;
        }
        if (!args.json) process.stdout.write(`[${i}/${projects.length}] ${name}: running... `);
        const result = runDryRun(dir, args.timeout);
        results.push({ name, ...result });
        if (!args.json) {
            const icon = STATUS_ICON[result.status];
            console.log(`${icon} ${result.status} (exit=${result.exitCode}, ERESOLVE=${result.eresolve}, warn=${result.warnings})`);
        }
    }

    if (args.json) {
        console.log(JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2));
    } else {
        formatConsole(results);
    }

    if (args.write) {
        const md = formatMarkdown(results);
        await writeFile(OUTPUT_MD, md, "utf8");
        if (!args.json) console.log(`\n📄 wrote ${path.relative(REPO_ROOT, OUTPUT_MD)}`);
    }

    // 非 0 終了は fail が存在する場合のみ
    const failCount = results.filter((r) => r.status === "fail").length;
    if (failCount > 0) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
