---
chunking: DOC
doc-meta:
  commit: b91c2a6457 (twenty/core nested repo HEAD; working tree DIRTY — appraisal
    standard-object edits are uncommitted, verified by direct read 2026-08-03)
sources:
  - file: ../../../../twenty-shared/src/metadata/constants/standard-object.constant.ts
    prefix: SOC
    type: raw
  - file: ../../../../twenty-shared/src/metadata/constants/standard-object-universal-identifiers.constant.ts
    prefix: SOUID
    type: raw
  - file: twenty-standard-application/services/twenty-standard-application.service.ts
    prefix: TSA
    type: raw
  - file: workspace-manager.service.ts
    prefix: WMS
    type: raw
  - file: twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant.ts
    prefix: MAPS
    type: raw
  - file: twenty-standard-application/utils/object-metadata/create-standard-flat-object-metadata.util.ts
    prefix: OBJ
    type: raw
  - file: twenty-standard-application/utils/field-metadata/build-standard-flat-field-metadata-maps.util.ts
    prefix: BLDF
    type: raw
  - file: twenty-standard-application/utils/field-metadata/compute-report-standard-flat-field-metadata.util.ts
    prefix: RPT
    type: raw
  - file: twenty-standard-application/utils/field-metadata/compute-appraisal-standard-flat-field-metadata.util.ts
    prefix: APR
    type: raw
  - file: twenty-standard-application/utils/field-metadata/create-standard-relation-field-flat-metadata.util.ts
    prefix: REL
    type: raw
  - file: twenty-standard-application/constants/search-fields-by-standard-object-name.constant.ts
    prefix: SRCH
    type: raw
  - file: twenty-standard-application/constants/standard-navigation-menu-item.constant.ts
    prefix: NAV
    type: raw
  - file: ../../database/commands/upgrade-version-command/2-10/2-10-workspace-command-1799000055000-sync-call-recording-standard-objects.command.ts
    prefix: UPG
    type: raw
---

# twenty-standard-application — code-defined standard objects seeded into every new workspace

<!--DOC00001:init-->
## Overview — two mechanisms, only one seeds new workspaces

Covers the `twenty-standard-application/` directory: the fork's **Twenty
Standard Application**, the set of Standard (protected/immutable) objects —
including the appraisal domain objects `appraisal`, `property`, `compsearch`,
`comparable`, `report` — that every **newly created workspace** receives
automatically. Full research synthesis:
`__Tasks/02_open/task-260731_0926-sync-select-report-to-twenty-crm/research/RES-workspace-seed-new-standard-objects.md`.

Objects can reach a workspace two ways:

| | Standard-Application (this dir, code) | Metadata REST API (e.g. /twenty-manager) |
|---|---|---|
| Where defined | `STANDARD_OBJECTS` (twenty-shared) + builder utils here | API calls against ONE running workspace |
| Object class | **Standard** (protected/immutable) | **Custom** |
| New workspaces | **Auto-included** at `createWorkspace` | Not included |
| Existing workspaces | Only via an upgrade command or reseed | Immediate |
| Docker rebuild needed | No — TS source; server restart/HMR suffices | No |

Editing this code is the ONLY path that makes new workspaces ship with an
object. API-created Custom objects live only in the workspace they were created
in and will diverge/collide with same-named Standard objects once those ship —
prototype via API, then codify here and delete the prototype.
<!--/DOC00001:init-->

<!--DOC00002:init-->
## Source of truth: `STANDARD_OBJECTS` in twenty-shared

`twenty-shared/src/metadata/constants/standard-object.constant.ts` exports
`STANDARD_OBJECTS` (SOC:15) — per-object blocks holding every field name and
every UUID (`universalIdentifier`) for fields, views, view-fields, and indexes.
Appraisal-domain keys: `appraisal` (SOC:16), `property` (SOC:61), `compsearch`
(SOC:212), `comparable` (SOC:278), `report` (SOC:434, its `report` RICH_TEXT
field UUID at SOC:441). Object-level UUIDs live in
`standard-object-universal-identifiers.constant.ts` (SOUID).

**Compile-time completeness:** `AllStandardObjectName = keyof typeof
STANDARD_OBJECTS` (`twenty-standard-application/types/all-standard-object-name.type.ts`),
and every server builder map ends `satisfies { [P in AllStandardObjectName]: ... }`
(e.g. BLDF:86-88). Adding a key to `STANDARD_OBJECTS` therefore forces
TypeScript errors in every sibling map (object/field/index/view/view-field/
search/...) until all entries exist — add the object to `STANDARD_OBJECTS`
FIRST and let the compiler drive the remaining edits. Mint fresh UUIDs for
every new object/field/view/viewField/index; never reuse or mutate an existing
one.
<!--/DOC00002:init-->

<!--DOC00003:init-->
## The applier: `synchronizeTwentyStandardApplicationOrThrow`

`TwentyStandardApplicationService.synchronizeTwentyStandardApplicationOrThrow`
(TSA:25-95): resolves the workspace's twenty-standard application id, loads the
workspace's current standard-app flat-entity maps from the workspace cache
(`from`), computes the fresh code-defined maps via
`computeTwentyStandardApplicationAllFlatEntityMaps` (`to`), builds a from→to
pair per metadata kind in `TWENTY_STANDARD_ALL_METADATA_NAME`, and hands them
to `validateBuildAndRunWorkspaceMigrationFromTo` with
`inferDeletionFromMissingEntities: true` (TSA:73-88) — i.e. a full diff-and-
migrate: entities removed from code are deleted from the workspace. Throws
`WorkspaceMigrationBuilderException` on validation failure.

