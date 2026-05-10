#!/usr/bin/env node
/**
 * @daiwajuki/ci-templates - sync-templates.mjs
 *
 * 採用側プロジェクトで実行する CLI:
 *   node ../_ci-templates/scripts/sync-templates.mjs --target=dockerfile --stack=next --variant=alpine
 *
 * GitHub raw URL から指定 version の template ファイルを fetch して
 * 採用側ディレクトリにコピーする。同期履歴を `.ci-templates.json` に記録。
 *
 * Zero-install: Node 20+ の標準 fetch のみ使用、追加 npm dep は不要。
 *
 * オプション:
 *   --target            dockerfile | compose | all (default: all)
 *   --stack             next | fastapi | laravel
 *   --variant           alpine | slim | uv | poetry | fpm-nginx | frankenphp
 *   --compose-variant   postgres-only | postgres-redis (default: postgres-only)
 *   --version           v0 | v0.6.0 | etc. (default: v0)
 *   --output            出力パス (default: stack/variant に応じて自動)
 *   --dry-run           差分プレビューのみ
 *   --force             既存ファイルを上書き
 *   --help              ヘルプ表示
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO = 'daiwajuki/ci-templates';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}`;
const MANIFEST = '.ci-templates.json';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  await main(args);
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
}

async function main(args) {
  const tasks = resolveTasks(args);

  if (tasks.length === 0) {
    throw new Error('対象が決まりませんでした。--help で使い方を確認してください。');
  }

  const manifest = await loadManifest();

  for (const task of tasks) {
    await syncOne(task, manifest, args);
  }

  if (!args['dry-run']) {
    await saveManifest(manifest);
    console.log(`\n✅ ${MANIFEST} を更新しました。`);
  } else {
    console.log('\n[dry-run] manifest は更新しません。');
  }
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v] = arg.replace(/^--/, '').split('=');
    out[k] = v ?? true;
  }
  return out;
}

function resolveTasks(args) {
  const target = args.target ?? 'all';
  const stack = args.stack;
  const variant = args.variant;
  const version = args.version ?? 'v0';
  const tasks = [];

  if (target === 'dockerfile' || target === 'all') {
    if (!stack) {
      throw new Error('--stack=<next|fastapi|laravel> が必要です');
    }
    if (!variant) {
      throw new Error(
        '--variant が必要です（next: alpine|slim, fastapi: uv|poetry, laravel: fpm-nginx|frankenphp）'
      );
    }
    validateVariant(stack, variant);
    tasks.push({
      kind: 'dockerfile',
      source: `dockerfiles/${stack}/Dockerfile.${variant}`,
      output: args.output ?? 'Dockerfile',
      version,
    });
  }

  if (target === 'compose' || target === 'all') {
    const composeVariant = args['compose-variant'] ?? 'postgres-only';
    validateComposeVariant(composeVariant);
    tasks.push({
      kind: 'compose',
      source: `docker-compose/${composeVariant}.yml`,
      output:
        args.output && target === 'compose' ? args.output : 'docker-compose.yml',
      version,
    });
  }

  return tasks;
}

function validateVariant(stack, variant) {
  const allowed = {
    next: ['alpine', 'slim'],
    fastapi: ['uv', 'poetry'],
    laravel: ['fpm-nginx', 'frankenphp'],
  };
  if (!allowed[stack]) {
    throw new Error(`未知の stack: ${stack}`);
  }
  if (!allowed[stack].includes(variant)) {
    throw new Error(
      `stack=${stack} で variant=${variant} は無効です。許容: ${allowed[stack].join(', ')}`
    );
  }
}

function validateComposeVariant(variant) {
  const allowed = ['postgres-only', 'postgres-redis'];
  if (!allowed.includes(variant)) {
    throw new Error(
      `--compose-variant=${variant} は無効です。許容: ${allowed.join(', ')}`
    );
  }
}

async function syncOne(task, manifest, args) {
  const url = `${RAW_BASE}/${task.version}/${task.source}`;
  console.log(`\n→ Fetching ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `fetch failed: ${res.status} ${res.statusText} (${url})\n  source path / version 指定を確認してください`
    );
  }
  const content = await res.text();
  const sha = createHash('sha256').update(content).digest('hex').slice(0, 12);

  const outputPath = resolve(process.cwd(), task.output);
  const exists = existsSync(outputPath);

  if (exists) {
    const current = await readFile(outputPath, 'utf8');
    if (current === content) {
      console.log(`  ⏭  ${task.output} は既に最新（差分なし、sha=${sha}）`);
      updateManifestEntry(manifest, task, sha);
      return;
    }
    if (!args.force && !args['dry-run']) {
      throw new Error(
        `${task.output} は既存で内容が異なります。--dry-run で差分確認、--force で上書き`
      );
    }
    if (args['dry-run']) {
      console.log(
        `  [dry-run] ${task.output} が既存。--force で上書き予定（${content.length} bytes, sha=${sha}）`
      );
      return;
    }
    console.log(`  ⚠  上書きします: ${task.output}`);
  }

  if (args['dry-run']) {
    console.log(
      `  [dry-run] would write ${task.output} (${content.length} bytes, sha=${sha})`
    );
    return;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, 'utf8');
  console.log(`  ✅ wrote ${task.output} (${content.length} bytes, sha=${sha})`);

  updateManifestEntry(manifest, task, sha);
}

function updateManifestEntry(manifest, task, sha) {
  manifest.synced ??= [];
  const idx = manifest.synced.findIndex((e) => e.target === task.output);
  const entry = {
    target: task.output,
    source: task.source,
    version: task.version,
    sha,
    synced_at: new Date().toISOString(),
  };
  if (idx >= 0) {
    manifest.synced[idx] = entry;
  } else {
    manifest.synced.push(entry);
  }
}

async function loadManifest() {
  if (!existsSync(MANIFEST)) {
    return { repo: REPO, synced: [] };
  }
  try {
    const raw = await readFile(MANIFEST, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${MANIFEST} の読込に失敗: ${e.message}`);
  }
}

async function saveManifest(manifest) {
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function printHelp() {
  console.log(`
@daiwajuki/ci-templates - sync-templates.mjs

採用側プロジェクトのルートで実行して、_ci-templates の Dockerfile / docker-compose
テンプレートを GitHub raw URL から fetch してコピーします。

Usage:
  node <path>/sync-templates.mjs --target=dockerfile --stack=next --variant=alpine
  node <path>/sync-templates.mjs --target=compose --compose-variant=postgres-only
  node <path>/sync-templates.mjs --target=all --stack=next --variant=alpine

Options:
  --target            dockerfile | compose | all                 (default: all)
  --stack             next | fastapi | laravel                   (Dockerfile に必要)
  --variant           alpine | slim | uv | poetry | fpm-nginx | frankenphp
  --compose-variant   postgres-only | postgres-redis             (default: postgres-only)
  --version           v0 | v0.6.0                                (default: v0)
  --output            出力パス                                    (default: ./Dockerfile or ./docker-compose.yml)
  --dry-run           差分のみプレビュー
  --force             既存ファイルを上書き
  --help              このヘルプを表示

同期履歴は .ci-templates.json に記録されます（Phase F の audit-ci-drift で参照予定）。
`);
}
