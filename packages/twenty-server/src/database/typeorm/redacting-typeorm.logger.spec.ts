import { inspect } from 'util';

import { ConsoleLogger, Logger } from '@nestjs/common';

import { type LoggerOptions } from 'typeorm';

import { RedactingTypeOrmLogger } from 'src/database/typeorm/redacting-typeorm.logger';
import { LoggerService } from 'src/engine/core-modules/logger/logger.service';

const MARKER = 'SECRET-MARKER-7d2e4a';
const STATEMENT =
  'INSERT INTO "workspace_x"."mls"("id", "username", "password") VALUES ($1, $2, $3)';
const ERROR_MESSAGE =
  'duplicate key value violates unique constraint "mls_pkey"';
const PARAMETERS = [
  '20202020-0000-4000-8000-000000000001',
  MARKER,
  { nested: MARKER, list: [MARKER] },
];

// The logger under test. The fails-before proof of task-260930_1544 swaps this
// one line for TypeORM's default, `new AdvancedConsoleLogger(options)`.
const createLogger = (options?: LoggerOptions) =>
  new RedactingTypeOrmLogger(options);

const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

// Records everything the process would print: the Nest logger writes to
// process.stdout / process.stderr, TypeORM's own loggers use console.*.
const captureOutput = () => {
  const lines: string[] = [];
  const record = (chunk: unknown) => {
    lines.push(stripAnsi(String(chunk)));

    return true;
  };

  jest
    .spyOn(process.stdout, 'write')
    .mockImplementation(record as typeof process.stdout.write);
  jest
    .spyOn(process.stderr, 'write')
    .mockImplementation(record as typeof process.stderr.write);

  const consoleSpies = CONSOLE_METHODS.map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      record(
        args
          .map((arg) =>
            typeof arg === 'string' ? arg : inspect(arg, { depth: 6 }),
          )
          .join(' '),
      );
    }),
  );

  return { lines, consoleSpies, text: () => lines.join('\n') };
};

describe('RedactingTypeOrmLogger', () => {
  let output: ReturnType<typeof captureOutput>;

  beforeAll(() => {
    // Same chain as main.ts / queue-worker.ts: app.useLogger(LoggerService).
    Logger.overrideLogger(
      new LoggerService(
        new ConsoleLogger() as ConstructorParameters<typeof LoggerService>[0],
      ),
    );
  });

  beforeEach(() => {
    output = captureOutput();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const expectNoParameterValue = () => {
    expect(output.text()).not.toContain(MARKER);
    expect(output.text()).not.toContain('PARAMETERS');
  };

  describe.each<{ options: LoggerOptions }>([
    { options: ['error'] },
    { options: ['query', 'error'] },
    { options: 'all' },
    { options: true },
  ])('logQueryError with logging = $options', ({ options }) => {
    it('prints the failing statement and the error, never a parameter value', () => {
      createLogger(options).logQueryError(ERROR_MESSAGE, STATEMENT, PARAMETERS);

      expectNoParameterValue();
      expect(output.lines.length).toBeGreaterThanOrEqual(1);
      expect(output.text()).toContain(`query failed: ${STATEMENT}`);
      expect(output.text()).toContain(`error: ${ERROR_MESSAGE}`);
    });
  });

  it('prints a failed statement as two error lines of the TypeORM context, not through console.*', () => {
    createLogger(['error']).logQueryError(ERROR_MESSAGE, STATEMENT, PARAMETERS);

    expect(output.lines).toHaveLength(2);

    for (const line of output.lines) {
      expect(line).toContain('ERROR [TypeORM] ');
      expect(line.endsWith('\n')).toBe(true);
    }

    for (const consoleSpy of output.consoleSpies) {
      expect(consoleSpy).not.toHaveBeenCalled();
    }
  });

  it('prints only the message of a database error object, not its detail', () => {
    const databaseError = Object.assign(new Error(ERROR_MESSAGE), {
      code: '23505',
      detail: `Key (id)=(${MARKER}) already exists.`,
      parameters: PARAMETERS,
    });

    createLogger(['error']).logQueryError(
      databaseError as unknown as string,
      STATEMENT,
      PARAMETERS,
    );

    expect(output.text()).toContain(`query failed: ${STATEMENT}`);
    expect(output.text()).toContain(ERROR_MESSAGE);
    expectNoParameterValue();
  });

  it('prints a slow statement and its time, never a parameter value', () => {
    createLogger(['error']).logQuerySlow(1234, STATEMENT, PARAMETERS);

    expectNoParameterValue();
    expect(output.text()).toContain(`query is slow: ${STATEMENT}`);
    expect(output.text()).toContain('execution time: 1234');
    expect(output.text()).toContain('WARN [TypeORM] ');
  });

  it('prints a traced statement when logging contains query, never a parameter value', () => {
    createLogger(['query', 'error']).logQuery(STATEMENT, PARAMETERS);

    expectNoParameterValue();
    expect(output.lines).toHaveLength(1);
    expect(output.text()).toContain(`query: ${STATEMENT}`);
    expect(output.text()).toContain('LOG [TypeORM] ');
  });

  it('does not trace statements when logging is error only', () => {
    createLogger(['error']).logQuery(STATEMENT, PARAMETERS);

    expect(output.lines).toHaveLength(0);
  });

  it('prints nothing for a failed or traced statement when logging is empty', () => {
    const logger = createLogger([]);

    logger.logQueryError(ERROR_MESSAGE, STATEMENT, PARAMETERS);
    logger.logQuery(STATEMENT, PARAMETERS);

    expect(output.lines).toHaveLength(0);
  });

  // Why every datasource passes its `logging` value to the constructor: a
  // logger object ignores the datasource's own `logging` option.
  it('prints nothing for a failed statement when built without options', () => {
    createLogger().logQueryError(ERROR_MESSAGE, STATEMENT, PARAMETERS);

    expect(output.lines).toHaveLength(0);
  });
});
