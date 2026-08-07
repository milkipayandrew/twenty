import { type EntityManager } from 'typeorm';
import { FieldActorSource } from 'twenty-shared/types';

// Stable id so the seeded row is idempotent (ON CONFLICT DO NOTHING) and
// easy to find, pre-enroll and clean up across runs. Each workspace lives in
// its own schema, so reusing one id per workspace is self-scoping.
export const PIPELINE_CONFIG_SEED_ID = '027abd1b-0961-4c95-a296-974e967e106c';

// Seeds the single production-like pipelineConfig row for a workspace:
// debug OFF (real runner), advanceOnComplete ON (self-advances the chain).
// Never stores a JWT/secret — syncApiKeyId is left null and, when set later,
// only ever holds a core.apiKey row id (jti).
export const prefillPipelineConfig = async (
  entityManager: EntityManager,
  schemaName: string,
) => {
  await entityManager.query(
    `INSERT INTO "${schemaName}"."pipelineConfig"
       ("id", "name", "debug", "advanceOnComplete", "syncApiKeyId", "position",
        "createdBySource", "createdByWorkspaceMemberId", "createdByName",
        "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT ("id") DO NOTHING`,
    [
      PIPELINE_CONFIG_SEED_ID,
      'Pipeline Config',
      false,
      true,
      null,
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
