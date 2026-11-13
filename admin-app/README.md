# designedbykoda admin (Windows app)

The owner's desktop app: orders, calendars, firmware releases and the status page in one window.

- `designedbykoda-admin.exe` is one file. Keep it in this project folder (next to `firmware.bat`) and it
  finds the project by itself; anywhere else, set the folder in the app's Settings.
- It runs a small private server on this PC (127.0.0.1 only) and opens its screens in a Microsoft Edge
  app window with its own profile.
- Orders, calendars and incidents go through the site's owner-only API (`src/pages/api/admin/app/`),
  with the same password as `/admin`. The PC keeps a 30-day sign-in token, not the password.
- Firmware releases run `scripts/firmware-release.mjs` here, then commit and push, exactly like
  `firmware.bat`. They need Git, Node.js and the signing key on this PC.
- Settings and a log live in `%APPDATA%\designedbykoda-admin`.

## Build

Needs Go 1.22 or newer. No other dependencies.

```
cd admin-app
GOOS=windows GOARCH=amd64 go build -ldflags "-H windowsgui -s -w" -o designedbykoda-admin.exe
```

`rsrc_windows_amd64.syso` holds the icon (made from `ui/favicon.ico` with github.com/akavel/rsrc).
The screens are plain HTML, CSS and JavaScript in `ui/`, built into the exe.
