# FastAPI Dockerfile Templates

`@daiwajuki/ci-templates` の FastAPI 用 Dockerfile テンプレート。
**copy 配布** — `node sync-templates.mjs --target=dockerfile --stack=fastapi --variant=<uv|poetry>` で取得。

## variant

| ファイル | manager | ベース | 用途 |
|---|---|---|---|
| `Dockerfile.uv`     | uv (Astral) | `python:3.12-slim` | **推奨**。新規プロジェクトはこちら |
| `Dockerfile.poetry` | Poetry      | `python:3.12-slim` | 既存 Poetry プロジェクトの移行コスト削減用 |

## 前提

- `pyproject.toml` を持つ
- uv: `uv.lock` がある（`uv lock` で生成）
- Poetry: `poetry.lock` がある（`poetry lock` で生成）
- アプリのエントリポイントは `app/main.py` の `app` (ASGI)
- health endpoint: `/health`（無ければ Dockerfile の HEALTHCHECK を削除 or アプリに追加）

## カスタマイズポイント

`# CUSTOMIZE:` 箇所:

1. **`COPY app/`** — エントリポイントのディレクトリが違う場合（例: `src/`, `server/`）
2. **静的アセット** — `assets/`, `templates/` 等を含める場合
3. **build deps** — `build-essential` が必要な C 拡張がある場合
4. **runtime deps** — `fonts-noto-cjk`、`playwright` 等の OS パッケージ
5. **HEALTHCHECK** — health endpoint が `/health` でない場合

## 既存採用パターンとの差分

| 採用元 | テンプレとの差分 | 対応 |
|---|---|---|
| ICPForms | 1-stage、`python:3.14-slim`、`UV_LINK_MODE=copy` | テンプレで `python:3.12` 採用（Cloud Run buildpack の安定性優先）。3.14 が必要な場合は base の version 行のみ変更 |
| BuildDeck | `pip install uv`（小サイズ） | `ghcr.io/astral-sh/uv` から取る方が高速。BuildDeck パターンに戻したければ `COPY --from=ghcr...` を `RUN pip install uv` に置換 |
| BidFlow   | poetry + playwright + 日本語 CJK フォント | `Dockerfile.poetry` を base に、CUSTOMIZE 箇所の playwright 行を有効化 |

## 関連

- 使い方: [../../docs/usage-sync-templates.md](../../docs/usage-sync-templates.md)
