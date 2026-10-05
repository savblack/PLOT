// RN transport for "Export your data". The payload, file names and CSV come
// from @plot/core/exportData.js. iOS attaches the file to the share sheet;
// Android's Share module only sends text, so the contents go in the message,
// as shareCalendarFile does (expo-sharing is not in the current binary, and
// adding it would crash existing installs).
import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { buildExportCsv, exportCsvFilename, exportFilename } from '@plot/core/exportData.js';

export type ExportFormat = 'json' | 'csv';

export async function shareDataExport(payload: unknown, format: ExportFormat) {
  const isCsv = format === 'csv';
  const name = isCsv ? exportCsvFilename() : exportFilename();
  // The BOM makes Excel open accented titles correctly; harmless elsewhere.
  const text = isCsv ? `\ufeff${buildExportCsv(payload)}` : JSON.stringify(payload, null, 2);
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  const result = Platform.OS === 'ios'
    ? await Share.share({ url: file.uri, title: name })
    : await Share.share({ title: name, message: text });
  return result.action === Share.sharedAction;
}
