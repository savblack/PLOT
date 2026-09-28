// RN share seam for a one-time calendar file. The ICS text is built in
// @plot/core/ics.js. iOS can attach the file URL. Android's Share module only
// sends text/plain, so the calendar text goes in the message. expo-sharing is
// not in the current binary, and adding it would crash existing installs.
import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';

export async function shareCalendarFile(ics: string) {
  const file = new File(Paths.cache, 'plot-calendar.ics');
  file.create({ overwrite: true });
  file.write(ics);
  if (Platform.OS === 'ios') {
    await Share.share({ url: file.uri, title: 'plot-calendar.ics' });
    return;
  }
  await Share.share({ title: 'plot-calendar.ics', message: ics });
}
