import { Logger } from '@nestjs/common';

import { ConsoleEventSink } from 'src/engine/core-modules/event-logs/ingest/console-event.sink';
import { type WorkspaceEventEnvelope } from 'src/engine/core-modules/event-logs/types/workspace-event-envelope.type';

const MARKER = 'SECRET-MARKER-9f3b1c';

const makeApplicationLog = (level: string): WorkspaceEventEnvelope => ({
  table: 'applicationLog',
  row: {
    timestamp: 't',
    workspaceId: 'w',
    applicationId: 'a',
    logicFunctionId: 'f',
    logicFunctionName: 'fn',
    executionId: 'e',
    level,
    message: `message-${level}`,
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
    expect(loggerSpies.log).toHaveBeenCalledWith('message-INFO', 'fn:e');

    const printed = JSON.stringify(
      Object.values(loggerSpies).flatMap((spy) => spy.mock.calls),
    );

    expect(printed).not.toContain(MARKER);
  });

  it('maps an ERROR applicationLog to logger.error', async () => {
    await sink.write([makeApplicationLog('ERROR')]);

    expect(loggerSpies.error).toHaveBeenCalledTimes(1);
    expect(loggerSpies.error).toHaveBeenCalledWith(
      'message-ERROR',
      undefined,
      'fn:e',
    );
    expect(loggerSpies.log).not.toHaveBeenCalled();
  });

  it('maps a WARN applicationLog to logger.warn', async () => {
    await sink.write([makeApplicationLog('WARN')]);

    expect(loggerSpies.warn).toHaveBeenCalledTimes(1);
    expect(loggerSpies.warn).toHaveBeenCalledWith('message-WARN', 'fn:e');
    expect(loggerSpies.log).not.toHaveBeenCalled();
  });

  it('maps a DEBUG applicationLog to logger.debug', async () => {
    await sink.write([makeApplicationLog('DEBUG')]);

    expect(loggerSpies.debug).toHaveBeenCalledTimes(1);
    expect(loggerSpies.debug).toHaveBeenCalledWith('message-DEBUG', 'fn:e');
    expect(loggerSpies.log).not.toHaveBeenCalled();
  });

  it('maps an INFO applicationLog to logger.log', async () => {
    await sink.write([makeApplicationLog('INFO')]);

    expect(loggerSpies.log).toHaveBeenCalledTimes(1);
    expect(loggerSpies.log).toHaveBeenCalledWith('message-INFO', 'fn:e');
    expect(loggerSpies.error).not.toHaveBeenCalled();
    expect(loggerSpies.warn).not.toHaveBeenCalled();
    expect(loggerSpies.debug).not.toHaveBeenCalled();
  });

  it('no-ops on an empty batch', async () => {
    await sink.write([]);

    expectNoLoggerCall();
  });
});
