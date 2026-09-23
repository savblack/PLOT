// Shared copy: used by the web app and mobile's ImportHistoryModal.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/importView.js re-exports it so src/copy stays the single
// place the web app and the Storybook Content page look for copy.

export const IMPORT_VIEW = {
  letterboxdUnsupported: 'Unsupported Letterboxd export layout or invalid record. Keep the original CSV filename and contents. Nothing was imported.',
  annotationsUnavailable: 'Rating and review imports are not available in this build.',
  annotationPreview: 'Ratings and reviews are saved privately as imported source records and included in your data export. They do not mark titles watched or replace your PLOT ratings and notes.',
  annotationCounts: (saved, unmatched) => `${saved} already imported · ${unmatched} unmatched`,
  annotationAlreadySaved: 'Already imported',
  annotationLabel: (row) => {
    const scope = row.annotationScope === 'episode' ? `Season ${row.seasonNumber}, episode ${row.episodeNumber}` : row.annotationScope === 'season' ? `Season ${row.seasonNumber}` : row.annotationScope === 'show' ? 'TV series' : 'Movie';
    const value = row.annotation.kind === 'rating' ? `Rating: ${row.annotation.rating}/10` : row.annotation.spoiler ? 'Review (spoilers hidden)' : 'Review';
    const date = row.annotation.ratedAt || row.annotation.createdAt;
    return `${scope} · ${value} · ${date || 'Annotation date unknown'}`;
  },
  previousEntries: 'Previous entries',
  nextEntries: 'Next entries',
  previewRange: (first, last, total) => `Entries ${first} to ${last} of ${total}`,
  confirmEntries: (count) => `Confirm ${count} ${count === 1 ? 'entry' : 'entries'}`,
  episodeLabel: (season, episode) => `Season ${season}, episode ${episode}`,
  filePickerHint: (name, archives) => `${archives ? 'CSV, JSON or ZIP' : 'CSV or JSON'} from ${name}`,
  fileReadFailed: 'Could not read the file. Please try again.',
  listPreview: (list) => `Import into ${list.name}. These titles will not be marked watched. Free accounts can have five custom lists.`,
  selectList: 'Include this list',
  episodeIdentityRequired: 'This export does not identify the episode reliably. This entry will be left out to avoid marking the whole series watched.',
  listNotImported: (reason) => ({ free_list_limit: 'List not imported: your five free custom lists are already in use.', deleted_in_plot: 'List not imported: you previously deleted it in PLOT.', not_selected: 'List not imported: not selected.', not_available: 'List imports are not available in this build.', invalid_list: 'This list could not be imported.' }[reason] || 'This list could not be imported.'),
  conflictingSourceRecords: 'These files contain conflicting values for the same source entry. Import them separately and review the difference. Nothing was imported.',
  pendingWatchSummary: 'A diary watch for this film is also selected. This watched-film summary may describe the same viewing. Leave the summary out unless it represents another watch.',
  possibleDuplicate: 'A similar watch is already saved. Leave this entry out, or confirm it is a separate watch.',
  keepSeparateWatch: 'Save as a separate watch',
  duplicateConfirmed: 'Confirmed as a separate watch',
  eventPreview: 'Each selected watch is saved separately. Existing PLOT ratings and notes stay unchanged. Previously imported records are skipped.',
  resultSummary: (inserted, duplicates, failed, unmatched = 0) => `${inserted} ${inserted === 1 ? 'entry' : 'entries'} added · ${duplicates} ${duplicates === 1 ? 'duplicate' : 'duplicates'} skipped · ${failed} not confirmed${unmatched ? ` · ${unmatched} left out without a confirmed match` : ''}`,
  finished: 'Import complete',
  incomplete: 'Import needs attention',
  chooseMatch: 'Choose a title or leave it out',
  skipMatch: 'Leave out of this import',
  reviewMatch: 'Review match',
  searchFailed: 'Search failed. Retry the file to try again.',
  unknownDate: 'Watch date unknown',
  imdbHint: 'Choose a saved IMDb movie ratings CSV or movie watchlist.csv. Keep the original filename. TV entries and custom-list formats are not supported yet.',
  archiveChooseOne: 'Choose one supported Letterboxd, Trakt or TV Time ZIP, or choose its extracted files separately.',
  selectionTooLarge: 'These files are too large to import together. Select up to 100 extracted files with a combined size of 50 MB at a time.',
  archiveTooLarge: 'This archive is too large. Choose extracted files instead (ZIP limit: 20 MB compressed, 50 MB expanded, 100 files).',
  archiveInvalid: 'This ZIP archive is invalid or unsupported. Nothing was imported. Choose the extracted files instead.',
  archiveNoSupportedFiles: 'No supported files for this source were found at the root of this archive. Choose the extracted files instead.',
  multipleFilesUnsupported: 'Choose one extracted file at a time for this source.',
  conflictingFiles: 'Two selected files have the same name but different contents. Import them separately so their source identity stays clear.',
  reportHeading: 'Review what will be left out or changed',
  tvTimeName: 'TV Time saved export',
  tvTimeHint: 'Choose one or more previously saved TV Time Liberator files: shows.json, movies.json, lists.json or favorites.json. Keep the original filename. You can also choose its ZIP archive. GDPR CSV files are not supported yet. PLOT cannot recover unavailable exports or connect a TV Time account.',
  documentReport: (reason, count) => ({
    same_source_record: `${count} overlapping source records were combined using their original entry IDs. Separate diary watches are retained.`,
    rated_films_watched: 'Letterboxd marks rated films as watched. These films will be saved with an unknown watch date, separately from their rating dates.',
    aggregate_rewatches: `${count} repeat watches are not imported because this file only contains a count. The count is retained with the imported source record.`,
    unwatched_rating: 'Rating not imported because this record is not marked watched.',
    timezone_unknown: 'Watch time has no timezone. Only the calendar date will be imported.',
    followed_show_without_watches: 'Followed show has no watched episodes. It will not be marked watched or added to your watchlist.',
    archive_file_unsupported: 'This archive file is not imported. Supported files are reviewed separately.',
    duplicate_file: 'Duplicate file selection was left out.',
    empty_list: 'Empty list will not be imported.',
  }[reason] || 'This record needs review and will not be imported.'),
  tvTimeUnsupported: 'Unsupported TV Time saved file or record. Keep the original shows.json, movies.json, lists.json or favorites.json filename from TV Time Liberator. No records were imported.',
  watchlistName: 'Watchlist',
  traktAnnotationUnsupported: 'Unsupported Trakt rating or review record. Nothing was imported.',
  traktWatchlistUnsupported: 'Unsupported Trakt watchlist record. This preview accepts lists-watchlist.json with movie/show IMDb identifiers. Nothing was imported.',
  traktName: 'Trakt saved export',
  traktHint: (annotations = false) => `Choose extracted JSON files or a ZIP with files at its root. Supported files: watched-history.json and lists-watchlist.json.${annotations ? ' You can also import ratings-shows.json, ratings-episodes.json and comments-seasons.json as private source annotations.' : ''} This preview requires IMDb identifiers. Watchlist notes and attached ratings are retained as source data without changing existing PLOT edits. Other files are reported as unsupported.`,
  traktUnsupported: 'Unsupported Trakt history file or record. Choose an individual-event history JSON with IMDb identifiers, episode numbers and valid watch dates (or null for unknown dates). No records were imported.',
  imdbName: 'IMDb',
  letterboxdHint: (annotations = false) => `Letterboxd → Settings → Import & Export → Export your data. Extract diary.csv, watched.csv, watchlist.csv or an individual custom-list CSV.${annotations ? ' Separate ratings.csv and reviews.csv files are also supported.' : ''} Choose the extracted CSV files or their ZIP. Keep original filenames. Overlapping watched summaries require review when diary entries for the same film are selected.`,
  matchOption: (title, year, type) => `${title} (${year || '?'} · ${type === 'tv' ? 'TV' : 'Movie'})`,
  noneAlreadyInHistory: 'None already in your history',
  notMatched: 'Not matched',
  alreadyInHistory: 'Already in history',
  // Several source rows describing one watch, e.g. Netflix listing each
  // episode of a series watched on the same night.
  mergedIntoOneEntry: 'Merged into one entry',
  partialFailureHeading: 'Some entries could not be confirmed',
  partialFailure: (n) => `${n} ${n === 1 ? 'entry could' : 'entries could'} not be confirmed. Some may already be saved. Your existing PLOT edits are unchanged, and you can safely retry the import.`,
  // Shown when the existing-history read fails. The import stops rather than
  // continuing, because planning against a partial history would overwrite
  // ratings and notes on titles it could not see.
  couldNotReadHistory: 'We could not check what is already in your history, so the import stopped. Nothing was changed. Please try again.',
  newBadge: 'New',
  haveBadge: 'Have',
  importing: 'Importing…',
  nothingNew: 'Nothing new',
  importArrow: 'Import →',
};
