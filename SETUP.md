# Ember — Google Sheet sync setup (once, ~5 minutes)

Ember keeps everything on the device and syncs it to a Google Sheet in your Drive, so the
phone and the laptop see the same log. Without this, Ember still works — just per device.

## 1. Create the sheet
1. Go to <https://sheets.new> (signed in to your Google account).
2. Name it **Ember** (any name works).

## 2. Add the script
1. In the sheet: **Extensions → Apps Script**.
2. Delete what's in `Code.gs` and paste the whole of [`apps-script/Code.gs`](apps-script/Code.gs).
3. On the `SECRET` line, replace `PASTE-YOUR-OWN-LONG-RANDOM-KEY-HERE` with a long random text
   (e.g. mash the keyboard for 30+ characters). Keep it — you'll paste it into Ember.
4. Click **Save** (disk icon).

## 3. Deploy it
1. **Deploy → New deployment**. Click the gear next to "Select type" → **Web app**.
2. Description: `Ember`. **Execute as: Me**. **Who has access: Anyone**.
   ("Anyone" is needed so Ember can reach it without a Google sign-in pop-up; the secret key
   is what keeps others out.)
3. Click **Deploy**, then **Authorize access** and allow it with your Google account.
   Google will warn that the app isn't verified — it's your own script: **Advanced → Go to … (unsafe)**.
4. Copy the **Web app URL** (ends in `/exec`).

## 4. Connect Ember
On each device: open Ember → tap the ember → **Settings** → paste the **Web app URL** and the
**Sync key** (your SECRET) → **Save & sync now**. The sheet gets two tabs, **Log** and **Items**.

Ember then syncs by itself a few seconds after each change and whenever you reopen it.

## If you change the script later
Use **Deploy → Manage deployments → ✎ → Version: New version → Deploy** so the URL stays the same.
