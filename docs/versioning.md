# バージョニング運用ガイド

## semver 規則

| バージョン | 条件 | 採用側のアクション |
|---|---|---|
| **MAJOR** | reusable workflow の `inputs` / `secrets` 削除・型変更、composite action の必須 inputs 追加、base image のメジャー変更（Node 20→22 等） | コード修正必須（タグを `@vN` から `@vN+1` に上げる前提で対応） |
| **MINOR** | 新規 workflow / composite action 追加、optional inputs 追加、Dockerfile テンプレート追加 | 不要（任意で新機能を使う） |
| **PATCH** | バグ修正、依存 action のバージョン上げ（破壊なし）、ドキュメント修正 | 不要（黙って動く） |

## `v0.x` の間（特例）

`v0.x` は**破壊変更を MINOR で行うことがある**（MAJOR を `0` に固定しているため）。

ただし以下の **PATCH ルールは v0.x でも厳格に守る**:

- **PATCH (`0.x.Y`) には Breaking Change を含めない**。呼び出し側の YAML / `secrets:` ブロック / `with:` の input 名・型に変更を強いる修正は **必ず MINOR に上げる**
- 例外なし。「軽微なリネームだから patch」も NG
- 過去事例: `0.4.1` で `colocate-token` → `COLOCATE_TOKEN` の secret リネームを PATCH に含めた結果、`@v0` 採用側の CI が壊れた → このルールの根拠

### Breaking を含む MINOR の出し方

CHANGELOG に **`### Breaking change` セクションを必須記載**し、移行 before/after を含める：

```markdown
## [0.5.0] - 2026-XX-XX

### Breaking change

呼び出し側の `secrets:` ブロックを以下のように更新する必要あり:

\`\`\`yaml
# Before
secrets:
  old-name: ${{ secrets.X }}

# After
secrets:
  NEW_NAME: ${{ secrets.X }}
\`\`\`
```

### 採用側の運用

- `@v0` floating tag を引いている呼び出し側は **MINOR 更新時に CHANGELOG を必ず確認**する
- 確認の機械化は Phase F の `audit-ci-drift.mjs`（採用側で `@v0` の解決先 SHA が変わった日に notify）で対応予定
- それまでは `_ci-templates` の GitHub Releases を Watch しておくのが最も確実

## `v1.0.0` 以降

上記 PATCH ルールに加え、**MINOR からも Breaking を排除**する（標準 semver）。Breaking は MAJOR `vN` → `vN+1` で行う。

## git タグ戦略

```bash
# リリース時
git tag v0.1.0
git tag -f v0   # floating major タグを更新

# v1.0.0 以降
git tag v1.0.0
git tag -f v1
git push origin v1.0.0
git push origin v1 --force
```

各プロジェクトの `uses:` では floating major タグを参照する：

```yaml
uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v1
```

これにより **PATCH / MINOR は全プロジェクトに自動波及**し、MAJOR はタグを上げる明示的な操作が必要になる。

## CHANGELOG

`CHANGELOG.md` は [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) 形式で管理する。  
Breaking Change には `### Breaking` セクションを必ず追加する。

## プロジェクト側での追従

MAJOR バージョンアップ時は `audit-ci-drift.mjs`（Phase C 以降）が全プロジェクトのドリフトを検出する。  
それまでは `_ci-templates` の CHANGELOG を確認し、各プロジェクトの `uses: @vN` のタグを手動更新する。
