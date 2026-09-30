import { type EntityManager } from 'typeorm';
import { FieldActorSource } from 'twenty-shared/types';

// Stable id of the default `mls` row every workspace is seeded with (public Redfin, no
// credentials, isDefault=true). Fixed so the seed is idempotent (ON CONFLICT DO NOTHING) and
// so the appraisal-app can reference "the default MLS" without a lookup. Each workspace lives in
// its own schema, so reusing one id per workspace is self-scoping.
//
// MUST stay in lockstep with `MLS_SEED_ID` in the appraisal-app
// (twenty/apps/appraisal-app/src/logic-functions/resolve-mls.ts).
export const MLS_SEED_ID = '76fb33e1-807d-46e4-b499-237a34f29a45';

export const MLS_SEED_NAME = 'Redfin';
export const MLS_SEED_LOGIN_URL = 'https://www.redfin.com';

// Seeds the default MLS/portal row for a workspace so every appraisal has a source to search
// out of the box. Appraisers add further `mls` rows (gated portals with credentials) themselves
// and pick one per appraisal via `appraisal.mls`; when that relation is empty the pipeline falls
// back to the row flagged isDefault.
export const prefillMls = async (
  entityManager: EntityManager,
  schemaName: string,
) => {
  await entityManager.query(
    `INSERT INTO "${schemaName}"."mls"
       ("id", "name", "loginUrlPrimaryLinkUrl", "loginUrlPrimaryLinkLabel", "loginUrlSecondaryLinks",
        "username", "password", "isDefault", "position",
        "createdBySource", "createdByWorkspaceMemberId", "createdByName",
        "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT ("id") DO NOTHING`,
    [
      MLS_SEED_ID,
      MLS_SEED_NAME,
      MLS_SEED_LOGIN_URL,
      MLS_SEED_NAME,
      '[]',
      '',
      '',
      true,
      1,
      FieldActorSource.SYSTEM,
      null,
      'System',
      FieldActorSource.SYSTEM,
      null,
      'System',
    ],
  );
};
