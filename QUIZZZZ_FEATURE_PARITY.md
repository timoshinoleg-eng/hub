# Quizzzz feature-parity release contract

The Hub integration must preserve the full existing Quizzzz product. Quizzzz is not copied into a reduced local Hub game: the complete React Mini App and authoritative FastAPI/PostgreSQL backend remain mounted under `/quiz/`.

Required preserved user functionality:

- MAX and Telegram authentication/session support;
- Quick Game;
- server-authoritative Quiz Daily and replay/result handling;
- quiz packs and catalogue/categories;
- timed questions, answer feedback/explanations and question reporting;
- profile level, XP and streak;
- mastery/progress and achievements;
- weekly missions;
- weekly league and leaderboard;
- new real-time duel flow: create, invite, join, ready/countdown, play, result, leave and rematch;
- legacy challenge compatibility;
- historical MAX intents: `daily`, `league`, `leaderboard`, `challenge_new`, `d_*`, `challenge_*`;
- sharing/deep links;
- existing PostgreSQL user/game/XP/streak/league/duel data;
- existing MAX bot token, webhook and production bot ownership.

Release is NO-GO if unified Hub deployment replaces any of those surfaces with the old lightweight `games/quiz` implementation, starts a second production MAX bot consumer, changes authoritative Quizzzz progression semantics, or loses access to existing Quizzzz data.

The paired `Quizzzz` branch carries executable tests that lock this feature surface during `/quiz/` mounting. Hub owns navigation into that full product, not its internal progression state.
