# Plot — React Native / Mobile Readiness Notes

This document tracks the abstractions already in place and the remaining steps
needed to port Plot to React Native (Expo).

## Already abstracted (drop-in swap)

| Concern | Web module | React Native swap |
|---|---|---|
| **Storage** | `src/utils/storage.js` (localStorage) | Replace body with `@react-native-async-storage/async-storage` |
| **Confirm dialogs** | `src/components/ConfirmModal.jsx` (portal) | Swap `createPortal` for RN `<Modal>` — body is already native-style |
| **Chip / modal styling** | CSS variables | Map tokens to a StyleSheet object |

## Remaining steps before porting

### 1. Auth deep linking
Supabase magic-link and OAuth callbacks land on `/auth/callback` as a web URL.
React Native needs a custom scheme + universal links.

```
# expo.json / app.json
{
  "scheme": "plot",
  "ios":     { "bundleIdentifier": "tv.theplot.app", "associatedDomains": ["applinks:theplot.tv"] },
  "android": { "package": "tv.theplot.app", "intentFilters": [...] }
}
```

Update Supabase redirect URLs to include `plot://auth/callback`.
Handle in the RN shell with:
```js
import { Linking } from 'react-native';
Linking.addEventListener('url', ({ url }) => supabase.auth.handleUrl(url));
```

### 2. Font bundling
Currently loaded from Google Fonts via CSS `@import` — unavailable offline and unsupported
in native contexts.

```bash
# Download fonts into assets/fonts/
npx expo install expo-font
```

```js
// app/_layout.js (Expo Router)
import { useFonts } from 'expo-font';
const [loaded] = useFonts({
  'InstrumentSerif-Regular': require('./assets/fonts/InstrumentSerif-Regular.ttf'),
  'InstrumentSerif-Italic':  require('./assets/fonts/InstrumentSerif-Italic.ttf'),
  'Manrope-Regular':         require('./assets/fonts/Manrope-Regular.ttf'),
  'Manrope-Medium':          require('./assets/fonts/Manrope-Medium.ttf'),
  'Manrope-SemiBold':        require('./assets/fonts/Manrope-SemiBold.ttf'),
});
```

### 3. Routing
`react-router-dom` → `react-navigation` (stack + tab navigators).

Every component using `useNavigate`, `useLocation`, or `<Outlet>` needs updating.
The tab structure maps naturally:
- Home → Stack inside Tab
- Calendar → Stack inside Tab
- My Lists → Stack inside Tab
- History → Stack inside Tab

### 4. OAuth windows
`window.open(authUrl, '_blank')` for Plex and Trakt OAuth → `Linking.openURL(authUrl)`.
Register deep-link handlers to receive the callback (both already validated URLs by domain).

### 5. ICS calendar export
`downloadICS` uses DOM APIs — replace with:
```js
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const path = FileSystem.documentDirectory + 'plot-calendar.ics';
await FileSystem.writeAsStringAsync(path, icsContent, { encoding: FileSystem.EncodingType.UTF8 });
await Sharing.shareAsync(path);
```

### 6. Window/document guards
Search for uses of `window.*` and `document.*` outside `storage.js` and
`src/utils/browser.js` (now `storage.js`). Key ones:
- `window.location.href = '/'` in auth flows → `navigation.reset({ index: 0, routes: [{ name: 'Login' }] })`
- `window.dispatchEvent` in `useHistory.js` → replace with a React context event emitter or Zustand store
- `document.getElementById` in `EpgView.jsx` → replace with a ref

### 7. Hermes / JS engine compatibility
- `Intl.supportedValuesOf('timeZone')` → already replaced with static list ✅
- `crypto.randomUUID()` → use `expo-crypto` or `uuid` package
