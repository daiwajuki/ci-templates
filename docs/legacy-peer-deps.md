# `legacy-peer-deps=true` 運用と出口戦略

> **位置付け**: governance-plan v3 Wave A で 14 プロジェクトに配布する `.npmrc` の設定根拠、Wave E ステップ 24 の出口判定の手引き
> **対象**: `daiwajuki` org の 14 業務 SaaS プロジェクトすべて
> **前提**: 過渡期措置として全プロジェクトで `legacy-peer-deps=true` を有効化（governance-plan v3 軸 1）

## なぜ `legacy-peer-deps=true` が必要か

npm 7 以降のデフォルト動作（`legacy-peer-deps=false`）は、peer dependency の整合性を厳格にチェックする。`daiwajuki` org の現状で問題になるのは以下:

### 1. `_auth` の peer dependency 連鎖

`@daiwajuki/auth` v1.0.0 で peer dependency 化された主要パッケージ:

```json
{
  "peerDependencies": {
    "@daiwajuki/ui-design": "^1.13.0",
    "next": "^15.0.0 || ^16.0.0",
    "react": "^19.0.0",
    "next-auth": "5.0.0-beta.25",
    "drizzle-orm": "^0.36.0"
  }
}
```

このうち consumer 側がより新しいバージョンを使うと、npm は警告と共に install を中断する。例:
- 採用側が `next@16.1.6` を使う、`_auth` が `^15.0.0 || ^16.0.0` を要求 → セーフ
- `next-auth` を **exact 指定** `5.0.0-beta.25` にしているため、consumer 側が `5.0.0-beta.30` を入れると衝突
- `drizzle-orm@0.36.x` 内のマイナーバージョンドリフトでも react-table 等が peer 違反を起こす

### 2. shadcn / Radix UI の Optional Peer

`@daiwajuki/ui-design` が依存する Radix UI コンポーネントは optional peer を多用する:
- `@radix-ui/react-popover` が `@radix-ui/react-portal` を peer 要求するが、片方だけ採用しているケース
- 採用側のプロジェクトごとに使う subpath が違うため、不要 peer に対する違反が発生

### 3. React 19 / Next.js 16 の早期採用

React 19 / Next.js 16 を採用しているプロジェクト（Portal / StridePlan 等）は、サードパーティの `peerDependencies` が `^18.0.0` のまま追従していないケースが多い。
- `@react-pdf/renderer` が `react@^18` を peer に要求するが React 19 でも実動作には問題なし
- npm strict mode では install が失敗する

## 過渡期に許容するルール

- 14 プロジェクトすべての `.npmrc` で **`legacy-peer-deps=true`** を有効化（Wave A `_auth/scripts/deploy-npmrc.mjs` で配布）
- `npm install` 時の peer 違反は警告のみ（CI を fail させない）
- ただし **本物の依存破綻**（実行時エラー / typecheck エラー）は無視しない
- 警告ログは PR レビューで目視確認、明らかに危険な組み合わせは個別対応

## 出口判定（Wave E ステップ 24、`_design-system@2.0.0` リリース時）

`_design-system` の v2 リリースは「主要 peer dep を見直す絶好のタイミング」。以下を実施:

### Step 1: 全プロジェクト dry-run

`_ci-templates` に集計スクリプトを用意済み:

```bash
# 全 active プロジェクトを巡回 (デフォルト 120s/project)
node scripts/show-legacy-peer-deps-status.mjs

# 結果を docs/peer-deps-status.md に書き出す (PR 添付用)
node scripts/show-legacy-peer-deps-status.mjs --write

# 部分実行
node scripts/show-legacy-peer-deps-status.mjs --projects=Portal,ICPCostHub --timeout=180
```

出力例:

```
Project                  Status  Exit  ERESOLVE  warns  Notes
─────────────────────────────────────────────────────────────────
Portal                   ✅ pass     0         0      0
ICPCostHub               ⚠️ warn     0         0      3
PayrollManager           ❌ fail     1         2      0
ICPSitePhotos            ⏭️ skip    —         —      —  no package.json
```

判定基準:
- **pass**: exit=0 + warn=0 → `.npmrc` から legacy 撤去 OK
- **warn**: exit=0 + warn>0 → 撤去可だが将来 `overrides` か peer 範囲拡張で警告ゼロを目指す
- **fail**: exit≠0 → 下の Step 3 の対応表に従って fix が必要

### Step 2: 通るプロジェクトから順次撤去

dry-run が通ったプロジェクトから、`.npmrc` の `legacy-peer-deps=true` を削除する PR を出す。各プロジェクトで:
1. `.npmrc` 編集
2. `rm -rf node_modules package-lock.json && npm install`
3. CI green を確認
4. PR merge

### Step 3: 通らないプロジェクトの fix

dry-run が落ちるプロジェクトは原因別に対応:

| 原因 | 対応 |
|---|---|
| `_auth` の peer 範囲が狭い | `_auth` の `peerDependencies` を見直し、新 MAJOR で範囲拡大 |
| `_design-system` の peer 範囲が狭い | 同上 |
| サードパーティ（React 19 等）の peer 範囲未追従 | `package.json` の `overrides` で peer 範囲を強制的に拡張、または該当パッケージを更新 |
| 採用側の dev dep が peer 違反 | dev dep を更新（typecheck エラーになるパッケージは除去） |

```json
// 採用側 package.json で peer 範囲を上書きする例
{
  "overrides": {
    "react": "$react",
    "react-dom": "$react-dom",
    "@react-pdf/renderer": {
      "react": "$react"
    }
  }
}
```

### Step 4: 完全撤去後の運用

- `_ci-templates/scripts/swap-deps-to-registry.mjs` の output で `legacy-peer-deps` を強要しない
- 新規プロジェクトの `.npmrc` テンプレからも削除
- `_auth/scripts/deploy-npmrc.mjs` も legacy-peer-deps なし版を配布

## トラブルシューティング

### `legacy-peer-deps=true` で動いていたが、`false` にしたら CI が落ちる

1. `npm install --no-legacy-peer-deps 2>&1 | grep ERESOLVE` で peer 違反詳細を確認
2. `_auth` / `_design-system` 側の peer 範囲拡張で解決できるか判断
3. 解決できないものは `overrides` フィールド or `legacy-peer-deps` 維持で対応

### Cloud Run build が `npm ci` で失敗する

- `npm ci` は `package-lock.json` を厳格にチェックする
- `.npmrc` の `legacy-peer-deps=true` を CI 側にも持ち込んでいるか確認
- 持ち込むには Dockerfile 内で `COPY .npmrc /app/.npmrc` する

### npm v10 で `peerDependenciesMeta` が無視される

- `peerDependenciesMeta.optional=true` は npm v10 では `legacy-peer-deps=true` と組み合わせると optional 化が効かないケースがある
- 既知のバグ ([#7264](https://github.com/npm/cli/issues/7264))、現時点では `legacy-peer-deps=true` で対処

## 関連文書

- governance-plan v3: `~/.claude/plans/github-sharded-platypus.md` 軸 1 / Wave E ステップ 24
- `_auth/scripts/deploy-npmrc.mjs` — `.npmrc` 配布スクリプト
- `_auth/docs/versioning.md` — peer dependency 整合性ルール
- `_design-system/docs/versioning.md` — カラー hex 判定との対比

## 履歴

- 2026-05-22 初版（governance-plan v3 Wave A の `.npmrc` 配布と同時に作成）
