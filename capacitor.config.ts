import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'life.godparticle.app',
  appName: 'God Particle',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Remove this block before production build — only for live reload during dev
    // url: 'http://YOUR_LOCAL_IP:5173',
    // cleartext: true,
  },
  android: {
    backgroundColor: '#0a0a0f',
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#0a0a0f',
    contentInset: 'always',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
