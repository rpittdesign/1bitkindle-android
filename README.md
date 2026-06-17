# PixelScribe — Android

Android sideload build of [PixelScribe](https://github.com/rpittdesign/pixel-dither-studio).
The web version lives in its own repo and is unchanged.

## What’s different from the web version

The **Share** button saves the PNG directly to `Pictures/PixelScribe/` on your device
instead of uploading to Netlify and generating a QR code.

## Install

1. Download the APK from the latest [Actions](../../actions) run → artifact `pixelscribe-android`
2. Enable “Install from unknown sources” on your Android device
3. Tap the APK to install

## Source

Forked from `pixel-dither-studio`. Only `PixelScribeApp.tsx` (export handler) is modified.
