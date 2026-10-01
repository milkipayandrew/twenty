import { ConsoleLogger, Logger } from '@nestjs/common';

import { ConsoleEventSink } from 'src/engine/core-modules/event-logs/ingest/console-event.sink';
import { type WorkspaceEventEnvelope } from 'src/engine/core-modules/event-logs/types/workspace-event-envelope.type';
import { LoggerService } from 'src/engine/core-modules/logger/logger.service';

const MARKER = 'SECRET-MARKER-9f3b1c';

const JSON_MESSAGE =
  '{"component":"logic-fn","fn":"fn","level":"info","appraisal_id":"a-1","msg":"Dagu run started"}';

const makeApplicationLog = (
  level: string,
  message = `message-${level}`,
): WorkspaceEventEnvelope => ({
  table: 'applicationLog',
  row: {
    timestamp: 't',
    workspaceId: 'w',
    applicationId: 'a',
    logicFunctionId: 'f',
    logicFunctionName: 'fn',
    executionId: 'e',
    level,
    message,
  },
});

const objectEvent: WorkspaceEventEnvelope = {
  table: 'objectEvent',
  row: {
    type: 'track',
    event: 'mls.updated',
    properties: { after: { password: MARKER } },
    timestamp: 't',
    version: '1',
    workspaceId: 'w',
    recordId: MARKER,
    objectMetadataId: 'o',
  },
};

const otherNonApplicationLogEvents: WorkspaceEventEnvelope[] = [
  {
    table: 'workspaceEvent',
    row: {
      type: 'track',
      event: MARKER,
      properties: { value: MARKER },
      timestamp: 't',
      version: '1',
    },
  },
  {
    table: 'pageview',
    row: {
      type: 'page',
      name: MARKER,
      properties: { value: MARKER },
      timestamp: 't',
      version: '1',
    },
  },
  {
    table: 'usageEvent',
    row: {
      timestamp: 't',
      workspaceId: 'w',
      userWorkspaceId: 'u',
      resourceType: 'r',
      operationType: 'o',
      quantity: 1,
      unit: 'unit',
      creditsUsedMicro: 1,
      resourceId: MARKER,
      resourceContext: MARKER,
      metadata: { value: MARKER },
    },
  },
];

