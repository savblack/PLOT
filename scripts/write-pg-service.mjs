// Write a protected libpq service file from connection info supplied only via
// the environment. This keeps credentials and TLS options out of process argv.
import { chmodSync, writeFileSync } from 'node:fs';
import { parseDbConnectionOptions, serializePgService } from './lib/dbWritePathChecks.mjs';

const output = process.argv[2];
const name = process.argv[3] || 'plot_database';
const conninfo = process.env.PLOT_DB_CONNINFO;

if (!output) throw new Error('usage: node scripts/write-pg-service.mjs <output> [service-name]');
const options = parseDbConnectionOptions(conninfo);
if (!options) throw new Error('Database connection info could not be parsed safely.');

writeFileSync(output, serializePgService(name, options), { mode: 0o600 });
chmodSync(output, 0o600);
