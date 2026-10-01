import { config } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';

import { RedactingTypeOrmLogger } from 'src/database/typeorm/redacting-typeorm.logger';

config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  override: true,
});

const typeORMRawModuleOptions: DataSourceOptions = {
  url: process.env.PG_DATABASE_URL,
  type: 'postgres',
  logging: ['error'],
  // Appraisal fork, task-260930_1544: statement + error, never the bound
  // values. Built with the same options — without them it prints nothing.
  logger: new RedactingTypeOrmLogger(['error']),
  ssl:
    process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true'
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
};

export const rawDataSource = new DataSource(typeORMRawModuleOptions);
