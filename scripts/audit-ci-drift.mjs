#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates/scripts/audit-ci-drift
 *
 * .github/adopters.json と実際の採用状況の drift を検出する。
 *
 * 検出する drift:
 *  - missing       : 実際に `daiwajuki/ci-templates` を `uses:` しているのに adopters.json に無い
 *  - stale         : adopters.json にあるのに実際には使っていない
 *  - uses-mismatch : adopters.json の `uses` 配列と実態の reusable workflow 集合がズレている
 *  - stale-pin     : `@v0` 以外で固定 pin している (例: @v0.6.0)。情報通知のみ、drift 扱い
 *
 * 設計: docs/audit-ci-drift-design.md (補完案、line 161)
 *
 * 使い方:
 *   node scripts/audit-ci-drift.mjs               # ローカル DEVELOP_DIR をスキャン
 *   node scripts/audit-ci-drift.mjs --remote      # gh search code で daiwajuki org をスキャン
 *   node scripts/audit-ci-drift.mjs --json-out=audit-ci-drift.json
 *   node scripts/audit-ci-drift.mjs --strict      # stale-pin も drift 扱い (exit 1)
 *
 * Exit code:
 *   0 = drift なし
 *   1 = drift あり (missing / stale / uses-mismatch、--strict 時は stale-pin も含む)
 *   2 = 実行エラー
 */

import { execSync } from "node:child_process";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEVELOP_DIR = path.resolve(REPO_ROOT, "..");
const ADOPTERS_FILE = path.join(REPO_ROOT, ".github", "adopters.json");

const argv = process.argv.slice(2);
const REMOTE = argv.includes("--remote");
const STRICT = argv.includes("--strict");
const JSON_OUT = argv.find((a) => a.startsWith("--json-out="))?.split("=")[1];

// adopters.schema.json の enum と一致させる (新 reusable workflow を追加したら両方更新)
const KNOWN_WORKFLOWS = new Set([
    "ci-next",
    "ci-laravel",
    "ci-fastapi",
    "deploy-cloudrun-next",
    "deploy-cloudrun-laravel",
    "deploy-cloudrun-fastapi",
]);

// "uses: daiwajuki/ci-templates/.github/workflows/<name>.yml@<ref>" を拾う
const USES_PATTERN =
    /daiwajuki\/ci-templates\/\.github\/workflows\/([a-z0-9-]+)\.yml@(\S+)/gi;

/**
 * @typedef {{ name: string; refs: Set<string> }} WorkflowUsage
 * @typedef {{ repo: string; usages: Map<string, WorkflowUsage> }} RepoActual
 */

async function loadAdopters() {
    const json = JSON.parse(await readFile(ADOPTERS_FILE, "utf8"));
    /** @type {Map<string, { uses: string[] }>} */
    const map = new Map();
    for (const a of json.adopters) {
        map.set(a.repo, { uses: a.uses });
    }
    return map;
}

async function scanLocal() {
    /** @type {Map<string, RepoActual>} */
    const repos = new Map();
    const entries = await readdir(DEVELOP_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "_ci-templates") continue; // 自分自身を除く
        const wfDir = path.join(DEVELOP_DIR, entry.name, ".github", "workflows");
        let wfFiles;
        try {
            wfFiles = await readdir(wfDir);
        } catch {
            continue;
        }
        for (const file of wfFiles) {
            if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
            const filePath = path.join(wfDir, file);
            let content;
            try {
                content = await readFile(filePath, "utf8");
            } catch {
                continue;
            }
            for (const m of content.matchAll(USES_PATTERN)) {
                const [, name, ref] = m;
                // local の dir name → adopters.json の repo 名はそのまま owner なし
                // adopters.json は "daiwajuki/<DirName>" 形式 (大文字小文字も含めて exact match)
                const repoKey = `daiwajuki/${entry.name}`;
                let actual = repos.get(repoKey);
                if (!actual) {
                    actual = { repo: repoKey, usages: new Map() };
                    repos.set(repoKey, actual);
                }
                let usage = actual.usages.get(name);
                if (!usage) {
                    usage = { name, refs: new Set() };
                    actual.usages.set(name, usage);
                }
                usage.refs.add(ref);
            }
        }
    }
    return repos;
}

