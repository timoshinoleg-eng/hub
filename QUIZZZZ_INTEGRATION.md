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

## Paired Quizzzz branch

The corresponding Quizzzz work is developed in:

`feat/hub-integration`

It adds a configurable Vite base path. Unified builds use `VITE_BASE_PATH=/quiz/`; standalone Quizzzz keeps `/` as the default.

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
/webhooks/max      -> Quizzzz FastAPI/MAX webhook
```

## Rollback

No database migration is required. Roll back by restoring the bot Mini App URL to the standalone Quizzzz endpoint. Existing Quizzzz users, XP, streaks and duel history stay in the same PostgreSQL database.

## Phase 2 after rollout

Only after unified smoke and real usage data:

- direct Hub Daily -> Quizzzz Daily intent;
- unified profile surface;
- server-side arcade XP contract;
- combined retention model if privacy and product semantics remain clear.
