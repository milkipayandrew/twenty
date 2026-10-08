import { type EntityManager } from 'typeorm';
import { FieldActorSource } from 'twenty-shared/types';

import {
  MLS_SEED_ID,
  MLS_SEED_LOGIN_URL,
  MLS_SEED_NAME,
  prefillMls,
} from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-mls.util';

const EXPECTED_COLUMNS = [
  'id',
  'name',
  'loginUrlPrimaryLinkUrl',
  'loginUrlPrimaryLinkLabel',
  'loginUrlSecondaryLinks',
  'isDefault',
  'position',
  'createdBySource',
  'createdByWorkspaceMemberId',
  'createdByName',
  'updatedBySource',
  'updatedByWorkspaceMemberId',
  'updatedByName',
];

const runPrefill = async () => {
  const query = jest.fn().mockResolvedValue([]);
  const entityManager = { query } as unknown as EntityManager;

  await prefillMls(entityManager, 'workspace_test');

  expect(query).toHaveBeenCalledTimes(1);

  const [sql, params] = query.mock.calls[0] as [string, unknown[]];

  return { sql, params };
};

const extractColumns = (sql: string): string[] => {
  const columnList = sql.match(/"mls"\s*\(([^)]*)\)/);

  if (columnList === null) {
    throw new Error('INSERT column list not found');
  }

  return columnList[1]
    .split(',')
    .map((column) => column.trim().replace(/"/g, ''));
};

describe('prefillMls', () => {
  it('inserts into the workspace schema with exactly the name + login URL columns', async () => {
    const { sql } = await runPrefill();

    expect(sql).toContain('INSERT INTO "workspace_test"."mls"');
    expect(extractColumns(sql)).toEqual(EXPECTED_COLUMNS);
  });

  it('has one placeholder per column and one param per placeholder', async () => {
    const { sql, params } = await runPrefill();

    const placeholders = sql.match(/\$\d+/g) ?? [];

    expect(placeholders).toEqual(
      EXPECTED_COLUMNS.map((_, index) => `$${index + 1}`),
    );
    expect(params).toHaveLength(EXPECTED_COLUMNS.length);
  });

  it('seeds the default public Redfin row', async () => {
    const { params } = await runPrefill();

    expect(params).toEqual([
      MLS_SEED_ID,
      MLS_SEED_NAME,
      MLS_SEED_LOGIN_URL,
      MLS_SEED_NAME,
      '[]',
      true,
      1,
      FieldActorSource.SYSTEM,
      null,
      'System',
      FieldActorSource.SYSTEM,
      null,
      'System',
    ]);
  });

  it('is idempotent on the fixed seed id', async () => {
    const { sql } = await runPrefill();

    expect(sql).toContain('ON CONFLICT ("id") DO NOTHING');
  });
});
