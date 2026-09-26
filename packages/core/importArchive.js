import { getConfig } from './config.js';
import { TRAKT_ANNOTATION_FILES } from './traktAnnotations.js';
import { inspectZip, zipCrc32 } from './zipIntegrity.js';
import { unzipSync, strFromU8, strToU8 } from 'fflate';
import { prepareImportFiles } from './importDocument.js';
import { IMPORT_VIEW } from './copy/importView.js';

const MAX_COMPRESSED = 20 * 1024 * 1024;
const MAX_EXPANDED = 50 * 1024 * 1024;
const MAX_FILES = 100;
const SUPPORTED = {
  letterboxd: new Set(['diary.csv', 'watched.csv', 'watchlist.csv']),
  tvtime: new Set(['shows.json', 'movies.json', 'lists.json', 'favorites.json', 'tracking-prod-records-v2.csv', 'tracking-prod-records.csv']),
  trakt: new Set(['watched-history.json', 'lists-watchlist.json']),
};

/** Decode a supported in-memory saved export ZIP. Nothing is extracted to disk.
 * Limits apply to the whole archive, including files we do not import.
 * @param {string} platform
 * @param {Uint8Array} bytes
 */
export function prepareImportArchive(platform, bytes) {
  if (!SUPPORTED[platform]) throw new Error(IMPORT_VIEW.archiveChooseOne);
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_COMPRESSED) throw new Error(IMPORT_VIEW.archiveTooLarge);
  let expanded = 0;
  let count = 0;
  const names = new Set();
  const omitted = [];
  let contents;
  try {
    const metadata = inspectZip(bytes, { maxFiles: MAX_FILES, maxExpanded: MAX_EXPANDED });
    contents = unzipSync(bytes, { filter: file => {
      if (++count > MAX_FILES || !Number.isSafeInteger(file.originalSize) || file.originalSize < 0 || (expanded += file.originalSize) > MAX_EXPANDED) throw new Error(IMPORT_VIEW.archiveTooLarge);
      const path = file.name;
      if (!path || path.includes('\\') || path.startsWith('/') || path.split('/').includes('..') || path.includes('\0') || names.has(path)) throw new Error(IMPORT_VIEW.archiveInvalid);
      names.add(path);
      if (path.endsWith('/')) return false;
      // Accept only documented source paths. Unfamiliar files are reported,
      // never silently interpreted as a different format.
      const annotationSupported = platform === 'trakt' && Object.hasOwn(TRAKT_ANNOTATION_FILES, path) &&
        getConfig().importAnnotationsEnabled && getConfig().importEventsEnabled;
      const letterboxdSupported = platform === 'letterboxd' && (/^lists\/[^/]+\.csv$/.test(path) ||
        (['ratings.csv', 'reviews.csv'].includes(path) && getConfig().importAnnotationsEnabled && getConfig().importEventsEnabled));
      if (!SUPPORTED[platform].has(path) && !annotationSupported && !letterboxdSupported) {
        omitted.push({ title: path, reason: 'archive_file_unsupported' });
        return false;
      }
      return true;
    } });
    for (const entry of metadata) {
      const name = strFromU8(entry.nameBytes);
      const data = contents[name];
      if (data && (data.length !== entry.original || zipCrc32(data) !== entry.crc)) throw new Error(IMPORT_VIEW.archiveInvalid);
    }
  } catch (error) {
    if ((error instanceof RangeError && error.message === 'ZIP limits exceeded') || (error instanceof Error && error.message === IMPORT_VIEW.archiveTooLarge)) throw new Error(IMPORT_VIEW.archiveTooLarge, { cause: error });
    throw new Error(IMPORT_VIEW.archiveInvalid, { cause: error });
  }
  const files = Object.entries(contents).map(([name, data]) => ({ name, text: strFromU8(data) }));
  if (!files.length) throw new Error(IMPORT_VIEW.archiveNoSupportedFiles);
  const document = prepareImportFiles(platform, files);
  document.notImported.push(...omitted);
  return document;
}

/** Platform adapters provide file readers; archive interpretation stays shared.
 * @param {string} platform
 * @param {{name: string, size?: number, text: () => Promise<string>, arrayBuffer: () => Promise<ArrayBuffer>}[]} files
 */
export async function readImportSelection(platform, files) {
  if (files.length > MAX_FILES) throw new Error(IMPORT_VIEW.selectionTooLarge);
  if (files.some(file => typeof file.name !== 'string' || (file.size != null && (!Number.isSafeInteger(file.size) || file.size < 0)))) throw new Error(IMPORT_VIEW.fileReadFailed);
  if (files.some(file => /\.zip$/i.test(file.name))) {
    if (!SUPPORTED[platform] || files.length !== 1) throw new Error(IMPORT_VIEW.archiveChooseOne);
    // Web File.size and native picker metadata allow rejection before loading.
    // The byte-level archive guard still checks the actual payload afterward.
    if (files[0].size > MAX_COMPRESSED) throw new Error(IMPORT_VIEW.archiveTooLarge);
    return prepareImportArchive(platform, new Uint8Array(await files[0].arrayBuffer()));
  }
  if (files.reduce((sum, file) => sum + (file.size || 0), 0) > MAX_EXPANDED) throw new Error(IMPORT_VIEW.selectionTooLarge);
  const prepared = [];
  let bytes = 0;
  // Sequential reads bound peak allocation and stop before reading further
  // files if missing or inaccurate metadata understates the actual UTF-8 size.
  for (const file of files) {
    const text = await file.text();
    if (typeof text !== 'string') throw new Error(IMPORT_VIEW.fileReadFailed);
    if (text.length > MAX_EXPANDED - bytes) throw new Error(IMPORT_VIEW.selectionTooLarge);
    bytes += strToU8(text).length;
    if (bytes > MAX_EXPANDED) throw new Error(IMPORT_VIEW.selectionTooLarge);
    prepared.push({ name: file.name, text });
  }
  return prepareImportFiles(platform, prepared);
}

/** @param {Uint8Array} bytes */
export function prepareTvTimeArchive(bytes) { return prepareImportArchive('tvtime', bytes); }
