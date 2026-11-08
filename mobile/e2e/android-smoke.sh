#!/usr/bin/env bash
# Android end-to-end smoke test for the ChargeSetu app against the PRODUCTION site.
# Runs inside an emulator (see .github/workflows/android.yml). Prints ok/FAIL per check
# and saves screenshots to ./android-screens/.
set -uo pipefail
APK="${1:?usage: android-smoke.sh <apk>}"
PKG=com.chargesetu.app
UI="python3 $(dirname "$0")/ui.py"
mkdir -p android-screens
pass=0; fail=0; n=0
ok()   { echo "ok   $1"; pass=$((pass+1)); }
bad()  { echo "FAIL $1"; fail=$((fail+1)); }
shot() { n=$((n+1)); adb exec-out screencap -p > "android-screens/$(printf %02d $n)-$1.png" 2>/dev/null || true; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml 2>/dev/null; }
waitfor() { # waitfor <regex> <seconds>
  local end=$((SECONDS + ${2:-45}))
  while [ $SECONDS -lt $end ]; do dump | $UI has "$1" && return 0; sleep 2; done; return 1; }
tap() { # tap <regex>
  local xy; xy=$(dump | $UI find "$1") || return 1; adb shell input tap $xy; }
foreground() { adb shell dumpsys activity activities 2>/dev/null | grep -m1 -E "topResumedActivity|mResumedActivity" ; }
check() { # check <name> <regex> [seconds]
  if waitfor "$2" "${3:-45}"; then ok "$1"; else bad "$1"; echo "     visible: $(dump | $UI texts | cut -c1-400)"; fi; shot "$1"; }

adb wait-for-device
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0; adb shell settings put global animator_duration_scale 0
adb install -r "$APK" >/dev/null && ok "install APK" || { bad "install APK"; exit 1; }
perms=$(adb shell dumpsys package $PKG | grep -oE "android.permission.[A-Z_]+" | sort -u | tr '\n' ' ')
echo "     requested permissions: $perms"
extra=$(echo "$perms" | tr ' ' '\n' | grep -vE "^(android.permission.(INTERNET|ACCESS_COARSE_LOCATION|ACCESS_FINE_LOCATION|ACCESS_NETWORK_STATE|POST_NOTIFICATIONS|WAKE_LOCK)|)$" | grep -v DYNAMIC_RECEIVER || true)
[ -z "$extra" ] && ok "no unexpected permissions" || bad "unexpected permissions: $extra"
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION
adb emu geo fix 72.8777 19.0760 >/dev/null 2>&1 || true   # Mumbai (longitude latitude)

adb shell am start -W -n $PKG/.MainActivity >/dev/null
check "app launches and loads the live home page" "Charge with confidence|Find charging|stations" 120
foreground | grep -q $PKG && ok "ChargeSetu is the foreground app" || bad "ChargeSetu is the foreground app"

# Search
if tap "Search city, area or station name|Search city"; then
  sleep 1; adb shell input text "Delhi"; adb shell input keyevent 66
  check "search: Delhi returns results" "stations? found|No stations match" 60
else bad "search field found"; fi

# Station details + back button
if tap "View details"; then
  check "station details page" "Listing information|Connectors|Max power" 45
  adb shell input keyevent 4
  check "back button returns to the results" "stations? found" 30
else bad "station details: a result to open"; fi

# Directions open outside the app
if tap "View details"; then
  waitfor "Directions" 30
  tap "^Directions|Directions to" || true
  sleep 6
  top=$(foreground); echo "     foreground after Directions: $top"
  echo "$top" | grep -q $PKG && bad "directions open in an external app" || ok "directions open in an external app"
  shot "directions"
  adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 3
else bad "directions: a result to open"; fi

# Location: "Stations near me"
adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity >/dev/null
waitfor "Charge with confidence|Stations near me" 90
if tap "Stations near me"; then
  check "location: stations sorted by distance" "Sorted by distance|km away" 60
else bad "location: 'Stations near me' button"; fi

# Map
if tap "^Map$|Map view"; then
  check "map renders" "Leaflet|Tap a number|Loading stations|No stations in this view|OpenStreetMap" 60
else bad "map: view toggle"; fi

# Login (wrong password on purpose: proves the real auth service answers inside the app)
adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity >/dev/null
waitfor "Sign in" 90
if tap "^Sign in$"; then
  waitfor "Password" 45
  tap "^Email" && adb shell input text "app-smoke-test@example.com"
  tap "^Password" && adb shell input text "Wrong-password-1"
  adb shell input keyevent 66; tap "^Sign in$" || true
  check "login: real auth service answers (wrong password rejected)" "don.t match|Check them and try again|Too many|confirm your email" 60
else bad "login: Sign in link"; fi

echo; echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
