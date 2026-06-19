// Shared paths for the copy contract. Kept in its own tiny module so importing a
// constant (e.g. into save.mjs) never pulls in — and runs — another step's script.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// marketing/copy/jobs/ — where pull.mjs writes briefs and the worker writes answers.
export const JOBS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'jobs');
