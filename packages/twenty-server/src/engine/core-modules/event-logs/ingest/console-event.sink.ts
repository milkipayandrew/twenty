import { Injectable, Logger } from '@nestjs/common';

import { type EventSink } from 'src/engine/core-modules/event-logs/ingest/event-sink';
import {
  type ApplicationLogRow,
  type WorkspaceEventEnvelope,
} from 'src/engine/core-modules/event-logs/types/workspace-event-envelope.type';

@Injectable()
export class ConsoleEventSink implements EventSink {
  private readonly logger = new Logger(ConsoleEventSink.name);

  async write(events: WorkspaceEventEnvelope[]): Promise<void> {
    for (const event of events) {
      if (event.table === 'applicationLog') {
        const line = this.formatLine(event.row);

        if (line === null) {
          continue;
        }

        switch (event.row.level) {
          case 'ERROR':
            this.logger.error(line);
            break;
          case 'WARN':
            this.logger.warn(line);
            break;
          case 'DEBUG':
            this.logger.debug(line);
            break;
          default:
            this.logger.log(line);
            break;
        }
      }
      // Appraisal fork, task-260930_1544 decision D2: no catch-all branch.
      // Only applicationLog events are printed; every other event type
      // (objectEvent, workspaceEvent, pageview, usageEvent) carries record
      // bodies, secrets included, and must never reach stdout / `docker logs`.
    }
  }

  // Appraisal fork, task-260930_1544: exactly one log line per event.
  // The function name and execution id used to be passed as an extra
  // argument; this logger already has a context, so Nest printed that
  // argument as a second message (and, for errors, an `undefined` line plus
  // a bare line on stderr). A structured (JSON) message is printed alone so
  // the collector can parse it; any other message is prefixed with
  // `<function>:<executionId>`; an empty message is skipped.
  private formatLine(row: ApplicationLogRow): string | null {
    const message = row.message ?? '';

    if (message.trim() === '') {
      return null;
    }

    if (message.startsWith('{') && message.endsWith('}')) {
      return message;
    }

    return `${row.logicFunctionName}:${row.executionId} ${message}`;
  }
}
