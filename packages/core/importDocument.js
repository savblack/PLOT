import { isLetterboxdDocument, parseLetterboxdDocument } from './letterboxdImport.js';
import { getConfig } from './config.js';
import { parseTraktAnnotations, TRAKT_ANNOTATION_FILES } from './traktAnnotations.js';
import { identifyImportEntries } from './importEvents.js';
import { parsePlatform } from './importParsing.js';
import { parseTvTimeDocument } from './tvTimeImport.js';
import { IMPORT_VIEW } from './copy/importView.js';

/** The document report must remain visible through review and results.
 * @param {string} platform
 * @param {string} text
 * @param {{fileName?: string}} [options]
 */
export function parseImportDocument(platform, text, { fileName = '' } = {}) {
  if (platform === 'trakt' && Object.hasOwn(TRAKT_ANNOTATION_FILES, fileName)) {
    if (!getConfig().importAnnotationsEnabled || !getConfig().importEventsEnabled) throw new Error(IMPORT_VIEW.annotationsUnavailable);
    const format = TRAKT_ANNOTATION_FILES[fileName];
    const entries = parseTraktAnnotations(text, format.kind);
    if (entries.some(row => row.annotationScope !== format.scope)) throw new Error(IMPORT_VIEW.traktAnnotationUnsupported);
    return { entries, warnings: [], notImported: [] };
  }
  if (platform === 'letterboxd' && isLetterboxdDocument(fileName)) {
    const document = parseLetterboxdDocument(text, fileName);
    if (document.entries.some(row => row.annotation) && (!getConfig().importAnnotationsEnabled || !getConfig().importEventsEnabled)) throw new Error(IMPORT_VIEW.annotationsUnavailable);
    return document;
  }
  if (platform === 'tvtime') return parseTvTimeDocument(text, fileName);
  const notImported = [];
  const entries = parsePlatform(platform, text, { fileName, onOmitted: index => {
    notImported.push({ title: IMPORT_VIEW.sourceRecord(index + 1), reason: 'missing_title' });
  } });
  if (entries.some(row => row.annotation) && (!getConfig().importAnnotationsEnabled || !getConfig().importEventsEnabled)) throw new Error(IMPORT_VIEW.annotationsUnavailable);
  const warnings = entries.some(row => row.requiresWatchReview) ? [{ title: 'Amazon Prime', reason: 'playback_review' }] : [];
  return { entries, warnings, notImported };
}

/** @param {{warnings?: any[], notImported?: any[]}} document */
export function importReportMessages(document) {
  return [...(document.notImported || []), ...(document.warnings || [])].map(item =>
    `${item.title}: ${IMPORT_VIEW.documentReport(item.reason, item.count)}`);
}

/** @param {any[]} rows */
export function importListSelections(rows) {
  return [...new Map(rows.filter(row => row.destination).map(row => [row.destination.key, row])).values()];
}

/** @param {any} outcome */
export function importListResultMessage(outcome) {
  if (outcome.lists) return outcome.lists.filter(list => list.notImported).map(list => `${list.destination.name}: ${IMPORT_VIEW.listNotImported(list.notImported)}`).join('\n');
  return outcome.notImported ? IMPORT_VIEW.listNotImported(outcome.notImported) : '';
}

/** Prepare extracted export files before any lookup or write. Source identity
 * belongs to each original file, never to its position in a selected bundle.
 * @param {string} platform
 * @param {{name: string, text: string}[]} files
 * @returns {{entries: (import('./importParsing.js').ParsedImportEntry & {source: string, account: string, fileDigest: string, recordIndex: number, sourceFile: string})[], warnings: {title: string, reason: string, count?: number}[], notImported: {title: string, reason: string, count?: number}[]}}
 */
export function prepareImportFiles(platform, files) {
  if (!files.length) return { entries: [], warnings: [], notImported: [] };
  if (files.length > 1 && !['tvtime', 'trakt', 'letterboxd'].includes(platform)) throw new Error(IMPORT_VIEW.multipleFilesUnsupported);
  const document = { entries: [], warnings: [], notImported: [] };
  const seen = new Map();
  for (const file of files) {
    if (typeof file.name !== 'string' || typeof file.text !== 'string') throw new Error(IMPORT_VIEW.fileReadFailed);
    if (seen.has(file.name)) {
      if (seen.get(file.name) !== file.text) throw new Error(IMPORT_VIEW.conflictingFiles);
      document.notImported.push({ title: file.name, reason: 'duplicate_file' });
      continue;
    }
    seen.set(file.name, file.text);
    const parsed = parseImportDocument(platform, file.text, { fileName: file.name });
    for (const entry of identifyImportEntries(parsed.entries, platform, file.text)) document.entries.push({ ...entry, sourceFile: file.name });
    for (const warning of parsed.warnings) document.warnings.push(warning);
    for (const omitted of parsed.notImported) document.notImported.push(omitted);
  }
  return platform === 'letterboxd' ? combineLetterboxdRecords(document) : document;
}


/** Merge only identical source event IDs, never titles. Preserve richer fields
 * from overlapping diary/review and watched/rating files. Conflicting source
 * values need separate review rather than file-order-dependent selection.
 * @param {{entries: any[], warnings: any[], notImported: any[]}} document
 */
function combineLetterboxdRecords(document) {
  const seen = new Map();
  const entries = [];
  let combined = 0;
  for (const row of document.entries) {
    if (!row.eventId || row.annotation || row.destination) { entries.push(row); continue; }
    const previous = seen.get(row.eventId);
    if (!previous) { seen.set(row.eventId, row); entries.push(row); continue; }
    if (previous.title !== row.title || previous.year !== row.year ||
        ['date', 'rating', 'note'].some(key => previous[key] != null && row[key] != null && previous[key] !== row[key])) {
      throw new Error(IMPORT_VIEW.conflictingSourceRecords);
    }
    for (const key of ['date', 'rating', 'note']) previous[key] ??= row[key];
    combined++;
  }
  if (combined) document.warnings.push({ title: 'Letterboxd', reason: 'same_source_record', count: combined });
  return { ...document, entries };
}
