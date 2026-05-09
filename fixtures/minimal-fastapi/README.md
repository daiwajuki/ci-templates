# minimal-fastapi-fixture

`ci-fastapi.yml` self-test 用の最小フィクスチャ。

実コード・実依存はなし。`install-command: 'true'` で install をスキップし、Python setup
ステップ自体が壊れていないことだけを検証する。ruff / mypy / tests も全て OFF。

将来、ruff / mypy / tests のステップ単体を本物として動かしたければ:
- `pyproject.toml` を追加（hatchling or setuptools backend）
- `install-command` を空に戻す
- 必要なツール（ruff 等）を `extra-test-deps` で渡す
