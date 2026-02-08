# TS Open Chrome Tools

Local Chrome extension (Manifest V3) for renaming tabs and managing tab groups, with no third-party dependencies.

## Core Details

### Scope

- Rename active tab title on demand.
- Save a persistent rename rule per `origin + pathname`.
- Auto-reapply saved title rules on page reload/navigation.
- Create or update a tab group for the active tab with group name + color.
- Apply title + group settings together in one action.
- Right-click a page (or the extension action) and open the same extension popup UI for that tab.

### Key Behavior

- Rules are stored in `chrome.storage.local` under `titleRules`.
- Rule matching intentionally ignores query strings and hashes.
- Rename logic uses `chrome.scripting.executeScript` to set `document.title`.
- A lightweight title lock reapplies every 500 ms to handle sites that overwrite titles.
- Group actions use `chrome.tabs.group` and `chrome.tabGroups.update`.
- The action popup shell (including outer corner shape) is browser-controlled by Chrome.

### Files

- `/Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/manifest.json`
- `/Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/background.js`
- `/Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/popup.html`
- `/Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/popup.css`
- `/Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/popup.js`

### Permissions (Manifest)

- `tabs`: read active tab metadata and place tab into groups.
- `scripting`: inject runtime function to set/restore `document.title`.
- `storage`: persist rename rules locally.
- `tabGroups`: read and update tab group title/color.
- `host_permissions` (`http://*/*`, `https://*/*`): inject/reapply on normal web pages.

### Privacy

- No external network calls are made by extension code.
- No analytics, tracking, or remote scripts.
- User data lives in local extension storage.

## Setup Instructions

### 1. Open Project Folder

```bash
cd /Users/tsmith/dev/codex-workspace/ts-open-chrome-tools
pwd
ls -la
```

### 2. Validate JavaScript Syntax

```bash
node --check /Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/background.js
node --check /Users/tsmith/dev/codex-workspace/ts-open-chrome-tools/popup.js
```

### 3. Load As Unpacked Extension

1. Open Chrome at `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select:
   - `/Users/tsmith/dev/codex-workspace/ts-open-chrome-tools`

### 4. Pin And Run

1. Pin **TS Open Chrome Tools** from the extensions menu.
2. Open any `http` or `https` page.
3. Open the extension popup.
4. Enter title and group settings.
5. Click **Apply Title + Group**.

### 4b. Rename From Context Menu

1. Right-click anywhere in the page, or right-click the extension action icon.
2. Click **Rename current tab**.
3. The extension opens the same action popup UI, pre-targeted to that tab.

### 5. Reload After Edits

1. Return to `chrome://extensions`.
2. Click **Reload** on this extension.
3. Open the popup and confirm the footer shows `v1.0.4`.
4. Re-test popup actions.

## Extended Reference

### Architecture And Runtime Flow

#### Background Service Worker (`background.js`)

- Handles all privileged operations via message passing from popup:
  - `getTabState`
  - `applyOnce`
  - `saveRule`
  - `clearRule`
  - `restoreTab`
  - `getGroupState`
  - `assignGroup`
- Applies saved rename rule on `chrome.tabs.onUpdated` when page load reaches `complete`.
- Normalizes and validates group colors against Chrome-supported enum values.
- Converts raw page URL to stable rule key: `origin + pathname`.

#### Popup UI (`popup.html`, `popup.css`, `popup.js`)

- Presents focused controls for title and group operations.
- Shows dynamic context:
  - host chip
  - saved-rule badge
  - group-state badge
  - live preview (title + group color/name)
- Uses clear action hierarchy:
  - primary: `Apply Title + Group`
  - secondary: `Apply Once`, `Save Rule`, `Restore Title`, `Apply Group Only`
  - advanced/destructive: `Clear Saved Rule` with confirmation
- Uses keyboard convenience:
  - Enter in title field prefers primary action when available.

### Reasoning Behind Design Choices

- Rule key = `origin + pathname`: stable enough to be useful, avoids accidental fragmentation by query params.
- Persistent title lock: pragmatic workaround because many pages update `document.title` after load.
- Combined primary action: common workflow is "rename + group", so single-click path reduces friction.
- Separate advanced clear action: prevents accidental loss of saved rules.
- Local-only storage: keeps trust model simple and auditable.

### Known Constraints

- Restricted pages cannot be scripted (`chrome://*`, Chrome Web Store, and other protected contexts).
- Chrome extension APIs do not support adding custom items to the native tab-strip right-click menu.
- Outer popup shell corners are Chrome-controlled in action popup mode.
- Fully square outer corners require a dedicated extension tab/window UI instead of `chrome.action` popup UI.
- Extension can modify page title content, not Chrome tab-strip UI opacity/background.
- Group styling is limited to Chrome's predefined tab group color set.
- Auto-reapply is best-effort and may be blocked by page or browser restrictions.

### Troubleshooting

- Popup buttons disabled:
  - verify current page is `http` or `https`
  - reload extension at `chrome://extensions`
- Title changes do not stick:
  - some apps aggressively rewrite title; extension lock should reapply
  - if blocked, page is likely a restricted context
- Group action fails:
  - ensure tab is in a normal window context and extension is enabled

### Sources

- [Manifest file format (MV3)](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Manifest version](https://developer.chrome.com/docs/extensions/reference/manifest/manifest-version)
- [Declare permissions (MV3)](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [chrome.scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [chrome.tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [chrome.tabGroups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [chrome.action API](https://developer.chrome.com/docs/extensions/reference/api/action)
- [Add a popup (Chrome extensions)](https://developer.chrome.com/docs/extensions/develop/ui/add-popup)
- [chrome.contextMenus API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)
- [Chromium `ExtensionPopup` bubble/frame handling](https://chromium.googlesource.com/chromium/src/%2B/94bb145ae694ec26c0139993be5298705f361f10%5E%21/)

### Notes On Sources

- Sources above are official Chrome for Developers references.
- Runtime restriction details for protected pages are reflected both in Chrome docs (permissions/schemes) and in observed Chrome runtime errors handled by this extension.
