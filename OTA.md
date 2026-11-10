# Over-the-air firmware updates

## How it keeps calendars safe
- **Two app slots.** An update downloads into the slot the calendar isn't running from. The old version is never touched while that happens, so a dropped download or a flat battery changes nothing.
- **Checked before it's switched on.** The calendar checks four things: the exact size, the SHA-256 hash, an ECDSA signature made with your private key, and the `DBK-EINK-OTA-1` marker. The marker proves the build can update itself again. If anything fails, it carries on as before.
- **On trial after switching.** The bootloader (rollback is on in ESP32 core 3.x) boots the new version as "pending". To be kept, it has to reach the server, get a screen and download the start of its own `/fw/<version>.bin`, all on that first boot.
- **Automatic switch back.** The old version comes back by itself if the new one:
    - crashes or resets
    - hangs for 4 minutes
    - can't prove itself
- **Old slot reused only later.** It's overwritten only by the *next* update, after the current one has been kept.
- **Repeat failures.** A version that fails 3 times on a calendar isn't tried again unless you click **Update now**.
- **Battery threshold.** Below about 3.55 V (≈25%) it won't install. If you clicked Update now, the screen says "Charge first."
- **Emergency revert.** `revert` sends an older version to every calendar on a channel.

The one thing this can't save you from is a version that *works* (it checks in fine) but has broken update code. That's why every release goes to beta on your own calendar first, and why you test step 4 below on every release.

## One-time setup
1. **Arduino IDE:** use ESP32 core **3.x** (Boards Manager, "esp32 by Espressif"). Then set Tools > Partition Scheme to **Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)**.
    - Calendars must ship with this. A partition scheme can't be changed over the air.
    - It reformats the LittleFS area once on first boot. That's fine: it's only the saved frame.
2. **Make the signing key once, ever:** `node scripts/firmware-keys.mjs`.
    - Back up `~/.designedbykoda/firmware-signing-key.pem` somewhere offline. Lose it and shipped calendars can never be updated again.
    - Paste the printed public key into `OTA_PUBLIC_KEY` in the sketch.
3. **Run the migration:** `npx wrangler d1 execute eink-calendar-db --remote --file=schema-ota.sql`.
4. **Put your own calendar on beta:** `npx wrangler d1 execute eink-calendar-db --remote --command="UPDATE devices SET fw_channel='beta' WHERE id='<your device id>'"`.

## The easy way: firmware.bat
Double-click `firmware.bat` in the repo folder. It pulls the latest, shows what each channel runs and the last 5 versions, and then lets you:
- **release a new version:** pick the exported `main_partial.ino.bin`, the version number (it suggests the next one) and the notes, then beta or everyone, and automatic or Update now only
- **send the beta version to everyone**
- **emergency revert**
- **list all versions**

It commits, pushes and waits for the deploy. It remembers where your .bin is. The steps below are what it does for you.

## Every release (by hand)
1. Bump `FW_VERSION` in the sketch (PATCH, MINOR or MAJOR, as the comment says), then Sketch > Export Compiled Binary.
2. Add the build: `node scripts/firmware-release.mjs add build/esp32.esp32.XIAO_ESP32C3/main_partial.ino.bin --version 1.0.1 --notes "What changed"`.
    - It refuses wrong files.
    - It refuses a build without the marker or with a different public key.
    - It refuses a version number that's already been used.
3. Send it to beta: `node scripts/firmware-release.mjs send 1.0.1 --channel beta`. Commit and deploy.
4. **Test on your calendar** with the USB serial monitor open:
    - **Update now:** click it on the dashboard, then press the button. The progress bar fills, the calendar restarts, and the log shows `works. Keeping it.` My devices then says Firmware 1.0.1.
    - **The next update still works.** Add and send a throwaway 1.0.2 to beta. If 1.0.1 can update to 1.0.2, its update code is fine. Then send the real next version as normal.
    - **Rollback, once per major change:** build a test version with `otaConfirmIfPending` changed to always return early. Add it, send it to beta and install it. It should go back to the previous version within a minute.
5. Send it to everyone: `node scripts/firmware-release.mjs send 1.0.1 --channel stable` (add `--manual` to make it Update now only). Commit and deploy.

## If a release is bad
`node scripts/firmware-release.mjs revert 1.0.0 --channel stable`, then commit and deploy. Every calendar goes back on its next wake, no clicking.

## Later: a factory recovery app (optional)
For extra insurance, an ESP-IDF build could add a small "factory" partition holding a recovery app. You'd enter it by holding the button at power-on, and all it does is download the current stable firmware. It needs a custom partition table, and it only helps if the bootloader rollback above ever fails. Not needed to ship.
