import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config();
export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'greyfundr_db',
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [
    path.join(__dirname, '..', 'database', 'migrations', '*.{ts,js}'),
  ],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: false,
  extra: {
    connectionLimit: 10,
  },
  timezone: 'Z',
};

export const AppDataSource = new DataSource(dataSourceOptions);
