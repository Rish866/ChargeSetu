# ChargeSetu Android app

| | |
|---|---|
| App name | ChargeSetu |
| Package ID | `com.chargesetu.app` |
| Version | 1.0.0 (versionCode 1) |
| Technology | Capacitor 8 (Android WebView) loading **https://chargesetu.vercel.app** |
| Min / target Android | Android 7.0 (API 24) / Android 16 (API 36) |
| Permissions | `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` only |

The app shows the live production website, so accounts, data, security rules and updates are the same as on the web.
No database keys or other secrets are inside the app.

## What the app does
* Opens ChargeSetu pages inside the app. Every other link (Google Maps directions, OpenStreetMap, phone, email) opens in the matching app.
* Android's back button goes back a page, and closes the app on the first page.
* "Stations near me" asks for location permission the first time it is used.
* Downloads such as admin CSV exports are saved to *Downloads*, signed in as you (Android 10+).
* Security:
  * HTTPS only, with cleartext blocked and only system certificate authorities trusted.
  * Mixed content is blocked, file and content access is off, and WebView debugging is off in release builds.
  * App data is excluded from cloud backup and device transfer.
* Offline: shows a "needs the internet" screen with a retry button.

## Builds
`.github/workflows/android.yml` runs on every pull request that changes the app:
1. It builds three files:
   * **TEST APK**: debug-signed. You can install it, but it isn't for the Play Store.
   * **Release APK**: unsigned.
   * **Release App Bundle (.aab)**: unsigned.
2. It installs the TEST APK on an Android 14 emulator. It then tests the live site: launch, search, station details, back button, directions opening outside the app, location, map, and login (a wrong password must be rejected).

## Release signing (keep the key safe!)
A release **upload key** was created outside the repository: `chargesetu-upload.jks`, alias `chargesetu-upload`, RSA 4096, valid 30 years.
* It is **never committed**. `*.jks`, `*.keystore` and `signing-secrets.env` are ignored by git.
* The **owner must keep a copy** of the key file and its password, for example in a password manager.
  * If you lose the key *after* enrolling in Play App Signing, Google can reset the upload key.
  * If you lose it *before* the first upload, just make a new one.

To let GitHub sign automatically, add these **repository secrets** under *Settings → Secrets and variables → Actions*:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `ANDROID_KEYSTORE_BASE64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | from `signing-secrets.env` |
| `ANDROID_KEY_ALIAS` | `chargesetu-upload` |
| `ANDROID_KEY_PASSWORD` | from `signing-secrets.env` |

After that, every build also produces a signed APK and AAB (`chargesetu-release-signed` artifact).

To sign by hand (Android build-tools 36):
```bash
zipalign -p -f 4 app-release-unsigned.apk aligned.apk
apksigner sign --ks chargesetu-upload.jks --ks-key-alias chargesetu-upload --out chargesetu-release.apk aligned.apk
jarsigner -keystore chargesetu-upload.jks app-release.aab chargesetu-upload
```

## Play Store submission
See `docs/play-store/` for the listing text (English + Hindi), the data-safety answers and the content-rating notes.
Steps in Play Console:
1. Create the app.
2. Enroll in **Play App Signing**.
3. Upload the signed `.aab` to *Internal testing*.
4. Fill in the listing and the data safety form.
5. Add screenshots (the emulator test saves them as the `android-emulator-screens` artifact).
6. Roll out.
