import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.getword',
  appName: 'Get Word',
  webDir: 'dist',
  backgroundColor: '#0b1220',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      overlaysWebView: false,
      backgroundColor: '#f4efe2',
    },
  },
};

export default config;
