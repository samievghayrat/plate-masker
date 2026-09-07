# Plate Masker Android

The Android app opens the production Plate Masker website in a native WebView. Its JavaScript bridge saves individual or selected images directly to `Pictures/Plate Masker` through Android MediaStore. ZIP files are saved to `Downloads/Plate Masker`.

## Build

From the `android` directory, run:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleDebug
```

The installable APK is generated at `app/build/outputs/apk/debug/app-debug.apk`.
