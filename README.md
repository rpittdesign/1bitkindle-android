# 1-bit Kindle — Android

Sideloadable Android app wrapping the [1bitkindle.com](http://1bitkindle.com) drawing tool.

## Download APK

1. Go to **Actions** → latest workflow run → **Artifacts** → download `1bitkindle-debug.zip`
2. Unzip → install `app-debug.apk` on your Android device (enable "Install from unknown sources")

## What's changed vs. the web version

- **Export PNG** saves directly to `Pictures/1bitkindle/` on your device instead of triggering a browser download
- Works offline — no internet needed once installed

## Build locally

Requires Android Studio / Android SDK + JDK 17.

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

## Source

Drawing app source: [rpittdesign/robpitt-design/1bitkindle](https://github.com/rpittdesign/robpitt-design)
