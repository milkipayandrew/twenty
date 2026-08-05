# Docs Request: jwt

Pending cache maintenance requests for `docs.jwt.md`. Each entry captures research already performed by the orchestrator. Resolve with `/ACTION--dx-orchestrator -resolve`.

---

## Entry — 2026-08-03T15:20:00Z

**Status:** MISSING
**Target:** `twenty/core/packages/twenty-server/src/engine/core-modules/jwt/docs.jwt.md`
**Reason:** No cache exists for the jwt module. Coverage-gap flagged during research for task-260803_1515 (master API key). Only `jwt/services/jwt-wrapper.service.ts` was touched (as a collaborator of `docs.api-key.md`); the signing-key management, rotation cron, entity, cache-provider, verify-counter, and decode/util layers are entirely undocumented.
**Commit at research time:** core HEAD `b91c2a6457` (monorepo HEAD `b55cf73`)

### Sources read

| File | Commit | Lines |
|------|--------|-------|
| `jwt/services/jwt-wrapper.service.ts` | `b91c2a6457` | 1-255 (full) |
| `jwt/constants/jwt-algorithm.constant.ts` | `b91c2a6457` | 1-9 (full) |
| `jwt/utils/is-asymmetric-jwt-header.util.ts` | `b91c2a6457` | 1-15 (full) |

> Note: the following jwt files were NOT read and remain undocumented — a full dx-research pass should cover them when resolving: `jwt.module.ts`, `jwt-key-manager.exception.ts`, `services/jwt-key-manager.service.ts`, `services/signing-key-rotation.service.ts`, `services/signing-key-entity-cache-provider.service.ts`, `services/signing-key-verify-counter.service.ts`, `entities/signing-key.entity.ts`, `crons/commands/rotate-signing-keys.cron.command.ts`, `crons/jobs/rotate-signing-keys.cron.job.ts`, `constants/rotate-signing-keys-cron-pattern.constant.ts`, `utils/decode-jwt-header.util.ts`, `utils/decode-jwt-payload.util.ts`.

### dx-find output

Target 2 — `jwt/`: COVERAGE GAP. No `docs.*.md` cache is scoped to the jwt module. The jwt directory contains 15 TypeScript files, of which only one (`jwt/services/jwt-wrapper.service.ts`) appears in any cache — and only as a collaborator referenced by `docs.api-key.md` for signing/verification semantics relevant to API keys. The signing-key management/rotation, cron, entity, cache-provider, verify-counter, and JWT decode/util layers are entirely undocumented.

### Proposed updates

Cache is MISSING. On resolve, run a full dx-research pass over the whole `jwt/` module. As a verified seed for the signing/verification portion (read this session, safe to include verbatim), the following facts and file:line refs should anchor the new `docs.jwt.md`:

- **Algorithm constants** (`constants/jwt-algorithm.constant.ts:1-9`): `JWT_LEGACY_ALGORITHM = 'HS256'`, `JWT_ASYMMETRIC_ALGORITHM = 'ES256'`, `JWT_SUPPORTED_VERIFY_ALGORITHMS = ['HS256','ES256']`.
- **Signing is ES256-only** (`services/jwt-wrapper.service.ts:50-71`, `signAsyncOrThrow`): fetches the current signing key, signs with `algorithm: ES256`, sets `keyid: signingKey.id` (the `kid` header). No HS256 signing path remains.
- **Verify is dual-path, chosen by header** (`resolveVerificationKey`, `:86-127`): asymmetric header (non-empty `kid` AND `alg === 'ES256'`, per `utils/is-asymmetric-jwt-header.util.ts:7-15`) → verify with the public PEM for that `kid`; otherwise legacy HS256 → derive a symmetric secret from the payload.
- **Symmetric secret derivation** (`generateAppSecret`, `:187-197`): `createHash('sha256').update(`${appSecret}${appSecretBody}${type}`).digest('hex')`. `extractAppSecretBody` (`:219-233`) supplies `appSecretBody` = `workspaceId` (fallback `userId`). For API_KEY tokens: `secret = sha256hex(APP_SECRET + workspaceId + "API_KEY")`.
- **ACCESS-secret back-compat fallback** (`verifyJwtToken`, `:129-185`, esp. `:160-181`): on a legacy-HS256 verify failure where `payload.type === API_KEY`, retries once with `generateAppSecret(ACCESS, workspaceId)` — covers tokens minted before 2025-12-12 (twentyhq PR #16504). Fallback only, not the primary secret.
- **Legacy HS256 (no `kid`) is still accepted on verify** — HS256 is in `JWT_SUPPORTED_VERIFY_ALGORITHMS`; a forged HS256 token authenticates provided its payload carries `workspaceId` (else `extractAppSecretBody` returns undefined → `INVALID_JWT_TOKEN_TYPE`).

The undocumented signing-key lifecycle (rotation service, cron command/job, entity, cache-provider, verify-counter, key-manager service/exception) should be researched fresh and documented as its own section (how `kid`→PEM resolution and key rotation work), since ES256 verification depends on it.

---