async function scanRemote() {
    // 当初 `gh search code` を使ったが、GitHub Code Search API は **private repo を
    // index しない** (org の plan に関係なく /search/code エンドポイントで返らない)
    // ため 0 件しか取れず false positive で全 adopter が stale 扱いになる事象を確認
    // (2026-05-25 token 配備後の初回 dry-run)。
    //
    // 代わりに以下を実行：
    //  1. /orgs/daiwajuki/repos で org の全 repo を列挙 (private 含む)
    //  2. 各 repo の .github/workflows ディレクトリ contents を取得
    //  3. 各 yml/yaml を contents API で取得 → USES_PATTERN を回す
    //
    // PAT に必要な権限：Metadata:read (repo 列挙)、Contents:read (file 取得)。
    /** @type {Map<string, RepoActual>} */
    const repos = new Map();

    // org の repo 一覧 (archived 含む。後で archived は対象から外す)。
    // 注: gh api の `-q` jq フィルタは Windows execSync で path 解釈されることが
    // あるため (`.[]` の leading `.` がファイル解決に走る)、jq は使わず生 JSON を
    // node 側でパースする。
    // 注: gh api `--paginate` は Windows execSync で空文字を返す (stderr 経由の
    // pagination メッセージで stdio バッファが詰まる挙動と思われる)。
    // per_page=100 で全 repo (現状 21 件) が取得できるため --paginate は使わない。
    // 100 件超になったら page=2 を明示ループする実装に切り替える。
    let allRepos = [];
    try {
        const raw = execSync(
            `gh api orgs/daiwajuki/repos?per_page=100`,
            { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
        );
        allRepos = JSON.parse(raw);
        if (allRepos.length === 100) {
            console.error(
                "::warning::org has 100+ repos; pagination not implemented yet, results may be incomplete"
            );
        }
    } catch (err) {
        console.error(`Failed to list daiwajuki org repos: ${err.message}`);
        process.exit(2);
    }

    for (const r of allRepos) {
        if (r.name === "ci-templates") continue;
        if (r.archived) continue;
        const repoFull = `daiwajuki/${r.name}`;
        // workflows ディレクトリの contents (404 はスキップ = workflows 無し)。
        // 注: `2>/dev/null || true` 風の shell トリックは Windows execSync で
        // 期待通り動かないため、try/catch で 404 を吸収する。
        let entries;
        try {
            const raw = execSync(
                `gh api repos/${repoFull}/contents/.github/workflows`,
                { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
            );
            entries = JSON.parse(raw);
            if (!Array.isArray(entries)) continue;
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.type !== "file") continue;
            if (!entry.name.endsWith(".yml") && !entry.name.endsWith(".yaml")) continue;
            let content;
            try {
                // -q を避けるため生 JSON を取得 → node 側で base64 デコード
                const raw = execSync(
                    `gh api repos/${repoFull}/contents/.github/workflows/${entry.name}`,
                    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
                );
                const fileJson = JSON.parse(raw);
                content = Buffer.from(fileJson.content || "", "base64").toString("utf8");
            } catch {
                continue;
            }
            for (const m of content.matchAll(USES_PATTERN)) {
                const [, name, ref] = m;
                let actual = repos.get(repoFull);
                if (!actual) {
                    actual = { repo: repoFull, usages: new Map() };
                    repos.set(repoFull, actual);
                }
                let usage = actual.usages.get(name);
                if (!usage) {
                    usage = { name, refs: new Set() };
                    actual.usages.set(name, usage);
                }
                usage.refs.add(ref);
            }
        }
    }
    return repos;
}

/**
 * 大文字小文字違い (例: adopters.json="daiwajuki/Portal" vs scan="daiwajuki/portal") を吸収して
 * 比較する。adopters.json 側を正規表記とみなし、scan 結果を case-insensitive で引き当てる。
 */
function normalizeKey(key) {
    return key.toLowerCase();
}

function diff(adopters, actual) {
    const drift = {
        missing: [], // 実態にあるが adopters.json に無い
        stale: [], // adopters.json にあるが実態には無い
        usesMismatch: [], // 両方にあるが uses が違う
        stalePin: [], // @v0 以外で pin
    };

    const adoptersByKey = new Map();
    for (const [repo, info] of adopters) {
        adoptersByKey.set(normalizeKey(repo), { repo, ...info });
    }
    const actualByKey = new Map();
    for (const [repo, info] of actual) {
        actualByKey.set(normalizeKey(repo), info);
    }

    // missing
    for (const [key, info] of actualByKey) {
        if (!adoptersByKey.has(key)) {
            drift.missing.push({
                repo: info.repo,
                actualUses: [...info.usages.keys()].sort(),
            });
        }
    }

    // stale
    for (const [key, info] of adoptersByKey) {
        if (!actualByKey.has(key)) {
            drift.stale.push({ repo: info.repo, declaredUses: info.uses });
        }
    }

    // uses-mismatch
    for (const [key, declared] of adoptersByKey) {
        const actualInfo = actualByKey.get(key);
        if (!actualInfo) continue;
        const declaredSet = new Set(declared.uses);
        const actualSet = new Set(actualInfo.usages.keys());
        const added = [...actualSet].filter((u) => !declaredSet.has(u)).sort();
        const removed = [...declaredSet].filter((u) => !actualSet.has(u)).sort();
        if (added.length || removed.length) {
            drift.usesMismatch.push({
                repo: declared.repo,
                declared: declared.uses,
                actual: [...actualSet].sort(),
                added,
                removed,
            });
        }
    }

    // stale-pin: @v0 以外で pin している
    for (const info of actualByKey.values()) {
        for (const usage of info.usages.values()) {
            for (const ref of usage.refs) {
                if (ref !== "v0") {
                    drift.stalePin.push({
                        repo: info.repo,
                        workflow: usage.name,
                        ref,
                    });
                }
            }
        }
    }
    drift.stalePin.sort(
        (a, b) =>
            a.repo.localeCompare(b.repo) || a.workflow.localeCompare(b.workflow)
    );

    // 未知 workflow 警告 (schema enum 漏れ検出)
    const unknownWorkflows = new Set();
    for (const info of actualByKey.values()) {
        for (const name of info.usages.keys()) {
            if (!KNOWN_WORKFLOWS.has(name)) unknownWorkflows.add(name);
        }
    }
    drift.unknownWorkflows = [...unknownWorkflows].sort();

    return drift;
}

function renderMarkdown(drift, mode) {
    const lines = [];
    lines.push(`# adopters.json drift audit`);
    lines.push("");
    lines.push(`生成時刻: ${new Date().toISOString()}`);
    lines.push(`スキャンモード: ${mode}`);
    lines.push("");

    const hasHard =
        drift.missing.length || drift.stale.length || drift.usesMismatch.length;
    const hasSoft = drift.stalePin.length || drift.unknownWorkflows.length;

    if (!hasHard && !hasSoft) {
        lines.push("✅ **drift なし**。adopters.json は実態と一致。");
        return lines.join("\n") + "\n";
    }

    if (drift.missing.length) {
        lines.push("## ❌ missing — adopters.json に未登録の採用者");
        lines.push("");
        lines.push("| repo | 実態の uses |");
        lines.push("|---|---|");
        for (const m of drift.missing) {
            lines.push(`| \`${m.repo}\` | ${m.actualUses.map((u) => `\`${u}\``).join(", ")} |`);
        }
        lines.push("");
    }

    if (drift.stale.length) {
        lines.push("## 🗑️ stale — adopters.json に残っているが実態では使われていない");
        lines.push("");
        lines.push("| repo | 宣言中の uses |");
        lines.push("|---|---|");
        for (const s of drift.stale) {
            lines.push(`| \`${s.repo}\` | ${s.declaredUses.map((u) => `\`${u}\``).join(", ")} |`);
        }
        lines.push("");
    }

    if (drift.usesMismatch.length) {
        lines.push("## ⚠️ uses-mismatch — `uses` 配列が実態とズレている");
        lines.push("");
        lines.push("| repo | 追加すべき | 削除すべき |");
        lines.push("|---|---|---|");
        for (const u of drift.usesMismatch) {
            lines.push(
                `| \`${u.repo}\` | ${u.added.map((x) => `\`${x}\``).join(", ") || "—"} | ${u.removed.map((x) => `\`${x}\``).join(", ") || "—"} |`
            );
        }
        lines.push("");
    }

    if (drift.stalePin.length) {
        lines.push("## 🔒 stale-pin — `@v0` 以外で固定 pin (情報通知、--strict で drift 扱い)");
        lines.push("");
        lines.push("| repo | workflow | pin |");
        lines.push("|---|---|---|");
        for (const p of drift.stalePin) {
            lines.push(`| \`${p.repo}\` | \`${p.workflow}\` | \`${p.ref}\` |`);
        }
        lines.push("");
    }

    if (drift.unknownWorkflows.length) {
        lines.push("## ❓ unknown-workflow — adopters.schema.json の enum に無い workflow 名を検出");
        lines.push("");
        lines.push(
            "schema enum 更新漏れの可能性。`.github/adopters.schema.json` の `uses` enum に追加するか、"
        );
        lines.push("名称 typo か確認。");
        lines.push("");
        for (const w of drift.unknownWorkflows) {
            lines.push(`- \`${w}\``);
        }
        lines.push("");
    }

    return lines.join("\n") + "\n";
}

async function main() {
    const adopters = await loadAdopters();
    const actual = REMOTE ? await scanRemote() : await scanLocal();
    const drift = diff(adopters, actual);
    const md = renderMarkdown(drift, REMOTE ? "remote (gh api contents)" : "local (DEVELOP_DIR)");
    process.stdout.write(md);

    if (JSON_OUT) {
        await writeFile(JSON_OUT, JSON.stringify(drift, null, 2) + "\n", "utf8");
    }

    // GitHub Actions Step Summary
    if (process.env.GITHUB_STEP_SUMMARY) {
        await writeFile(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
    }

    const hardDrift =
        drift.missing.length || drift.stale.length || drift.usesMismatch.length;
    const softDrift = drift.stalePin.length;
    if (hardDrift || (STRICT && softDrift)) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
