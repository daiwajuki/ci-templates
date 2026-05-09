# ci-fastapi.yml 利用ガイド

FastAPI / Python プロジェクトの CI（Python セットアップ → 依存インストール → ruff/mypy → pytest）を Reusable Workflow として提供する。

## 基本的な使い方

```yaml
# .github/workflows/test.yml
name: test
on:
  push:
    branches: [main]
  pull_request:

jobs:
  server:
    uses: daiwajuki/ci-templates/.github/workflows/ci-fastapi.yml@v0
    with:
      working-directory: server-py
```

## inputs 一覧

| input | 型 | デフォルト | 説明 |
|---|---|---|---|
| `python-version` | string | `'3.12'` | Python バージョン |
| `working-directory` | string | `'.'` | Python プロジェクトルート |
| `package-manager` | string | `'uv'` | `uv` / `poetry` / `pip` のいずれか |
| `install-command` | string | `''` | デフォルトのインストール処理を上書きする任意コマンド |
| `extra-test-deps` | string | `'pytest pytest-asyncio pytest-cov'` | uv/pip モード時の追加依存 |
| `test-command` | string | `'pytest tests/ -v'` | テスト実行コマンド（`python -m` 経由で実行） |
| `run-tests` | boolean | `true` | テストを実行するか |
| `run-ruff` | boolean | `false` | `ruff check .` を実行 |
| `run-mypy` | boolean | `false` | `mypy .` を実行 |

## BidFlow の `test.yml` に組み込む例

server-py / scraper を別ジョブで並列実行（scraper は特定テストを除外）：

```yaml
name: test
on:
  push: { branches: [master] }
  pull_request:

jobs:
  test-web:
    uses: daiwajuki/ci-templates/.github/workflows/ci-next.yml@v0
    with:
      working-directory: web

  test-server-py:
    uses: daiwajuki/ci-templates/.github/workflows/ci-fastapi.yml@v0
    with:
      working-directory: server-py

  test-scraper:
    uses: daiwajuki/ci-templates/.github/workflows/ci-fastapi.yml@v0
    with:
      working-directory: scraper
      test-command: 'pytest tests/ -v -k "not test_ai_sites_in_yaml"'
```

## パッケージマネージャ別の動作

### uv（デフォルト）
```
uv venv
uv pip install -e .
uv pip install <extra-test-deps>
.venv/bin/python -m <test-command>
```

### poetry
```
poetry install --with dev
poetry run python -m <test-command>
```

### pip
```
python -m venv .venv
.venv/bin/pip install -e .
.venv/bin/pip install <extra-test-deps>
.venv/bin/python -m <test-command>
```

## トラブルシューティング

| 症状 | 原因 | 解決 |
|---|---|---|
| `pytest: command not found` | extra-test-deps 未設定 | `extra-test-deps: 'pytest pytest-asyncio'` を明示 |
| poetry の dev グループが未反映 | `[tool.poetry.group.dev]` 未定義 | `pyproject.toml` の dev グループを確認 |
| 特定テストだけ落ちる | 既存課題を CI から除外したい | `test-command` で `-k "not <name>"` を指定 |
