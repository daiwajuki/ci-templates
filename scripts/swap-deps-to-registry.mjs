#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates/scripts/swap-deps-to-registry
 *
 * CI / Cloud Run build 時に実行する。
 * 各プロジェクトの `package.json` で `"@daiwajuki/X": "file:../_X"` 形式の依存を
 * `"@daiwajuki/X": "^X.Y.Z"` (GitHub Packages 配給) に書き換える。
 *
 * 重要:
 *  - **commit しない**。CI 内の build step 直前で実行し、build 後に discard される想定
 *  - `file:..` のパス記法揺れ (`file:../_auth`, `file:../../_auth` 等) は正規表現で吸収
 *  - 最新バージョンは _auth/_design-system の `package.json` を直接読む (CI checkout 前提)
 *
 * 参照: governance-plan v3 Wave A ステップ 10
 *
 * 使い方:
 *   node swap-deps-to-registry.mjs                # cwd の package.json を処理
 *   node swap-deps-to-registry.mjs <project-dir>  # 指定ディレクトリ
 *   node swap-deps-to-registry.mjs --dry-run      # 書き換え内容のみ表示
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const DAIWAJUKI_PACKAGES = {
    "@daiwajuki/auth": "_auth",
    "@daiwajuki/ui-design": "_design-system",
};

// CI 環境変数で workspace root を指定（_auth / _design-system の場所）
// 未指定なら ../_X / ../../_X を順に探す
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || null;
const DRY_RUN = process.argv.includes("--dry-run");
const projectDir = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".");

async function tryReadPackageJson(dir, packageDirName) {
    const candidates = WORKSPACE_ROOT
        ? [path.join(WORKSPACE_ROOT, packageDirName, "package.json")]
        : [
              path.join(dir, "..", packageDirName, "package.json"),
              path.join(dir, "..", "..", packageDirName, "package.json"),
              path.join(dir, "..", "..", "..", packageDirName, "package.json"),
          ];

    for (const candidate of candidates) {
        try {
            await stat(candidate);
            const raw = await readFile(candidate, "utf8");
            const json = JSON.parse(raw);
            return { version: json.version, path: candidate };
        } catch {
            // try next
        }
    }
    return null;
}

function isFileSpecifier(value) {
    return typeof value === "string" && value.startsWith("file:");
}

async function main() {
    const pkgPath = path.join(projectDir, "package.json");
    let pkg;
    try {
        pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    } catch (e) {
        console.error(`Cannot read ${pkgPath}: ${e.message}`);
        process.exit(1);
    }

    const swaps = [];
    const sections = ["dependencies", "devDependencies", "peerDependencies"];

    for (const section of sections) {
        const deps = pkg[section];
        if (!deps) continue;

        for (const [pkgName, packageDirName] of Object.entries(DAIWAJUKI_PACKAGES)) {
            const current = deps[pkgName];
            if (!isFileSpecifier(current)) continue;

            const resolved = await tryReadPackageJson(projectDir, packageDirName);
            if (!resolved) {
                console.error(`[ERR] Cannot resolve version for ${pkgName} (searched ../_X, ../../_X, ../../../_X)`);
                process.exit(1);
            }

            const newSpec = `^${resolved.version}`;
            swaps.push({ section, pkgName, from: current, to: newSpec, source: resolved.path });

            if (!DRY_RUN) {
                deps[pkgName] = newSpec;
            }
        }
    }

    if (swaps.length === 0) {
        console.log("No @daiwajuki/* file: dependencies to swap");
        return;
    }

    console.log(`${DRY_RUN ? "[dry-run] Would swap" : "Swapped"} in ${pkgPath}:`);
    for (const s of swaps) {
        console.log(`  - ${s.section}.${s.pkgName}: ${s.from} -> ${s.to}`);
        console.log(`      (version source: ${s.source})`);
    }

    if (!DRY_RUN) {
        await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
        console.log("\nNote: package.json updated. Do NOT commit this change (CI ephemeral).");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
