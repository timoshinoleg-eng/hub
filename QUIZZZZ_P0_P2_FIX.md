# Quizzzz P0/P2 resolution

This file supersedes the earlier sandbox-only handoff. The paired Quizzzz repository is now accessible and the release blockers were applied directly to PR #14 (`feat/hub-integration`).

## P0 — production `PreflightOnly` Hub revision

### Root cause

`deploy/render_hub_config.py` correctly fails closed in production unless `HUB_ASSET_REVISION` is an exact lowercase 40-character Git SHA. The standalone production preflight renderer in `deploy/vm/cutover_hub_production.sh` previously supplied `HUB_RUNTIME_CONFIG_PATH` but omitted the revision, causing the renderer to fall back to `dev-unpinned` and fail before a rehearsal could pass.

### Applied fix

The real production renderer invocation now passes:

```sh
-e HUB_ASSET_REVISION="$HUB_SHA"
```

`HUB_SHA` remains an immutable deployment input. The renderer validation was not weakened and no release SHA is hard-coded.

### Regression coverage

Quizzzz now contains `tests/test_hub_production_renderer_contract.py`, which executes the renderer in production mode and proves:

- a valid exact 40-character SHA succeeds and is written into `runtime-config.js`;
- missing revision fails;
- `dev-unpinned` fails;
- malformed/short/uppercase revisions fail;
- the real cutover shell passes `$HUB_SHA` as `HUB_ASSET_REVISION` to the renderer.

## P2 — FastAPI docs surface

Historical standalone routing exposed FastAPI defaults `/docs`, `/redoc`, and `/openapi.json` through a catch-all proxy. Unified production now makes the change explicit instead of letting these paths accidentally fall through to the Hub SPA.

### Applied decision

The unified public origin treats FastAPI docs as **internal/non-public**. The paired Quizzzz `deploy/Caddyfile.hub` explicitly matches:

```text
/docs
/redoc
/openapi.json
```

and returns HTTP 404 before the Hub SPA fallback. The private FastAPI service may retain its default docs for local/service-level diagnostics; they are not exposed on the unified public origin.

Quizzzz locks this with `tests/test_gateway_docs_contract.py` and `docs/HUB_INTEGRATION.md`. Hub locks the cross-repository decision with `tools/gateway-docs.mjs` and `QUIZZZZ_INTEGRATION.md`.

## Remaining release gate

Neither repository has been merged and no production mutation has been performed. After exact-head CI is green on both PRs, the next allowed step is to build the exact Quizzzz candidate image, record its immutable registry digest, and run `operator-hub-production.ps1 -PreflightOnly` only with explicit authorization.
