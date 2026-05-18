import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config();
export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
  // Run any pending migrations on app start. Render free tier has
  // no shell, so a one-off `npm run migration:run` is not an option;
  // doing it at boot keeps the testbed DB schema in lockstep with
  // whatever code is deployed. Safe because every migration in this
  // repo is strictly additive per the testbed contract, and prod
  // runs from a separate repo so this switch never reaches it.
  migrationsRun: true,
  synchronize: false,
  logging: false,
  extra: {
    connectionLimit: 10,
  },
  timezone: 'Z',
};

export const AppDataSource = new DataSource(dataSourceOptions);