**Call sites (exactly two, both fresh-workspace paths):**
- `workspace-manager.service.ts:68` inside `createWorkspace` (right after
  `applicationService.createTwentyStandardApplication`, WMS:64) — every new
  workspace is seeded automatically.
- `dev-seeder/services/dev-seeder.service.ts:120` — dev seeding.

**Existing workspaces are NOT retroactively updated by a code edit.** Rollout
to live workspaces needs a workspace upgrade command (copy the 2-10
`sync-call-recording-standard-objects` command, UPG: iterate workspaces, call
`getStandardFlatEntitiesToCreateOrThrow` per metadata kind, run the migration)
or a workspace reseed, followed by
`cache:flat-cache-invalidate --all-metadata -w <ws>`.
<!--/DOC00003:init-->

<!--DOC00004:init-->
## Registration architecture (file tree)

```
twenty-shared/src/metadata/constants/
  standard-object.constant.ts                        <- STANDARD_OBJECTS: all names + UUIDs
  standard-object-universal-identifiers.constant.ts  <- object-level UUIDs
twenty-server/.../workspace-manager/twenty-standard-application/
  services/twenty-standard-application.service.ts    <- the applier (diff + migrate)
  types/all-standard-object-name.type.ts             <- AllStandardObjectName
  utils/twenty-standard-application-all-flat-entity-maps.constant.ts
       <- orchestrator: calls every build-* util (object, field, index, view,
          view-field, view-field-group, view-filter, view-group, page-layout,
          page-layout-tab, page-layout-widget, navigation-menu-item,
          command-menu-item, search-field, permission-flag, role, skill, agent)
  utils/object-metadata/create-standard-flat-object-metadata.util.ts
       <- one entry per object (report: OBJ:119-144)
  utils/field-metadata/
    compute-<object>-standard-flat-field-metadata.util.ts   <- one per object
    build-standard-flat-field-metadata-maps.util.ts         <- registry (satisfies-gated)
    create-standard-field-flat-metadata.util.ts             <- scalar-field factory
    create-standard-relation-field-flat-metadata.util.ts    <- relation factory
  utils/i18n-label.util.ts                          <- label wrapper (ICU safety)
  utils/{index,view,view-field,...}/                <- per-kind compute + build-*-maps
  constants/search-fields-by-standard-object-name.constant.ts (SRCH)
  constants/standard-navigation-menu-item.constant.ts         (NAV)
```

One `compute-<object>-standard-flat-field-metadata.util.ts` exists per object —
appraisal (APR), property, compsearch, comparable, report (RPT) sit alongside
the stock Twenty ones (company, person, note, task, ...).
<!--/DOC00004:init-->

<!--DOC00005:init-->
## Field and relation declaration shapes

**Scalar field** (report's RICH_TEXT `report` field, RPT:205-222):
`createStandardFieldFlatMetadata({ objectName, workspaceId, context: {
fieldName, type: FieldMetadataType.RICH_TEXT, label: i18nLabel(msg\`Report\`),
description, icon, isNullable }, ... })`. The field's UUID is resolved from
`STANDARD_OBJECTS[objectName].fields[fieldName].universalIdentifier` — the
field name MUST already exist in the twenty-shared block.

**Relation** (canonical example: taskTarget, REL): declared with
`createStandardRelationFieldFlatMetadata` carrying `settings: { relationType:
RelationType.MANY_TO_ONE, onDelete, joinColumnName: '<name>Id' }`,
`targetObjectName`, `targetFieldName`. Relations are declared on **both
sides** — the MANY_TO_ONE owner (gets the FK join column) AND the ONE_TO_MANY
inverse — and both field names must be present under
`STANDARD_OBJECTS.<obj>.fields`.

**ICU-safe labels (hard constraint):** all labels/descriptions route through
`i18nLabel(msg\`...\`)` (`utils/i18n-label.util.ts`) because the standard-app
Lingui catalog is undefined by design. Text containing ICU metacharacters
`{ } # '` crashes new-workspace creation with "formatter is not a function"
(all-skeleton UI) — keep every label/description free of those characters.
<!--/DOC00005:init-->

<!--DOC00006:init-->
## Checklist: adding a new standard object (~10 files)

1. `twenty-shared/.../standard-object.constant.ts` — add the
   `STANDARD_OBJECTS.<newObject>` block: system fields + business fields +
   relation fields, each with a fresh UUID; plus views/indexes UUIDs.
2. `twenty-shared/.../standard-object-universal-identifiers.constant.ts` — add
   the object-level UUID.
3. `utils/field-metadata/compute-<newObject>-standard-flat-field-metadata.util.ts`
   — new file declaring every field (scalar + both relation sides).
4. `utils/field-metadata/build-standard-flat-field-metadata-maps.util.ts` —
   register the new compute util (the `satisfies` map now demands it).
5. `utils/object-metadata/create-standard-flat-object-metadata.util.ts` — add
   the object entry (nameSingular/plural, labels, icon).
6. Per-kind compute + build-*-maps for index, view, view-field (and any
   page-layout kinds wanted) — each `satisfies` map flags what's missing.
7. `constants/search-fields-by-standard-object-name.constant.ts` — search field.
8. `constants/standard-navigation-menu-item.constant.ts` — optional nav entry.
9. If another object gains an inverse relation field (e.g. `report.nodes`),
   extend that object's twenty-shared block + compute util too.
10. Rollout: new workspaces pick it up automatically on next server restart/HMR
    (no Docker rebuild); existing workspaces need an upgrade command (UPG
    template) or reseed + flat-cache invalidation.

Compile-time `satisfies` coverage means steps 3-8 surface as TypeScript errors
after step 1 — the checklist is enforced, not remembered.
<!--/DOC00006:init-->
