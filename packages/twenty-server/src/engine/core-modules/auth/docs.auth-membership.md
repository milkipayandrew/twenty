---
chunking: DOC
doc-meta:
  name: auth-membership
  commit: b91c2a6457
sources:
  - file: auth/services/auth.service.ts
    prefix: SVC
    lines: 1-1158
  - file: auth/auth.resolver.ts
    prefix: RES
    lines: 191-390
  - file: auth/strategies/jwt.auth.strategy.ts
    prefix: JWT
    lines: 103-238
  - file: auth/utils/auth-graphql-api-exception-handler.util.ts
    prefix: HND
    lines: 1-67
  - file: graphql/utils/graphql-errors.util.ts
    prefix: GQL
    lines: 21-244
  - file: domain/workspace-domains/services/workspace-domains.service.ts
    prefix: DOM
    lines: 90-190
  - file: user-workspace/user-workspace.service.ts
    prefix: UWS
    lines: 270-300
---

<!-- Diagnosis cache for the auth login/membership boundary in twenty-server. -->
<!-- Answers: how a login attempt against a workspace the user is NOT a member of gets rejected, at which two gates, and what the client sees (GraphQL extensions.code, HTTP status). -->
<!-- Researched for Playwright smoke AC-5 (non-member cannot log in to a workspace they don't own). -->
<!-- All source paths are relative to packages/twenty-server/src/engine/core-modules/. -->
<!-- Verified against twenty/core commit b91c2a6457. -->

# Auth Login / Workspace-Membership Boundary

<!--DOC00001:RES&DOM-->
## 1. Overview — the two membership gates

A user can only obtain tokens *for a workspace* if a `userWorkspace` row links
them to it. That is enforced twice:

1. **Login-time gate** — `getLoginTokenFromCredentials` resolves the workspace
   from the request `origin` (`RES:198-201`) and passes it as
   `targetWorkspace` into `AuthService.validateLoginWithPassword`
   (`RES:211-214`), which calls `checkAccessAndUseInvitationOrThrow`
   (`SVC:185-187`) **before** the password is ever compared. A non-member with
   no pending invitation gets `AuthException` `FORBIDDEN_EXCEPTION`
   `"User is not a member of the workspace."` (`SVC:143-149`).
2. **Token-time gate** — every authenticated request re-checks membership in
   `JwtAuthStrategy.validateAccessToken`: the token's `userWorkspaceId` must
   resolve to a `userWorkspace` whose `workspaceId` matches the token's
   workspace (`JWT:145-160`, `JWT:233-238`), and the user must appear in the
   workspace-member cache (`JWT:182-202`).

The workspace-*agnostic* path (`signIn`, `RES:226-262`) deliberately has **no**
membership gate — it validates only credentials and returns the list of
workspaces the user *can* enter. Origin→workspace resolution itself is
`WorkspaceDomainsService.getWorkspaceByOriginOrDefaultWorkspace`
(`DOM:97-101`) (section 2).

<!--/DOC00001:RES&DOM-->

<!--DOC00002:DOM-->
## 2. Origin/subdomain → workspace resolution

`getWorkspaceByOriginOrDefaultWorkspace(origin)` (`DOM:97-101`) is a thin
wrapper over `resolveWorkspaceAndPublicDomain(origin)` (`DOM:103-189`), which
parses the origin via
`domainServerConfigService.getSubdomainAndDomainFromUrl` (`DOM:108-109`) and
returns `workspace: WorkspaceEntity | undefined`:

- **Single-workspace mode** (`IS_MULTIWORKSPACE_ENABLED` false,
  `DOM:111-123`): always the default workspace, whatever the origin.
- **Multiworkspace, public-domain origin** (`DOM:125-153`): look up a
  registered `publicDomain` by hostname, else fall back to workspace by
  `subdomain`.
- **Multiworkspace, normal origin** (`DOM:155-177`): no domain and no
  subdomain → `undefined`; otherwise find workspace by
  `{ customDomain: domain }` or `{ subdomain }` (`DOM:163-169`); a custom
  domain that matches nothing is retried as a public domain (`DOM:179-188`).

So on the fork (multiworkspace ON) the login mutation's target workspace is
picked purely by which `<slug>.localhost` origin the front sends. If nothing
resolves, `getLoginTokenFromCredentials` throws `AuthException`
`WORKSPACE_NOT_FOUND` `'Workspace not found'` (`RES:203-209`), which maps to
`UNAUTHENTICATED` (section 6).

<!--/DOC00002:DOM-->

<!--DOC00003:RES&SVC-->
## 3. Workspace-targeted login: `getLoginTokenFromCredentials`

`RES:191-224` (`@Mutation`, guards: `CaptchaGuard, PublicEndpointGuard,
NoPermissionGuard`):

1. Resolve workspace from `origin` arg (`RES:198-201`); assert defined or
   throw `WORKSPACE_NOT_FOUND` (`RES:203-209`).
2. `authService.validateLoginWithPassword(input, workspace)` (`RES:211-214`)
   — the membership gate lives inside (section 4).
3. On success, mint a login token bound to `(user.email, workspace.id,
   AuthProviderEnum.Password)` (`RES:216-221`) and return `{ loginToken }`.

`validateLoginWithPassword` (`SVC:152-214`) runs these checks **in order**:

1. Load user by email with `userWorkspaces` relation; missing user →
   `USER_NOT_FOUND` (`SVC:156-168`).
2. If the target workspace has password auth disabled, allow only users who
   pass `canUserBypassAuthProvider` (bypass flag + membership +
   `SSO_BYPASS` permission, `SVC:295-334`); otherwise `FORBIDDEN_EXCEPTION`
   `'Email/Password auth is not enabled for this workspace'`
   (`SVC:170-183`).
3. **Membership gate**: `checkAccessAndUseInvitationOrThrow(workspace, user)`
   (`SVC:185-187`) — section 4.
4. Only then: `passwordHash` presence (`SVC:189-197`, `INVALID_INPUT`
   `'Incorrect login method'`), `compareHash` (`SVC:199-209`,
   `FORBIDDEN_EXCEPTION` `'Wrong password'`), and email-verification check
   (`SVC:211`, `EMAIL_NOT_VERIFIED` when `IS_EMAIL_VERIFICATION_REQUIRED`,
   `SVC:216-227`).

Because step 3 precedes the hash compare, a non-member is rejected **before
the password is checked** — the same rejection happens with a correct or a
wrong password, so AC-5 can assert on the membership message regardless of
credentials.

<!--/DOC00003:RES&SVC-->

<!--DOC00004:SVC&UWS-->
## 4. The membership gate: `checkAccessAndUseInvitationOrThrow`

`SVC:110-150` (private). Logic:

1. `userWorkspaceService.checkUserWorkspaceExists(user.id, workspace.id)`
   (`SVC:114-121`) — a plain `userWorkspaceRepository.findOneBy({ userId,
   workspaceId })` (`UWS:270-278`). A row ⇒ member ⇒ return, gate passes.
2. No row: look for a pending personal invitation for this email in this
   workspace (`SVC:123-127`). If found, validate it and auto-join via
   `addUserToWorkspaceIfUserNotInWorkspace` (with the invitation's `roleId`)
   (`SVC:129-141`) — i.e. logging in with a pending invite consumes it and
   makes the user a member.
3. Neither ⇒ throw `AuthException('User is not a member of the workspace.',
   AuthExceptionCode.FORBIDDEN_EXCEPTION)` with the same
   `userFriendlyMessage` (`SVC:143-149`).

This is the exact string a Playwright test sees (surfaced via the mapping in
section 6) when a valid user of workspace A tries to log in on workspace B's
subdomain.

<!--/DOC00004:SVC&UWS-->

<!--DOC00005:RES-->
## 5. Workspace-agnostic path: `signIn` / `findAvailableWorkspacesByEmail`

`signIn` (`RES:226-262`) takes only credentials — no `origin`, no workspace —
and calls `validateLoginWithPassword(userCredentials)` **without**
`targetWorkspace` (`RES:232-233`), so both the auth-provider check and the
membership gate in section 3 are skipped (they are inside
`if (targetWorkspace)` blocks, `SVC:170-187`). It returns
`AvailableWorkspacesAndAccessTokensDTO`:

- `availableWorkspaces` from
  `userWorkspaceService.findAvailableWorkspacesByEmail(user.email)`
  (`RES:235-238`), post-processed by
  `setLoginTokenToAvailableWorkspacesWhenAuthProviderMatch` (`RES:240-246`)
  so workspaces reachable with password auth carry a ready login token.
- `tokens`: a **workspace-agnostic** access token
  (`workspaceAgnosticTokenService.generateWorkspaceAgnosticToken`,
  `RES:247-254`) plus a refresh token targeting
  `JwtTokenTypeEnum.WORKSPACE_AGNOSTIC` (`RES:255-259`).

This is the create-or-select-workspace flow: correct credentials always
succeed here; workspace scoping happens later when a per-workspace token is
requested. `verifyEmailAndGetWorkspaceAgnosticToken` (`RES:309-362`) returns
the same DTO shape after email verification, and the resolver's
`countAvailableWorkspacesByEmail`/`checkUserExists` helpers ride the same
service (`SVC:478-495`).

<!--/DOC00005:RES-->

<!--DOC00006:JWT&UWS-->
## 6. Second gate: `validateAccessToken` (every authenticated request)

`JwtAuthStrategy.validateAccessToken` (`JWT:103-208`) re-derives the auth
context from the JWT payload on each request:

1. Workspace must exist in the core-entity cache (`JWT:109-119`, else
   `WORKSPACE_NOT_FOUND`).
2. Payload must carry a user id (`JWT:129-136`, `USER_NOT_FOUND`) and a
   `userWorkspaceId` (`JWT:138-143`, `USER_WORKSPACE_NOT_FOUND`).
3. `resolveUserContext` (`JWT:145-160`, impl `JWT:210-241`) loads user and
   userWorkspace from cache and returns `null` — surfaced as
   `USER_NOT_FOUND` with friendly message `User does not have access to this
   workspace` (`JWT:151-160`) — if either is missing **or**
   `userWorkspace.workspaceId !== workspace.id` (`JWT:233-238`). A token
   whose userWorkspace points at a different workspace is therefore dead on
   arrival.
4. Unless the workspace is still `PENDING_CREATION`/`ONGOING_CREATION`
   (`JWT:174-180`), the user must resolve to a `workspaceMember` via
   `flatWorkspaceMemberMaps.idByUserId` (`JWT:182-191`); otherwise
   `FORBIDDEN_EXCEPTION` `'User is not a member of the workspace'`
   (`JWT:193-202`).

So even a forged/stale login that produced an access token cannot touch a
workspace the user has since left: membership is enforced from cache on every
call.

<!--/DOC00006:JWT&UWS-->

<!--DOC00007:HND&GQL-->
## 7. Error surface: GraphQL mapping and HTTP statuses

`authGraphqlApiExceptionHandler` (`HND:15-67`) converts `AuthException` codes
into the GraphQL error classes of `graphql-errors.util.ts`:

- `FORBIDDEN_EXCEPTION` (and `INSUFFICIENT_SCOPES`, `SIGNUP_DISABLED`, etc.)
  → `ForbiddenError` (`HND:21-31`) → `extensions.code = 'FORBIDDEN'`
  (`GQL:162-174`, enum `GQL:21-36`), carrying the exception's message and
  `userFriendlyMessage` as `extensions.subCode`/`userFriendlyMessage` via the
  `BaseGraphQLError(CustomException)` constructor (`GQL:62-71`).
- `USER_NOT_FOUND`, `WORKSPACE_NOT_FOUND`, `USER_WORKSPACE_NOT_FOUND` →
  `AuthenticationError` → `extensions.code = 'UNAUTHENTICATED'`
  (`HND:56-60`, `GQL:148-160`).
- `INVALID_INPUT` → `UserInputError` (`BAD_USER_INPUT`) (`HND:19-20`,
  `GQL:176-191`); `EMAIL_NOT_VERIFIED` → `ForbiddenError` with subCode
  `EMAIL_NOT_VERIFIED` (`HND:38-43`).

**HTTP status expectations for tests:**

- GraphQL mutations (e.g. `getLoginTokenFromCredentials`) return **HTTP 200**
  with `errors[0].extensions.code = 'FORBIDDEN'` and message
  `"User is not a member of the workspace."` — GraphQL transports errors in
  the body, not the status line.
- The REST/API-key side (guard failures around
  `validateAPIKey`/`validateAccessToken`, e.g. expired key
  `FORBIDDEN_EXCEPTION` at `JWT:93-98`) surfaces as a real **HTTP 403**,
  since guards reject outside the GraphQL execution phase.

AC-5 assertion recipe: POST the `getLoginTokenFromCredentials` mutation with
an `origin` of a workspace the user doesn't belong to → expect 200 +
`extensions.code === 'FORBIDDEN'`; hitting `/rest/*` with that user's token
for the wrong workspace → expect 403.

<!--/DOC00007:HND&GQL-->
