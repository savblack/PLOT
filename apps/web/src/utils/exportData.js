// Web side of "Export your data". The fetch, file names and CSV flattening live
// in @plot/core/exportData.js so mobile shares them; this file is the browser
// download.
import { buildExportCsv, exportCsvFilename, exportFilename } from '@plot/core/exportData.js';

export {
  buildExportCsv, exportCsvFilename, exportFilename, fetchUserDataExport, parseExportError,
} from '@plot/core/exportData.js';

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDataExport(payload, filename = exportFilename()) {
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadCsvExport(payload, filename = exportCsvFilename()) {
  // Prepend a UTF-8 BOM so Excel opens accented titles correctly.
  const blob = new Blob(['\uFEFF' + buildExportCsv(payload)], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}
