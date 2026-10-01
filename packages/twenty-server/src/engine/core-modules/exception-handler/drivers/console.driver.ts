import { Logger } from '@nestjs/common';

import { type ExceptionHandlerOptions } from 'src/engine/core-modules/exception-handler/interfaces/exception-handler-options.interface';

import { type ExceptionHandlerDriverInterface } from 'src/engine/core-modules/exception-handler/interfaces';

const NON_ERROR_VALUE_MAX_LENGTH = 500;

const toSingleLine = (text: string): string =>
  text.replace(/\s*[\r\n]+\s*/g, ' ');

// Appraisal fork, task-260930_1544 (check F2).
//
// This driver used to print the options and the raw exception objects with
// `console.*`. A database error carries the bound values of its statement
// (`parameters`, `driverError`, the Postgres `detail`) and the options carry
// the whole GraphQL `document`, so record contents reached stdout,
// `docker logs` and the log store. In the worker the same output was also
// captured by the logic-function console hook and stored as the log of
// whichever function was running.
//
// Now: one Nest logger call per exception, built from named fields only —
// name, message, code, the statement text (placeholders, no values) and a
// small context. Never the `document`, `parameters`, `driverError`, `detail`
// or the exception object itself. No `console.*`.
export class ExceptionHandlerConsoleDriver implements ExceptionHandlerDriverInterface {
  private readonly logger = new Logger('ExceptionHandler');

  captureExceptions(
    // oxlint-disable-next-line typescript/no-explicit-any
    exceptions: ReadonlyArray<any>,
    options?: ExceptionHandlerOptions,
  ) {
    const context = this.formatContext(options);

    for (const exception of exceptions) {
      const text = toSingleLine(
        `Exception Captured: ${this.describeException(exception)}${context}`,
      );
      const stack =
        exception instanceof Error && typeof exception.stack === 'string'
          ? exception.stack
          : undefined;

      if (stack === undefined) {
        this.logger.error(text);
      } else {
        this.logger.error(text, stack);
      }
    }

    return [];
  }

  private describeException(exception: unknown): string {
    if (!(exception instanceof Error)) {
      return String(exception).slice(0, NON_ERROR_VALUE_MAX_LENGTH);
    }

    const { code, query } = exception as Error & {
      code?: unknown;
      query?: unknown;
    };

    let description = `${exception.name}: ${exception.message}`;

    if (typeof code === 'string' || typeof code === 'number') {
      description += ` | code=${code}`;
    }

    if (typeof query === 'string') {
      description += ` | query=${query}`;
    }

    return description;
  }

  private formatContext(options?: ExceptionHandlerOptions): string {
    if (!options) {
      return '';
    }

    const context = {
      ...(options.operation
        ? {
            operation: {
              type: options.operation.type,
              name: options.operation.name,
            },
          }
        : {}),
      ...(options.workspace?.id
        ? { workspace: { id: options.workspace.id } }
        : {}),
      ...(options.user?.id ? { user: { id: options.user.id } } : {}),
    };

    return Object.keys(context).length > 0
      ? ` | ${JSON.stringify(context)}`
      : '';
  }
}
