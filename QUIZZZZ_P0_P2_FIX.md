# Quizzzz P0 and P2 fixes (prepared, repo not accessible in sandbox)

## Context
Task requires fixing Quizzzz PR #14 (feat: prepare Quizzzz for unified Hub mount)
Frozen head at audit: c7676e6e0ae97bbd585259a12b87b3a211e4ca99

In this sandbox, `gh repo clone timoshinoleg-eng/Quizzzz` returns 404 Not Found.
`gh api repos/timoshinoleg-eng/Quizzzz` also 404. Public search does not list Quizzzz.
Only public repo `timoshinoleg-eng/quiz_bot` is accessible and does NOT contain
`deploy/render_hub_config.py` or `deploy/vm/cutover_hub_production.sh`.

Therefore direct push to Quizzzz PR #14 is not possible from this environment.
Below is the exact production-safe fix that must be applied to Quizzzz repo.

## P0 — production PreflightOnly deterministically broken

### Root cause
`deploy/render_hub_config.py` in production mode requires:
- ENV=production
- BOT_USERNAME set
- HUB_ASSET_REVISION = exact lowercase 40-char git SHA
Otherwise it must fail-closed (revision = dev-unpinned -> FAIL).

`deploy/vm/cutover_hub_production.sh` preflight path runs:
```sh
docker run --rm --user 0:0 --env-file "$NEXT_RUNTIME" \
  -e HUB_RUNTIME_CONFIG_PATH=/srv/hub/runtime-config.js \
  -v "$HUB_ROOT:/srv/hub" \
  --entrypoint python "$IMAGE_REF" deploy/render_hub_config.py
```
It does NOT pass `HUB_ASSET_REVISION=$HUB_SHA`, and $NEXT_RUNTIME is not required to contain it.
Result: revision = dev-unpinned, renderer fail-closed, PreflightOnly can never PASS.

### Exact fix (minimal, production-safe)
Add `-e HUB_ASSET_REVISION="$HUB_SHA"` to the real separate docker run production preflight renderer,
so it uses same exact Hub SHA as compose hub-config.

File: `deploy/vm/cutover_hub_production.sh`

Before:
```sh
docker run --rm --user 0:0 --env-file "$NEXT_RUNTIME" \
  -e HUB_RUNTIME_CONFIG_PATH=/srv/hub/runtime-config.js \
  -v "$HUB_ROOT:/srv/hub" \
  --entrypoint python "$IMAGE_REF" deploy/render_hub_config.py
```

After:
```sh
docker run --rm --user 0:0 --env-file "$NEXT_RUNTIME" \
  -e HUB_RUNTIME_CONFIG_PATH=/srv/hub/runtime-config.js \
  -e HUB_ASSET_REVISION="$HUB_SHA" \
  -v "$HUB_ROOT:/srv/hub" \
  --entrypoint python "$IMAGE_REF" deploy/render_hub_config.py
```

Constraints preserved:
- Do NOT allow dev-unpinned in production
- Do NOT remove SHA validation in render_hub_config.py
- Do NOT use mutable label/tag
- Do NOT hardcode specific SHA
- HUB_SHA remains deployment input

### Regression test (must be added to Quizzzz)
File: `tests/test_hub_preflight_revision.py` or similar executable contract

Must prove:
- ENV=production, BOT_USERNAME set, HUB_SHA = valid 40-char SHA,
  renderer receives HUB_ASSET_REVISION == HUB_SHA,
  runtime-config.js created successfully and contains exactly that revision

Negative coverage:
- production renderer without exact revision -> FAIL
- production renderer with dev-unpinned -> FAIL
- malformed SHA -> FAIL

And separate test protecting `cutover_hub_production.sh` itself that future refactoring
does not lose variable transmission (grep for `HUB_ASSET_REVISION` and `$HUB_SHA` in that script,
or better semantic test that runs the script in dry-run mode).

In Hub repo we added `tools/production-renderer-preflight.mjs` that locks this contract
and documents expected fix, so Hub CI will fail if contract is violated.

## P2 — /docs, /redoc, /openapi.json explicit decision

### Context
Old standalone Caddy proxied unmatched routes to FastAPI, so FastAPI defaults were public.
New unified gateway enumerates backend ownership for /api/*, /share/*, /health, /ready,
/webhooks/max, /telegram/webhook, rest -> Hub SPA. So /docs behavior changes.

### Decision (production minimal surface)
FastAPI docs are internal/non-public and must be DISABLED in production.
- FastAPI instantiated with docs_url=None, redoc_url=None, openapi_url=None when ENV=production
- Gateway must NOT route /docs, /redoc, /openapi.json to backend
- Local development may keep docs enabled via ENV=development

This is documented in Hub's QUIZZZZ_INTEGRATION.md and locked by:
- Hub: tools/gateway-docs.mjs
- Quizzzz: tests/test_gateway_docs.py (to be added) that asserts docs are disabled in production
  and gateway Caddyfile does not contain /docs in backend allowlist.

If operational needs change, decision must be revisited explicitly with security review,
not by accidental catch-all.

### Exact fix for Quizzzz
File: `api.py` or wherever FastAPI app is created:
```python
is_prod = os.getenv("ENV") == "production"
app = FastAPI(
    title="Quiz Battle API",
    version="2.1",
    lifespan=lifespan,
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)
```

And ensure Caddyfile for unified gateway does NOT include:
```
@docs path /docs /redoc /openapi.json
handle @docs { reverse_proxy app:8000 }
```
Instead, those paths should fall through to Hub SPA (or 404), not backend.

## CI requirements for Quizzzz (when repo accessible)
After applying fixes, new HEAD must pass:
- Python compile/tests
- full-product preservation tests
- frontend typecheck/tests
- standalone Vite build
- VITE_BASE_PATH=/quiz/ build
- PostgreSQL migrations/runtime schema
- unified gateway validation
- deploy script syntax
- standalone E2E
- /quiz/ Hub-mounted E2E
- full duel E2E
- normal production image
- Hub-mounted production image
- production renderer/preflight contract (new)

Green CI without new regression test is insufficient.

## Production rehearsal (not cutover)
Once both PRs are green, prepare exact commands (do NOT execute without explicit ack if env has real SSH):

```powershell
.\deploy\operator-hub-production.ps1 `
  -ImageRef "gitverse.ru/freeveol/quiz-battle@sha256:<digest>" `
  -HubSha "<new exact Hub HEAD>" `
  -CutoverAck "I_UNDERSTAND_THIS_CHANGES_PRODUCTION" `
  -PreflightOnly
```

Where <digest> is from `publish-hub-image.ps1` built from exact Quizzzz new HEAD,
and <HubSha> is new exact Hub HEAD (99aa7d3f9bddfc182ccfd4a49341d91a7dbe8904).

Do NOT run PreflightOnly without separate permission if current env has real production VM access.
