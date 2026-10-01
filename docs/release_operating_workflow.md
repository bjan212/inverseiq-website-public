# Xrypt Release Operating Workflow

This workflow reduces repeated publish interruptions while preserving explicit control over production and live financial actions.

## Release batching

Non-sensitive changes that belong to one objective are grouped into a single release batch. A batch includes implementation, migrations, documentation, focused regression tests, TypeScript validation, production build, UI verification when applicable, and a diff audit. Intermediate checkpoints are reserved for recovery after risky refactors; only the final verified checkpoint is presented for publishing.

## Approval boundaries

The production **Publish** action remains user-controlled. Credentials, destructive data changes, and live trading actions require their own explicit approvals. Publishing code does not authorize starting the Auto Trader, placing an order, modifying protection, closing a position, or changing exchange balances.

## Automatic continuation after deployment

After deployment confirmation arrives, work continues without an additional prompt through these read-only and non-sensitive steps:

1. Confirm the deployed checkpoint and production process startup.
2. Inspect runtime logs for startup, schema, routing, and feature-specific errors.
3. Query only aggregate or configuration state needed to verify the release; do not alter user data.
4. Load affected production routes and verify visible status and controls.
5. For exchange-related releases, perform public/read-only account checks only when needed.
6. Record findings and continue remaining code, test, documentation, or monitoring work.

Work pauses only when another publish is required, user input is genuinely necessary, or an action crosses a credential, destructive-data, or live-financial boundary.

## Release checklist contract

Every release batch must update `release_checklist.md` with the batch objective, changed surfaces, tests, schema status, user-controlled approval, post-publish checks, and any outcome-dependent items. This provides an auditable boundary between automatically continued verification and actions that still require user approval.
