# Publishing Notes (Future)

This project is currently used as a personal unpacked extension.  
Publishing is optional and can be done later if you want auto-updates and public install.

## Current Status

- Local usage only (unpacked extension).
- Open-source publishing target: personal GitHub.
- Chrome Web Store publishing target: personal Google account (not tied to GitHub account).

## Is Publishing Worth It?

Publish if you want:

1. Easy installs for other people.
2. Automatic updates.
3. Public trust via open-source code + clear privacy posture.

Skip publishing if you only need this on your own machine and want zero review overhead.

## What Is Required To Publish

1. A Chrome Web Store developer account (one-time registration).
2. Two-step verification enabled on the Google account.
3. A complete store listing (description, screenshots, icons).
4. Privacy disclosures and permission justifications.
5. A zipped extension package from this repo root.

## Suggested Future Workflow

1. Push this extension to a personal GitHub repo.
2. Keep a clear `README.md` and `LICENSE`.
3. Create a short `PRIVACY.md` (or hosted privacy page).
4. For each release:
   1. Bump `manifest.json` version.
   2. Zip extension files.
   3. Upload to Chrome Web Store dashboard.
   4. Submit review and publish when approved.

## Packaging Commands (When Ready)

Run from:

```bash
cd /Users/tsmith/dev/codex-workspace/ts-open-chrome-tools
```

Optional local checks:

```bash
node --check /Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/background.js
node --check /Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/popup.js
```

Create a release zip:

```bash
cd /Users/tsmith/dev/codex-workspace
zip -r ts-open-chrome-tools-v1.0.4.zip ts-open-chrome-tools \
  -x "*/.DS_Store" "*/.git/*" "*/node_modules/*"
```

## Review Notes For This Extension

This extension requests:

- `tabs`
- `storage`
- `scripting`
- `tabGroups`
- `contextMenus`
- `host_permissions` for `http://*/*` and `https://*/*`

Those are legitimate for current features, but broad host permissions can trigger additional review scrutiny.  
Keep the privacy statement explicit:

1. No external network calls.
2. No analytics/tracking.
3. Data stored locally in extension storage.

## Known UX Constraint To Document Publicly

In `chrome.action` popup mode, Chrome controls the outer popup shell/frame appearance (including corner shape).  
Extension CSS can style the inner content, not fully override browser shell geometry.

## If Staying Personal-Only (Recommended For Now)

Use unpacked install only:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked:
   - `/Users/tsmith/dev/codex-workspace/ts-open-chrome-tools`
4. Click Reload after any local change.

## Reference Links

- [Chrome Web Store: Register as a developer](https://developer.chrome.com/docs/webstore/register/)
- [Chrome Web Store: Publish](https://developer.chrome.com/docs/webstore/publish)
- [Chrome Web Store: Review process](https://developer.chrome.com/docs/webstore/review-process/)
- [Chrome Web Store: Two-step verification policy](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)
- [Chrome extensions: Add a popup](https://developer.chrome.com/docs/extensions/develop/ui/add-popup)
