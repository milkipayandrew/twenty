import { ConsoleLogger, Logger } from '@nestjs/common';

import { type DataSource, type DataSourceOptions } from 'typeorm';

import { RedactingTypeOrmLogger } from 'src/database/typeorm/redacting-typeorm.logger';
import { LoggerService } from 'src/engine/core-modules/logger/logger.service';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { type WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';

// No .env file is read and no database is contacted in this spec.
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock(
  'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource',
  () => ({
    GlobalWorkspaceDataSource: jest
      .fn()
      .mockImplementation(() => ({ initialize: jest.fn() })),
  }),
);

const MARKER = 'SECRET-MARKER-3c9b1e';
const STATEMENT = 'INSERT INTO "t"("a") VALUES ($1)';
const ERROR_MESSAGE = 'duplicate key value violates unique constraint "t_pkey"';

const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

// A datasource that sets `logger` to an object no longer applies its own
// `logging` option: the logger must have been built with it. So each
// datasource is checked by behaviour — its logger prints a failed statement.
describe('RedactingTypeOrmLogger wiring (task-260930_1544)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOrmQueryLogging = process.env.ORM_QUERY_LOGGING;

  let writes: string[];

  const expectPrintsFailedStatementWithoutValues = (logger: unknown) => {
    // By name: jest.isolateModules loads its own copy of the class.
    expect((logger as object | undefined)?.constructor.name).toBe(
      RedactingTypeOrmLogger.name,
    );

    writes.length = 0;
    (logger as RedactingTypeOrmLogger).logQueryError(ERROR_MESSAGE, STATEMENT, [
      MARKER,
    ]);

    const printed = writes.join('');

    expect(printed).toContain(`[TypeORM] query failed: ${STATEMENT}`);
    expect(printed).toContain(`error: ${ERROR_MESSAGE}`);
    expect(printed).not.toContain(MARKER);
    expect(printed).not.toContain('PARAMETERS');
  };

  beforeAll(() => {
    Logger.overrideLogger(
      new LoggerService(
        new ConsoleLogger() as ConstructorParameters<typeof LoggerService>[0],
      ),
    );
  });

  beforeEach(() => {
    writes = [];

    const record = (chunk: unknown) => {
      writes.push(stripAnsi(String(chunk)));

      return true;
    };

    jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(record as typeof process.stdout.write);
    jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(record as typeof process.stderr.write);

    // Outside tests the core datasource logs errors (ORM_QUERY_LOGGING unset).
    process.env.NODE_ENV = 'production';
    delete process.env.ORM_QUERY_LOGGING;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;

    if (originalOrmQueryLogging === undefined) {
      delete process.env.ORM_QUERY_LOGGING;
    } else {
      process.env.ORM_QUERY_LOGGING = originalOrmQueryLogging;
    }
  });

  it('core datasource: options and connectionSource use the redacting logger, built with the logging options', () => {
    jest.isolateModules(() => {
      const {
        typeORMCoreModuleOptions,
        connectionSource,
      }: {
        typeORMCoreModuleOptions: DataSourceOptions;
        connectionSource: DataSource;
      } = require('src/database/typeorm/core/core.datasource');

      expect(typeORMCoreModuleOptions.logging).toEqual(['error']);
      expectPrintsFailedStatementWithoutValues(typeORMCoreModuleOptions.logger);
      expectPrintsFailedStatementWithoutValues(connectionSource.logger);
    });
  });

  it('raw datasource uses the redacting logger, built with the logging options', () => {
    jest.isolateModules(() => {
      const {
        rawDataSource,
      }: {
        rawDataSource: DataSource;
      } = require('src/database/typeorm/raw/raw.datasource');

      expect(rawDataSource.options.logging).toEqual(['error']);
      expectPrintsFailedStatementWithoutValues(rawDataSource.options.logger);
      expectPrintsFailedStatementWithoutValues(rawDataSource.logger);
    });
  });

  it('workspace datasources (primary and replica) use the redacting logger, built with TYPEORM_LOGGING', async () => {
    const twentyConfigService = {
      get: jest.fn((key: string) =>
        key === 'PG_DATABASE_REPLICA_URL'
          ? 'postgres://replica.invalid/db'
          : undefined,
      ),
      getLoggingConfig: jest.fn(() => ['error']),
    } as unknown as TwentyConfigService;

    await new GlobalWorkspaceDataSourceService(
      twentyConfigService,
      {} as WorkspaceEventEmitter,
      {} as DataSource,
    ).onModuleInit();

    const constructorCalls = jest.mocked(GlobalWorkspaceDataSource).mock.calls;

    expect(constructorCalls).toHaveLength(2);

    for (const [dataSourceOptions] of constructorCalls) {
      expect(dataSourceOptions.logging).toEqual(['error']);
      expectPrintsFailedStatementWithoutValues(dataSourceOptions.logger);
    }
  });
});
