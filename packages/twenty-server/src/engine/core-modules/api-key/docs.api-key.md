---
chunking: DOC
doc-meta:
  commit: b91c2a6
sources:
  - file: api-key/services/api-key.service.ts
    prefix: SVC
    type: raw
  - file: api-key/services/api-key-role.service.ts
    prefix: ROLESVC
    type: raw
  - file: api-key/commands/generate-api-key.command.ts
    prefix: GENCMD
    type: raw
  - file: api-key/controllers/api-key.controller.ts
    prefix: CTRL
    type: raw
  - file: api-key/api-key.entity.ts
    prefix: ENTITY
    type: raw
  - file: ../jwt/services/jwt-wrapper.service.ts
    prefix: JWTWRAP
    type: raw
  - file: ../auth/strategies/jwt.auth.strategy.ts
    prefix: AUTHSTRAT
    type: raw
---

# Twenty API Key — Minting, Token Shape, Validation & Role Assignment

<!--DOC00001:ENTITY&AUTHSTRAT-->
## 1. Scope & headline finding

Diagnosis cache for the api-key core module at
`packages/twenty-server/src/engine/core-modules/api-key/`, plus the two
collaborators that give an API key its cryptographic and auth semantics:
`jwt/services/jwt-wrapper.service.ts` (signing/verification) and
`auth/strategies/jwt.auth.strategy.ts` (request-time validation).

All `file:line` references are relative to the `api-key/` module directory
unless prefixed with `../`. Verified against twenty/core commit `b91c2a6`.

**Headline finding: an API key is single-workspace-bound.** The workspace is
baked in three times — token `sub`/`workspaceId` claims, the DB `workspaceId`
column (via `WorkspaceRelatedEntity`), and the per-workspace `apiKeyMap` cache
used at validation time. One key can never authenticate against two
workspaces; "one API key across two workspaces" requires two keys.
<!--/DOC00001:ENTITY&AUTHSTRAT-->

<!--DOC00002:ENTITY-->
## 2. Entity & storage — `core.apiKey`

`api-key.entity.ts:14-41` defines `ApiKeyEntity` on table `core.apiKey`:

- `id` — uuid PK (this becomes the token's `jti`).
- `name` — display label.
- `expiresAt` — `timestamptz`, **required** (a "never expires" key is just
  `now + 100 years`, see chunks 5-6).
- `revokedAt` — nullable `timestamptz`; revocation is a soft flag, never a
  row delete.
- `createdAt` / `updatedAt` — auto columns.
- `workspaceId` — inherited from `WorkspaceRelatedEntity`
  (`api-key.entity.ts:12,17`), indexed via `IDX_API_KEY_WORKSPACE_ID`
  (`:14`). This is binding #1 of the key to exactly one workspace.

Note the entity stores **no secret material at all** — no hash, no token. The
credential is a JWT whose validity is derived from server-side keys plus this
row's liveness (`revokedAt`/`expiresAt`). Deleting or revoking the row kills
the token even though the JWT itself may be signed for 100 years.
<!--/DOC00002:ENTITY-->

<!--DOC00003:SVC-->
## 3. `ApiKeyService` — CRUD + token generation

`services/api-key.service.ts` is the module's core service. Everything is
workspace-scoped: the repository is a `WorkspaceScopedRepository<ApiKeyEntity>`
(`api-key.service.ts:23-24`), so every query takes `workspaceId` as its first
argument — binding #2 to a single workspace.

**`create(apiKeyData)` (`:30-56`)** — requires `roleId` + `workspaceId`:
1. Saves the row (`:34-37`).
2. Creates a `roleTarget` linking the role to the key:
   `roleTargetService.create({ roleId, targetId: savedApiKey.id,
   targetMetadataForeignKey: 'apiKeyId' })` (`:40-47`). On failure the api-key
   row is **rolled back by delete** (`:49`) — a key without a role must not
   exist (see chunk 7 for why).
3. Busts the workspace cache (`:53`, see below).

**`generateApiKeyToken(workspaceId, apiKeyId, expiresAt?)` (`:131-165`)** —
the minting step that turns a row into a bearer credential:
- Re-validates the row first via `validateApiKey` (`:140`).
- `expiresIn` = seconds until `expiresAt`, or the literal `'100y'` when no
  expiry given (`:142-150`).
- Signs via `jwtWrapperService.signAsyncOrThrow` (`:152-162`) with payload
  `{ sub: workspaceId, type: JwtTokenTypeEnum.API_KEY, workspaceId }` and
  option `jwtid: apiKeyId`. So the **token shape** is:
  `sub` = workspaceId, `jti` = apiKey row id, `type` = `API_KEY`, plus a
  redundant `workspaceId` claim (that claim is what selects the legacy
  HS256 secret formula — chunk 4).

**`validateApiKey(id, workspaceId)` (`:98-129`)** — DB-side liveness check:
throws `API_KEY_NOT_FOUND`, `API_KEY_REVOKED` (if `revokedAt` set), or
`API_KEY_EXPIRED` (if `now > expiresAt`).

**Revocation & cache busting** — `revoke` = `update(revokedAt: now)`
(`:94-96`). Every mutation (`create`/`update`) calls
`invalidateApiKeyCache(workspaceId)` (`:179-183`) =
`workspaceCacheService.invalidateAndRecompute(workspaceId, ['apiKeyMap'])`.
That `apiKeyMap` (id to ApiKeyEntity, per workspace) is exactly what the auth
strategy reads at request time (chunk 8), so revocation takes effect
immediately without waiting for cache TTL. Corollary for anyone inserting
api-key rows directly in SQL: **the cache does not see raw DB writes** — you
must flush/invalidate (e.g. redis flush or `invalidateAndRecompute`) or the
new key 401s.
<!--/DOC00003:SVC-->

<!--DOC00004:JWTWRAP-->
## 4. Cryptography — ES256 signing, HS256 legacy verify

`../jwt/services/jwt-wrapper.service.ts` owns both directions.

**Signing (current): ES256 asymmetric.** `signAsyncOrThrow`
(`jwt-wrapper.service.ts:50-71`) fetches the current signing key from
`JwtKeyManagerService`, signs with `algorithm: JWT_ASYMMETRIC_ALGORITHM`
(= `ES256`, from `../jwt/constants/jwt-algorithm.constant.ts`), sets header
`kid` to the signing key id, and passes `jwtid` through. There is **no HS256
signing path anymore** — new tokens are always ES256.

**Verification: dual-path by header.** `resolveVerificationKey` (`:86-127`):
- If the header is asymmetric (has `kid` + ES256), verify with that key's
  public PEM (`:91-103`).
- Otherwise (legacy HS256 token): derive the shared secret from the payload.
  `extractAppSecretBody` (`:219-233`) picks `workspaceId` (or `userId` for
  user tokens) from the payload, and `generateAppSecret(type, body)`
  (`:187-197`) computes:

  ```
  secret = sha256hex(APP_SECRET + workspaceId + "API_KEY")
  ```

  i.e. `createHash('sha256').update(appSecret + appSecretBody + type)
  .digest('hex')` — for an API key, `appSecretBody` = the `workspaceId` claim
  and `type` = `API_KEY`. This is the recipe for hand-minting an HS256 key
  that the server still accepts (both algorithms are in
  `JWT_SUPPORTED_VERIFY_ALGORITHMS`).

**Pre-2025-12-12 quirk:** `verifyJwtToken` (`:129-185`) has a fallback — old
API-key tokens were accidentally signed with the `ACCESS`-type secret, so on
HS256 verify failure of a `type: API_KEY` payload it retries with
`generateAppSecret(ACCESS, workspaceId)` (`:156-181`, twentyhq PR #16504).
<!--/DOC00004:JWTWRAP-->

<!--DOC00005:GENCMD-->
## 5. Minting path A — `workspace:generate-api-key` nest command

`commands/generate-api-key.command.ts` registers CLI command
`workspace:generate-api-key` (`generate-api-key.command.ts:28-31`). Options:
`-w/--workspace-id` (required), `-n/--name` (default `Developer API Key`),
`-e/--expires-in <days>` (omitted → `NEVER_EXPIRE_DAYS` = 100×365, `:26`).

Flow (`run`, `:79-149`):
1. **Environment gate**: refuses unless `NODE_ENV` is `development` or `test`
   (`:83-92`) — on a production-configured container you must override
   `NODE_ENV` for the invocation (the known recipe: run the command with
   `NODE_ENV=development` in the env).
2. Loads the workspace, then resolves the workspace's **Admin role** by
   `universalIdentifier: STANDARD_ROLE.admin.universalIdentifier` (`:109-113`)
   — role identity is by universal identifier, not label.
3. `apiKeyService.create({ name, expiresAt, workspaceId, roleId: adminRole.id })`
   (`:124-129`) — which creates the `core.roleTarget` row (chunk 3).
4. `apiKeyService.generateApiKeyToken(...)` and prints `TOKEN:<jwt>` to the
   log (`:136-148`). Grep the output for `TOKEN:` to harvest the credential.

This is the supported alternative to hand-inserting `core.apiKey` +
`core.roleTarget` rows in SQL and self-signing an HS256 token — the command
does the row, the role, the cache bust, and an ES256 token in one shot.
<!--/DOC00005:GENCMD-->

<!--DOC00006:CTRL-->
## 6. Minting path B — REST `POST /rest/metadata/apiKeys`

`controllers/api-key.controller.ts:33-39` mounts the controller at both
`rest/apiKeys` (deprecated) and `rest/metadata/apiKeys`, behind
`JwtAuthGuard` + `WorkspaceAuthGuard` +
`SettingsPermissionGuard(API_KEYS_AND_WEBHOOKS)`.

- `GET /` → active (non-revoked) keys of the calling workspace (`:43-48`).
- `GET /:id` → single key (`:50-56`).
- `POST /` → `create` (`:60-75`) — body `{ name, expiresAt, roleId, revokedAt? }`;
  `workspaceId` is **taken from the auth context** (`@AuthWorkspace`), never
  from the body, so a caller can only mint keys in its own workspace.
- `PATCH /:id`, `DELETE /:id` → update / revoke (`:77-106`). DELETE is a
  soft revoke, not a row delete.

**Escalation guard:** `POST`/`PATCH`/`DELETE` additionally require
`RequireAccessTokenGuard` (`:58-61` comment) — the caller must hold a real
user ACCESS token. A PLAYGROUND token or **another API key cannot mint an API
key**; a derived credential must not escalate into a long-lived one. This
endpoint returns the entity only — pair it with `generateApiKeyToken`
(chunk 3) to obtain the actual JWT.
<!--/DOC00006:CTRL-->

<!--DOC00007:ROLESVC-->
## 7. Roles — `ApiKeyRoleService` and `core.roleTarget`

An API key's permissions come from exactly one role, linked through a
`core.roleTarget` row with `targetMetadataForeignKey: 'apiKeyId'`.
`services/api-key-role.service.ts`:

- `assignRoleToApiKey` (`api-key-role.service.ts:39-66`) — validates then
  creates the roleTarget. Validation (`:126-177`): key exists in the
  workspace, role exists, and **`role.canBeAssignedToApiKeys` must be true**
  (`:157-162`, else `ROLE_CANNOT_BE_ASSIGNED_TO_API_KEYS`). Assigning the
  already-current role is a no-op.
- `getRoleIdForApiKeyId` (`:68-87`) — reads the cached `apiKeyRoleMap`
  (apiKeyId to roleId) from `WorkspaceCacheService`; throws
  `API_KEY_NO_ROLE_ASSIGNED` if missing — which is why `ApiKeyService.create`
  rolls back a key whose roleTarget insert failed, and why a hand-inserted
  `core.apiKey` row without a matching `core.roleTarget` (+ its
  `universalIdentifier`/`applicationId` requirements) authenticates but then
  fails authorization.
- `getApiKeyAssignableRoles` (`:179-188`) — roles with
  `canBeAssignedToApiKeys: true` (Admin qualifies; that's what the CLI
  command assigns).
- `getRolesByApiKeys` / `getApiKeysAssignedToRole` (`:190-246`) — batch
  lookups over roleTargets (revoked keys filtered out of the latter).

Like `apiKeyMap`, `apiKeyRoleMap` is a per-workspace cache — role changes
made directly in the DB need a cache invalidation to be seen.
<!--/DOC00007:ROLESVC-->

<!--DOC00008:AUTHSTRAT&JWTWRAP-->
## 8. Request-time validation — `JwtAuthStrategy.validateAPIKey`

`../auth/strategies/jwt.auth.strategy.ts` is the passport strategy behind
`JwtAuthGuard`. Signature verification happens first via
`secretOrKeyProvider` → `jwtWrapperService.resolveVerificationKey`
(`jwt.auth.strategy.ts:44-60`), accepting both ES256 and legacy HS256
(chunk 4). Then `validate` → `dispatch` (`:396-435`) routes by
`payload.type`; `API_KEY` (or a legacy payload with **no** `type` and no
`workspaceId` claim, `isLegacyApiKeyPayload` `:390-394`) goes to
`validateAPIKey` (`:63-101`):

1. Workspace = `coreEntityCacheService.get('workspaceEntity', payload.sub)`
   (`:66-77`) — **the token's `sub` alone selects the workspace**; there is
   no way to point one key at another workspace (binding #3).
2. `apiKeyMap` = `workspaceCacheService.getOrRecompute(workspace.id,
   ['apiKeyMap'])` (`:79-82`) — the same cache `ApiKeyService` busts on every
   mutation (chunk 3).
3. `apiKey = apiKeyMap[payload.jti]` (`:84`) — the row must still exist in
   **that** workspace's map; missing or `revokedAt` → 403 "This API Key is
   revoked" (`:86-91`); `expiresAt` in the past → 403 "This API Key is
   expired" (`:93-98`). DB-side expiry is checked on every request even if
   the JWT `exp` is 100 years out.
4. Returns `AuthContext` `{ apiKey, workspace, workspaceMemberId }` (`:100`)
   — note: **no user** in context; permissions resolve through the key's
   role (chunk 7), and `tokenType` is set to `API_KEY` (`:396-405`).

Practical consequence for multi-workspace tests: presenting workspace A's key
to workspace B's data can't work — the workspace is derived from the token,
not the URL/host, and the `jti` lookup happens inside workspace A's own
`apiKeyMap`. "One API key across two workspaces" requires two keys.
<!--/DOC00008:AUTHSTRAT&JWTWRAP-->
