// The browser mirror cannot bundle @react-native-community/datetimepicker (Flow
// source, native modules), and a native picker has nothing to show in a browser.
// Stories that open the date picker see an empty slot here; check it on a device.
export default function DateTimePicker() {
  return null;
}
