import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const MANUAL_OUTPUT_ROOT = path.join(HERE, '..', 'plot-posts');
