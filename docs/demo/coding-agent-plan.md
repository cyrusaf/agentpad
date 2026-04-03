# Checkout Refactor Plan

## Goal

Ship the new checkout reconciliation flow behind a feature flag, with metrics that make rollout safe for the on-call engineer.
Success metric: keep p95 reconciliation lag under 5 minutes and failed reconciliations under 0.5% during rollout. Roll back if lag exceeds 15 minutes or failures exceed 2% for 10 consecutive minutes.
## Steps

1. Add API contract tests around the new reconciliation endpoint.
2. Move reconciliation writes behind the job runner instead of the legacy cron path.
3. Backfill the last 30 days of events before flipping traffic.
4. Add rollout dashboards and alert thresholds before enabling the flag by default.

## Risks

- The backfill may overload the read replica during peak traffic.
- Noisy alerts could hide real regressions during rollout.

## Questions

- Should the coding agent split migration and cleanup into separate PRs?
- Do we want a kill switch in the admin UI before rollout?
