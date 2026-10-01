import { inspect } from 'util';

import { ConsoleLogger, Logger } from '@nestjs/common';

import { OperationTypeNode } from 'graphql';
import { QueryFailedError } from 'typeorm';

import { type ExceptionHandlerOptions } from 'src/engine/core-modules/exception-handler/interfaces/exception-handler-options.interface';

import { ExceptionHandlerConsoleDriver } from 'src/engine/core-modules/exception-handler/drivers/console.driver';
import { LoggerService } from 'src/engine/core-modules/logger/logger.service';

const PARAMETER_MARKER = 'SECRET-MARKER-param-51c0';
const DETAIL_MARKER = 'SECRET-MARKER-detail-8a2f';
const DOCUMENT_MARKER = 'SECRET-MARKER-document-e377';
const EMAIL_MARKER = 'secret-marker-user@example.com';
const ALL_MARKERS = [
  PARAMETER_MARKER,
  DETAIL_MARKER,
  DOCUMENT_MARKER,
  EMAIL_MARKER,
];

const STATEMENT =
  'UPDATE "workspace_x"."mls" SET "password" = $1 WHERE "id" = $2';
const ERROR_MESSAGE =
  'duplicate key value violates unique constraint "mls_pkey"';

const makeQueryFailedError = (statement = STATEMENT) =>
  new QueryFailedError(
    statement,
    [PARAMETER_MARKER, '20202020-0000-4000-8000-000000000001'],
    Object.assign(new Error(ERROR_MESSAGE), {
      code: '23505',
      detail: `Key (id)=(${DETAIL_MARKER}) already exists.`,
    }),
  );

const options: ExceptionHandlerOptions = {
  operation: { type: OperationTypeNode.MUTATION, name: 'UpdateOneMls' },
  document: `mutation UpdateOneMls { updateMls(id: "x", data: { password: "${DOCUMENT_MARKER}" }) { id } }`,
  additionalData: { password: PARAMETER_MARKER },
  user: {
    id: 'user-id-1',
    email: EMAIL_MARKER,
    firstName: 'First',
    lastName: 'Last',
  },
  workspace: { id: 'workspace-id-1', displayName: 'Workspace' },
};

const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

const CONSOLE_METHODS = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'group',
  'groupEnd',
] as const;

// Records everything the process would print: the Nest logger writes to
// process.stdout / process.stderr, the previous driver used console.*.
const captureOutput = () => {
  const writes: string[] = [];
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

  return {
    writes,
    consoleSpies,
    text: () => writes.join('\n'),
    exceptionLines: () =>
      writes.filter((write) => write.includes('Exception Captured')),
  };
};

describe('ExceptionHandlerConsoleDriver', () => {
  let driver: ExceptionHandlerConsoleDriver;
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
    driver = new ExceptionHandlerConsoleDriver();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const expectNoMarker = () => {
    for (const marker of ALL_MARKERS) {
      expect(output.text()).not.toContain(marker);
    }
  };

  it('prints a failed query without its parameters, the database detail, the document or the user', () => {
    const result = driver.captureExceptions([makeQueryFailedError()], options);

    expect(result).toEqual([]);
    expectNoMarker();

    const printed = output.exceptionLines().join('\n');

    expect(printed).not.toContain('parameters');
    expect(printed).not.toContain('driverError');
    expect(printed).not.toContain('detail');
    expect(printed).not.toContain('document');
  });

  it('keeps the name, message, code, statement and a small context on one error line', () => {
    driver.captureExceptions([makeQueryFailedError()], options);

    const lines = output.exceptionLines();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('ERROR [ExceptionHandler] ');
    expect(lines[0]).toContain(
      `Exception Captured: QueryFailedError: ${ERROR_MESSAGE} | code=23505 | query=${STATEMENT} | `,
    );
    expect(lines[0]).toContain(
      '{"operation":{"type":"mutation","name":"UpdateOneMls"},"workspace":{"id":"workspace-id-1"},"user":{"id":"user-id-1"}}',
    );
    expect(lines[0].trimEnd().split('\n')).toHaveLength(1);
  });

  it('does not call console.*', () => {
    driver.captureExceptions([makeQueryFailedError()], options);

    for (const consoleSpy of output.consoleSpies) {
      expect(consoleSpy).not.toHaveBeenCalled();
    }
  });

  it('prints one error line per exception', () => {
    driver.captureExceptions(
      [makeQueryFailedError(), new Error('second failure')],
      options,
    );

    const lines = output.exceptionLines();

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Exception Captured: Error: second failure | ');
    expect(lines[1]).not.toContain('code=');
    expect(lines[1]).not.toContain('query=');
    expectNoMarker();
  });

  it('keeps a statement that spans several lines on one line', () => {
    driver.captureExceptions([
      makeQueryFailedError('SELECT 1\n      FROM "core"."workspace"'),
    ]);

    const lines = output.exceptionLines();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('query=SELECT 1 FROM "core"."workspace"');
    expect(lines[0].trimEnd().split('\n')).toHaveLength(1);
    expectNoMarker();
  });

  it('prints an error without options and without a context object', () => {
    driver.captureExceptions([new Error('plain failure')]);

    const lines = output.exceptionLines();

    expect(lines).toHaveLength(1);
    expect(lines[0].trimEnd()).toMatch(
      /Exception Captured: Error: plain failure$/,
    );
  });

  it('prints a value that is not an error as a string of at most 500 characters, never the object', () => {
    driver.captureExceptions([
      'x'.repeat(600),
      { password: PARAMETER_MARKER, parameters: [PARAMETER_MARKER] },
    ]);

    const lines = output.exceptionLines();

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(`Exception Captured: ${'x'.repeat(500)}`);
    expect(lines[0]).not.toContain('x'.repeat(501));
    expect(lines[1]).toContain('Exception Captured: [object Object]');
    expectNoMarker();
  });
});
