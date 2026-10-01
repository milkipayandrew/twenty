import { Logger } from '@nestjs/common';

import {
  AbstractLogger,
  type LogLevel,
  type LogMessage,
  type QueryRunner,
} from 'typeorm';

// Appraisal fork, task-260930_1544 (check F2).
//
// TypeORM's default logger prints every failed, slow or traced statement as
// `<statement> -- PARAMETERS: [<bound values>]`. The bound values are record
// contents (an MLS password, for instance) and went to stdout, `docker logs`
// and the log store.
//
// This logger keeps the statement and the database error message and never
// prints the bound values: it uses TypeORM's own switch
// `appendParameterAsComment: false`, which only an AbstractLogger subclass
// can reach.
//
// It MUST be constructed with the same `logging` options as its datasource:
// a logger object ignores the datasource's `logging` option, and without
// options it prints nothing at all.
//
// Imports are limited to `typeorm` and `@nestjs/common` on purpose, so the
// built file can be loaded on its own (no database, no Nest application) to
// prove an image.
export class RedactingTypeOrmLogger extends AbstractLogger {
  private readonly logger = new Logger('TypeORM');

  protected writeLog(
    level: LogLevel,
    logMessage: LogMessage | string | number | (LogMessage | string | number)[],
    queryRunner?: QueryRunner,
  ): void {
    const messages = this.prepareLogMessages(
      logMessage,
      { highlightSql: false, appendParameterAsComment: false },
      queryRunner,
    );

    for (const message of messages) {
      const text = `${message.prefix ? `${message.prefix} ` : ''}${String(message.message)}`;

      switch (message.type ?? level) {
        case 'error':
        case 'query-error':
          this.logger.error(text);
          break;
        case 'warn':
        case 'query-slow':
          this.logger.warn(text);
          break;
        default:
          this.logger.log(text);
          break;
      }
    }
  }
}