describe('ConsoleEventSink', () => {
  let sink: ConsoleEventSink;
  let loggerSpies: Record<
    'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal',
    jest.SpyInstance
  >;

  const expectNoLoggerCall = () => {
    for (const spy of Object.values(loggerSpies)) {
      expect(spy).not.toHaveBeenCalled();
    }
  };

  beforeEach(() => {
    loggerSpies = {
      log: jest.spyOn(Logger.prototype, 'log').mockImplementation(),
      error: jest.spyOn(Logger.prototype, 'error').mockImplementation(),
      warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(),
      debug: jest.spyOn(Logger.prototype, 'debug').mockImplementation(),
      verbose: jest.spyOn(Logger.prototype, 'verbose').mockImplementation(),
      fatal: jest.spyOn(Logger.prototype, 'fatal').mockImplementation(),
    };

    sink = new ConsoleEventSink();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prints nothing for an objectEvent envelope', async () => {
    await sink.write([objectEvent]);

    expectNoLoggerCall();
  });

  it('prints nothing for any other non-applicationLog envelope', async () => {
    await sink.write(otherNonApplicationLogEvents);

    expectNoLoggerCall();
  });

  it('prints only the applicationLog envelopes of a mixed batch', async () => {
    await sink.write([
      objectEvent,
      makeApplicationLog('INFO'),
      ...otherNonApplicationLogEvents,
    ]);

    expect(loggerSpies.log).toHaveBeenCalledTimes(1);
    expect(loggerSpies.log.mock.calls[0]).toEqual(['fn:e message-INFO']);

    const printed = JSON.stringify(
      Object.values(loggerSpies).flatMap((spy) => spy.mock.calls),
    );

    expect(printed).not.toContain(MARKER);
  });

  it('maps an ERROR applicationLog to logger.error', async () => {
    await sink.write([makeApplicationLog('ERROR')]);

    expect(loggerSpies.error).toHaveBeenCalledTimes(1);
    expect(loggerSpies.error.mock.calls[0]).toEqual(['fn:e message-ERROR']);
    expect(loggerSpies.log).not.toHaveBeenCalled();
  });

  it('maps a WARN applicationLog to logger.warn', async () => {
    await sink.write([makeApplicationLog('WARN')]);

    expect(loggerSpies.warn).toHaveBeenCalledTimes(1);
    expect(loggerSpies.warn.mock.calls[0]).toEqual(['fn:e message-WARN']);
    expect(loggerSpies.log).not.toHaveBeenCalled();
  });

  it('maps a DEBUG applicationLog to logger.debug', async () => {
    await sink.write([makeApplicationLog('DEBUG')]);

    expect(loggerSpies.debug).toHaveBeenCalledTimes(1);
    expect(loggerSpies.debug.mock.calls[0]).toEqual(['fn:e message-DEBUG']);
    expect(loggerSpies.log).not.toHaveBeenCalled();
  });

  it('maps an INFO applicationLog to logger.log', async () => {
    await sink.write([makeApplicationLog('INFO')]);

    expect(loggerSpies.log).toHaveBeenCalledTimes(1);
    expect(loggerSpies.log.mock.calls[0]).toEqual(['fn:e message-INFO']);
    expect(loggerSpies.error).not.toHaveBeenCalled();
    expect(loggerSpies.warn).not.toHaveBeenCalled();
    expect(loggerSpies.debug).not.toHaveBeenCalled();
  });

  it('no-ops on an empty batch', async () => {
    await sink.write([]);

    expectNoLoggerCall();
  });

  it('prints a JSON message alone and unchanged, with no context argument', async () => {
    await sink.write([
      makeApplicationLog('INFO', JSON_MESSAGE),
      makeApplicationLog('ERROR', JSON_MESSAGE),
    ]);

    expect(loggerSpies.log).toHaveBeenCalledTimes(1);
    expect(loggerSpies.log.mock.calls[0]).toEqual([JSON_MESSAGE]);
    expect(loggerSpies.error).toHaveBeenCalledTimes(1);
    expect(loggerSpies.error.mock.calls[0]).toEqual([JSON_MESSAGE]);
  });

  it('prefixes a message that is not JSON with <function>:<executionId>', async () => {
    await sink.write([makeApplicationLog('INFO', 'Exception Captured')]);

    expect(loggerSpies.log).toHaveBeenCalledTimes(1);
    expect(loggerSpies.log.mock.calls[0]).toEqual(['fn:e Exception Captured']);
  });

  it('skips an empty or blank message', async () => {
    await sink.write([
      makeApplicationLog('INFO', ''),
      makeApplicationLog('ERROR', ''),
      makeApplicationLog('WARN', '   '),
    ]);

    expectNoLoggerCall();
  });
});

// What really reaches stdout / stderr, through the same logger chain as
// main.ts / queue-worker.ts (app.useLogger(LoggerService)): one line per
// event. Before task-260930_1544 iteration 5 an INFO event printed two lines
// and an ERROR event three (the message, `undefined`, a bare `fn:e`).
describe('ConsoleEventSink printed output', () => {
  const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

  let writes: string[];

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['INFO', 'WARN', 'ERROR'])(
    'prints exactly one line for a JSON %s event, ending with the JSON',
    async (level) => {
      await new ConsoleEventSink().write([
        makeApplicationLog(level, JSON_MESSAGE),
      ]);

      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain('[ConsoleEventSink] ');
      expect(writes[0].trimEnd().endsWith(JSON_MESSAGE)).toBe(true);
      expect(writes[0].trimEnd().split('\n')).toHaveLength(1);
      expect(writes.join('')).not.toContain('undefined');
      expect(writes.join('')).not.toContain('fn:e');
    },
  );

  it.each(['INFO', 'WARN', 'ERROR'])(
    'prints exactly one prefixed line for a %s event that is not JSON',
    async (level) => {
      await new ConsoleEventSink().write([
        makeApplicationLog(level, 'plain text'),
      ]);

      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain('[ConsoleEventSink] ');
      expect(writes[0].trimEnd().endsWith('fn:e plain text')).toBe(true);
      expect(writes.join('')).not.toContain('undefined');
    },
  );

  it('prints nothing for an empty message or for a record event', async () => {
    await new ConsoleEventSink().write([
      makeApplicationLog('ERROR', ''),
      objectEvent,
      ...otherNonApplicationLogEvents,
    ]);

    expect(writes).toHaveLength(0);
  });
});
