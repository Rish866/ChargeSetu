**ChargeSetu for Android 1.0.0 — pre-release for testing**

| File | What it is |
|---|---|
| `chargesetu-1.0.0-release-signed.apk` | **Release build, signed** with the ChargeSetu upload key (APK signature v2 + v3). Install this on your phone. |
| `chargesetu-1.0.0-release-signed.aab` | Release App Bundle, signed with the upload key — for Google Play Console. |
| `chargesetu-1.0.0-TEST-debug.apk` | Debug-signed test build used by the automated emulator tests. **Not for distribution.** |

* Package `com.chargesetu.app` · Android 7.0+ · permissions: internet, location (only for "stations near me").
* The app loads the live site https://chargesetu.vercel.app over HTTPS. No secrets are inside the app.
* Signing certificate SHA-256: `ba:4f:ab:69:13:80:30:6c:12:ee:9f:5d:38:d3:ab:93:55:df:e2:24:03:c2:2c:ec:95:40:52:f9:d1:38:75:e1`
* Install on a phone: download the signed APK, open it, and allow "install unknown apps" for your browser when Android asks.

Built from PR #9 (`launch-pan-india`). SHA-256 checksums are in `SHA256SUMS.txt`.
