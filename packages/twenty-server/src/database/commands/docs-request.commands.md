# Docs Request: commands

Pending cache maintenance requests for `docs.commands.md`. Each entry captures research already performed by the orchestrator. Resolve with `/ACTION--dx-orchestrator -resolve`.

---

## Entry — 2026-09-29T00:00:00Z

**Status:** MISSING
**Target:** `twenty/core/packages/twenty-server/src/database/commands/docs.commands.md`
**Reason:** No cache exists. This is the core gap for auto-updating all workspaces.
**Commit at research time:** `42a192d6f9` (twenty/core)

### Sources read

| File | Commit | Lines |
|------|--------|-------|
| `install-pre-installed-apps.command.ts` | 42a192d6f9 | 1-41 |
| `upgrade-version-command/upgrade.command.ts` | 42a192d6f9 | 1-150 |
| `create-demo-workspace.command.ts` | 42a192d6f9 | 18-171 |
| `../../../../twenty-docker/twenty/entrypoint.sh` | 42a192d6f9 | 1-66 |
| `engine/core-modules/application/application-upgrade/application-upgrade.service.ts` | 42a192d6f9 | 30-237 |
| `engine/core-modules/application/application-registration/application-tarball.service.ts` | 42a192d6f9 | 100-150 |
| `engine/core-modules/application/application-install/application-install.service.ts` | 42a192d6f9 | 250-340, 711-734 |
| `engine/core-modules/admin-panel/admin-panel.resolver.ts` | 42a192d6f9 | 565-580 |

### dx-find output

COVERAGE GAP: no docs cache covers `database/commands`.

### Proposed updates

Create `docs.commands.md` with these chunks:
- **upgrade.** Runs on every server boot from entrypoint.sh:19-29 (cache:flush → upgrade → cache:flush), on the server only. It runs upstream versioned commands; no appraisal command exists. Failures only print a warning.
- **install-pre-installed-apps.** Would upgrade existing installs to a higher version (application-install.service.ts:313-331). Not invoked anywhere.
- **create-demo-workspace.** Skips any workspace that already exists (:124-130).
- **App auto-upgrade.** Publishing queues a job (tarball.service:137-142) that filters on `autoUpgrade=true` (upgrade.service:136). The column defaults to false and is never set (install.service:724-732). The admin mutation `upgradeRegistrationApplications` (resolver:567-580) ignores the flag.
- **Template.** The `2-10-…-sync-call-recording-standard-objects.command.ts` @RegisteredWorkspaceCommand is the model for an appraisal schema-sync command.
