/* The import engine as one module, for the import-worker edge function.
 *
 * The worker runs the same parse → resolve → plan → write sequence the apps
 * run in the page (importArchive → importPipeline), so an import finishes the
 * same way whether it ran in the tab or in the background. Edge functions
 * cannot import packages/core directly (the deploy bundler only sees
 * supabase/functions), so scripts/build-import-engine.mjs bundles this entry
 * into supabase/functions/_shared/importEngine.generated.js. `pnpm run lint`
 * fails when that bundle is stale.
 *
 * Nothing here is new logic: it only names what the worker needs. Keep it to
 * re-exports so the bundle cannot drift from the page's import.
 */
export { configure, getConfig } from './config.js';
export { readImportSelection } from './importArchive.js';
export { importReportMessages, importListResultMessage } from './importDocument.js';
export {
  resolveImportEntries, readExistingHistory, buildImportRows, writeImportDocument, reviewImportDuplicates,
} from './importPipeline.js';
export { planHistoryImport } from './importPlan.js';
export { needsDuplicateReview, reviewPendingWatchSummaries } from './importEvents.js';
export { splitImportForBackground } from './importBackground.js';
