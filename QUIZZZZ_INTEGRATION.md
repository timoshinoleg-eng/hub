# Hub + Quizzzz: phase-1 integration

This branch replaces the small local Hub quiz with the full Quizzzz product while keeping the two codebases operationally independent.

## User-facing topology

One MAX Mini App origin:

- `/` — Hub arcade shell
- `/quiz/` — full Quizzzz React Mini App
- `/api/v1/` — Quizzzz FastAPI

The Hub `quiz` card remains part of the seven-game catalogue but its legacy `games/quiz/index.html` only performs a top-window handoff to `/quiz/`. Quizzzz must not be embedded inside the Hub iframe because it owns MAX authentication, server-authoritative rounds, XP, league and duels.

## Product ownership

Hub owns the six arcade games, arcade local records and the arcade Daily rotation (Sapper, Echo, Memory).

Quizzzz owns Quick Game, Quiz Daily, question packs, PostgreSQL user state, XP, achievements, league and duels.

Phase 1 deliberately keeps arcade progression separate from Quizzzz progression. There is no client-side write into Quizzzz XP/streak data.

## Production bot

The existing Quizzzz MAX bot remains the single production bot/webhook owner. The Hub Node bot must be disabled in the unified deployment and must never run with the same production `BOT_TOKEN`.

The existing Quizzzz bot Mini App URL is changed to the unified Hub root only after staging smoke passes.

If Telegram is enabled, it must use its own `TELEGRAM_MINI_APP_URL` pointing to Quizzzz (`/quiz/` or the existing standalone Quizzzz URL). Telegram must not inherit the MAX Hub root by accident.

## Legacy Quizzzz launch intents

Once the existing MAX bot points to Hub, historical Quizzzz deep links also arrive at `/`. Hub therefore routes the established Quizzzz namespace before `main.js` boots:

- `daily`
- `league` / `leaderboard`
- `challenge_new`
- `d_<opaque duel token>`
- `challenge_<legacy code>`

The compatibility router preserves the original payload and redirects to:

```text
/quiz/?from=hub&startapp=<payload>
```

Arcade deep links keep their separate `g<game>[_s<score>]` format and stay in Hub.

## Paired Quizzzz branch

The corresponding Quizzzz work is developed in:

`feat/hub-integration`

It adds a configurable Vite base path. Unified builds use `VITE_BASE_PATH=/quiz/`; standalone Quizzzz keeps `/` as the default.

The paired repository also owns the fail-closed staging package and the detailed `docs/UNIFIED_STAGING_ROLLOUT.md` runbook. Staging does not change the production MAX Mini App URL or webhook.

## Gateway requirements

The gateway must route Hub static assets before the Quizzzz prefix and strip `/quiz` before proxying to a Quizzzz service that serves its SPA at `/`.

```text
/                  -> Hub
/css/*             -> Hub
/js/*              -> Hub
/games/*           -> Hub
/assets/icons.svg  -> Hub
/quiz/*            -> Quizzzz frontend (strip /quiz upstream)
/api/v1/*          -> Quizzzz FastAPI
/share/*           -> Quizzzz share pages
/webhooks/max      -> Quizzzz FastAPI/MAX webhook
```

### FastAPI docs surface decision (explicit)

Historical standalone Caddy proxied unmatched routes to FastAPI, so FastAPI defaults `/docs`, `/redoc`, `/openapi.json` were publicly reachable.

Unified gateway explicitly enumerates Quizzzz backend ownership for `/api/*`, `/share/*`, `/health`, `/ready`, `/webhooks/max`, `/telegram/webhook` and sends everything else to Hub SPA. Therefore FastAPI docs change their public behavior.

**Decision (production minimal surface):** FastAPI docs are considered internal/non-public and must be disabled in production. The gateway must NOT expose `/docs`, `/redoc`, `/openapi.json` to public internet. Production FastAPI should be instantiated with `docs_url=None, redoc_url=None, openapi_url=None` or equivalent, and gateway must not route those paths to backend.

Rationale: minimal public surface, avoids exposing internal schema, aligns with existing production hardening (no public introspection). For local development, docs may remain enabled via ENV=development.

This decision is locked by `tools/gateway-docs.mjs` and by Quizzzz-side contract `tests/test_gateway_docs.py` (or equivalent) plus documentation in `docs/UNIFIED_STAGING_ROLLOUT.md`.

If operational needs change to require public docs, the decision must be revisited explicitly with security review and gateway allowlist update, not by accidental Caddy catch-all.

## Runtime configuration

`runtime-config.js` is deployment-owned public metadata. The paired Quizzzz unified compose stack runs a one-shot `hub-config` service before Caddy starts; it writes the bot username and other public Hub settings into the exact `HUB_ROOT` release directory.

Bot tokens and other secrets must never be written to Hub static files.

Prefer an immutable Hub release directory such as `/opt/hub/releases/<git-sha>` and switch the active release only after smoke succeeds.

`HUB_TRACK_ENDPOINT` is optional in phase 1. When it is absent, Hub gameplay events remain local and the UI suppresses the remote-notification subscription CTA instead of offering a flow that cannot succeed. A Hub analytics/subscription backend can be introduced separately after the unified product is stable.

## Rollback

No database migration is required. Roll back by restoring the bot Mini App URL to the standalone Quizzzz endpoint. Existing Quizzzz users, XP, streaks and duel history stay in the same PostgreSQL database.

## Phase 2 after rollout

Only after unified smoke and real usage data:

- direct Hub Daily -> Quizzzz Daily intent;
- unified profile surface;
- server-side arcade XP contract;
- combined retention model if privacy and product semantics remain clear.
