import type { CapacitorConfig } from '@capacitor/cli'

// Native app shell (Android / iOS) around the same web build as the PWA.
// `npm run app` builds dist/ and copies it into android/ and ios/.
// The app id can still be changed before the first store upload.
const config: CapacitorConfig = {
  appId: 'com.vis.fitness',
  appName: 'VIS',
  webDir: 'dist',
  backgroundColor: '#000000',
  ios: { contentInset: 'never' },
}

export default config
