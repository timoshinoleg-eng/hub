# Superseded release handoff

This file is retained only to explain the history of the release-candidate branch.

An earlier coding-agent session could access Hub PR #7 but could not access the paired private Quizzzz PR #14. Its report therefore incorrectly described the Quizzzz P0/P2 work as a manual follow-up and embedded intermediate Hub SHAs that became stale as soon as further fixes were committed.

That limitation no longer applies. The paired Quizzzz branch `feat/hub-integration` has since been updated directly, including:

- production preflight propagation of `HUB_ASSET_REVISION="$HUB_SHA"`;
- executable production renderer regression coverage;
- an explicit unified-production decision for `/docs`, `/redoc`, and `/openapi.json`;
- executable gateway docs-surface coverage.

The Hub branch also contains the full MAX nested-module cache fix and client-side notification fail-closed gating.

Do not use SHA values or release verdicts from the historical content that previously lived in this file. The authoritative state is always the current GitHub PR metadata and exact-head CI for:

- Hub PR #7 — `fix/unified-hub-release-candidate`;
- Quizzzz PR #14 — `feat/hub-integration`.

Neither PR should be merged or promoted until both exact heads are green and a fresh independent audit reports `READY FOR PREFLIGHT`. Production `PreflightOnly` and any live cutover remain separate, explicitly authorized operations.
