import type { CapacitorConfig } from "@capacitor/cli";

/**
 * ChargeSetu Android app. The app opens the live production site over HTTPS
 * (same accounts, data and security rules as the website). No database keys or
 * secrets are bundled. `mobile/www` holds only an offline notice.
 */
const config: CapacitorConfig = {
  appId: "com.chargesetu.app",
  appName: "ChargeSetu",
  webDir: "mobile/www",
  server: {
    url: "https://chargesetu.vercel.app",
    cleartext: false,
    androidScheme: "https",
    // Only ChargeSetu pages load inside the app; every other link (Google Maps, OpenStreetMap,
    // phone, email) opens in the matching external app.
    allowNavigation: ["chargesetu.vercel.app"],
    errorPath: "index.html",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#046c4e",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
