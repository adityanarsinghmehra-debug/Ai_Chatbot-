import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.materialaichat.app',
  appName: 'Material AI Chat',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
