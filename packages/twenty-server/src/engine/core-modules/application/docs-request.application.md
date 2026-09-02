# Docs Request: application

Pending cache maintenance requests for `docs.application.md`. Each entry captures research already performed by the orchestrator. Resolve with `/ACTION--dx-orchestrator -resolve`.

---

## Entry — 2026-08-13T09:30:00Z

**Status:** MISSING
**Target:** `twenty/core/packages/twenty-server/src/engine/core-modules/application/docs.application.md`
**Reason:** No cache exists for the server application module; researched to answer "foolproof installed-app-version verification."
**Commit at research time:** `228158a`

### Sources read

| File | Commit | Lines |
|------|--------|-------|
| `.../application/application.entity.ts` | `228158a` | 32-76 |
| `.../application/dtos/application.dto.ts` | `228158a` | 22-55 |
| `.../application/application-install/application-install.resolver.ts` | `228158a` | 52-58 |
| `.../application/application-install/application-install.service.ts` | `228158a` | 280-400 |
| `.../application/application-manifest/application-sync.service.ts` | `228158a` | 125-255 |
| `.../application/application-package/application-version-validation.service.ts` | `228158a` | full |

### Proposed updates

Create `docs.application.md` covering the app install/version lifecycle. Suggested chunks:

- **APP00001 — entity** — `application.entity.ts`: `core.application` table; `version: string | null` column (`:75-76`, TODO not-nullable); universalIdentifier, workspaceId, sourceType, deletedAt.
- **APP00002 — install/upgrade + version write** — `application-sync.service.ts:245-254` writes `version: packageJson.version` from the app's workspace-storage `dependencies/package.json`; `application-install.service.ts:307-334` `validateVersionProgression` semver gate; note LOCAL sourceType cross-workspace auto-install skip.
- **APP00003 — publish-time version guard** — `application-version-validation.service.ts`: rejects publish not strictly newer than registry (used by `scripts/publish-app.sh`, `scripts/app-publisher-entrypoint.sh`).
- **APP00004 — query surface** — `application.dto.ts:48-51` `@Field version?`; `application-install.resolver.ts:52-58` `findManyApplications` `@Query([ApplicationDTO])` guarded by `SettingsPermissionGuard(APPLICATIONS)`. Consumed by `tests/smoke-test/utils/metadata-client.ts:74-81`.

Note for doc-meta: vendored twenty/core doc — anchor `doc-meta.commit` to the core HEAD commit per repo chunking convention.

---
