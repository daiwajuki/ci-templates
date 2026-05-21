#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates/scripts/build-adoption-snapshot
 *
 * 全プロジェクトの `@daiwajuki/*` 採用バージョンを集計し、Markdown 表 + JSON で出力。
 * GitHub Actions の Step Summary に投入される想定 (governance-plan v3 Wave D)。
 *
 * 状態区分:
 *  - ✅ up-to-date: 最新 MAJOR を採用
 *  - ⚠️ behind: 旧 MAJOR を採用
 *  - 🔍 file: ローカル file: 依存（Wave A 後の swap 前提）
 *  - — unadopted: 未統合
 *
 * 使い方:
 *   node scripts/build-adoption-snapshot.mjs               # ローカル DEVELOP_DIR をスキャン
 *   node scripts/build-adoption-snapshot.mjs --remote      # gh CLI で GitHub からスキャン
 *   node scripts/build-adoption-snapshot.mjs --json-out=adoption-snapshot.json
 */

import { execSync } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEVELOP_DIR = path.resolve(__dirname, "..", "..");
const PROJECTS_META = path.join(DEVELOP_DIR, "scripts", "projects-meta.json");

const argv = process.argv.slice(2);
const REMOTE = argv.includes("--remote");
const JSON_OUT = argv.find((a) => a.startsWith("--json-out="))?.split("=")[1];

const PACKAGES = {
    "@daiwajuki/auth": "_auth",
    "@daiwajuki/ui-design": "_design-system",
};

async function getLatestVersion(packageDir) {
    try {
        const pkgPath = path.join(DEVELOP_DIR, packageDir, "package.json");
        const json = JSON.parse(await readFile(pkgPath, "utf8"));
        return json.version;
    } catch {
        return null;
    }
}

async function getProjectPackageJson(name, meta) {
    if (REMOTE) {
        if (!meta.githubRepo) return null;
        try {
            const out = execSync(`gh api repos/${meta.githubRepo}/contents/package.json -q .content`, {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
            });
            return JSON.parse(Buffer.from(out, "base64").toString("utf8"));
        } catch {
            return null;
        }
    } else {
        try {
            const pkgPath = path.join(DEVELOP_DIR, name, "package.json");
            await stat(pkgPath);
            return JSON.parse(await readFile(pkgPath, "utf8"));
        } catch {
            return null;
        }
    }
}

function classifySpec(spec, latestVersion) {
    if (!spec) return { icon: "—", label: "unadopted" };
    if (spec.startsWith("file:")) return { icon: "🔍", label: `file: (will swap to ^${latestVersion} in CI)` };
    // semver caret: e.g. "^1.13.0" -> "1.13.0"
    const matched = spec.match(/^[\^~>=<]*(\d+\.\d+\.\d+)/);
    if (!matched) return { icon: "❓", label: spec };

    const adoptedMajor = matched[1].split(".")[0];
    const latestMajor = latestVersion?.split(".")[0];
    if (adoptedMajor === latestMajor) return { icon: "✅", label: spec };
    return { icon: "⚠️", label: `${spec} (behind, latest ${latestVersion})` };
}

async function main() {
    const projectsMeta = JSON.parse(await readFile(PROJECTS_META, "utf8"));
    const latest = {};
    for (const [pkgName, pkgDir] of Object.entries(PACKAGES)) {
        latest[pkgName] = await getLatestVersion(pkgDir);
    }

    const rows = [];
    for (const [name, meta] of Object.entries(projectsMeta)) {
        const pkg = await getProjectPackageJson(name, meta);
        if (!pkg) {
            rows.push({ name, repo: meta.githubRepo || "—", auth: "—", ui: "—", status: "no package.json" });
            continue;
        }

        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const auth = classifySpec(deps["@daiwajuki/auth"], latest["@daiwajuki/auth"]);
        const ui = classifySpec(deps["@daiwajuki/ui-design"], latest["@daiwajuki/ui-design"]);

        rows.push({
            name,
            repo: meta.githubRepo || "—",
            auth: `${auth.icon} ${auth.label}`,
            ui: `${ui.icon} ${ui.label}`,
            authIcon: auth.icon,
            uiIcon: ui.icon,
        });
    }

    // Markdown 出力
    let md = "# 採用状況スナップショット\n\n";
    md += `生成時刻: ${new Date().toISOString()}\n`;
    md += `スキャン元: ${REMOTE ? "GitHub (remote)" : "ローカル DEVELOP_DIR"}\n\n`;
    md += `**最新バージョン**: @daiwajuki/auth \`${latest["@daiwajuki/auth"] ?? "?"}\` / @daiwajuki/ui-design \`${latest["@daiwajuki/ui-design"] ?? "?"}\`\n\n`;
    md += "| Project | Repo | @daiwajuki/auth | @daiwajuki/ui-design |\n";
    md += "|---|---|---|---|\n";
    for (const r of rows) {
        md += `| ${r.name} | \`${r.repo}\` | ${r.auth} | ${r.ui} |\n`;
    }
    md += "\n## 凡例\n";
    md += "- ✅ up-to-date: 最新 MAJOR を採用\n";
    md += "- ⚠️ behind: 旧 MAJOR を採用（追従はプロジェクト裁量）\n";
    md += "- 🔍 file: ローカル file: 依存（CI で `^semver` に swap）\n";
    md += "- — unadopted: 未統合\n";

    console.log(md);

    // Step Summary 出力
    if (process.env.GITHUB_STEP_SUMMARY) {
        await writeFile(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
    }

    // JSON 出力
    if (JSON_OUT) {
        const snapshot = {
            generatedAt: new Date().toISOString(),
            scanMode: REMOTE ? "remote" : "local",
            latest,
            rows,
        };
        await writeFile(JSON_OUT, JSON.stringify(snapshot, null, 2), "utf8");
        console.log(`\nJSON written to ${JSON_OUT}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
