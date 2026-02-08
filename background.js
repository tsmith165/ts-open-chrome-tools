const STORAGE_KEY = "titleRules";
const CONTEXT_MENU_RENAME_TAB_ID = "rename-current-tab-context";
const LAUNCH_CONTEXT_KEY = "launchContext";
const LAUNCH_CONTEXT_TTL_MS = 30_000;
const TAB_GROUP_COLORS = new Set([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange"
]);
let inMemoryLaunchContext = null;

function createRuleKey(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function isScriptableUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

async function getRules() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

async function setRules(rules) {
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
}

async function setLaunchContext(tabId) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    return;
  }
  const context = { tabId, createdAt: Date.now() };
  inMemoryLaunchContext = context;
  try {
    await chrome.storage.session.set({ [LAUNCH_CONTEXT_KEY]: context });
  } catch {
    // Fall back to in-memory context when session storage is unavailable.
  }
}

async function consumeLaunchContext() {
  let context = inMemoryLaunchContext;
  try {
    const data = await chrome.storage.session.get(LAUNCH_CONTEXT_KEY);
    if (data && data[LAUNCH_CONTEXT_KEY]) {
      context = data[LAUNCH_CONTEXT_KEY];
    }
    await chrome.storage.session.remove(LAUNCH_CONTEXT_KEY);
  } catch {
    // Fall back to in-memory context when session storage is unavailable.
  }
  inMemoryLaunchContext = null;

  const tabId = Number(context?.tabId);
  const createdAt = Number(context?.createdAt);
  if (!Number.isInteger(tabId) || tabId <= 0 || !Number.isFinite(createdAt)) {
    return { ok: true, tabId: null };
  }
  if (Date.now() - createdAt > LAUNCH_CONTEXT_TTL_MS) {
    return { ok: true, tabId: null };
  }
  return { ok: true, tabId };
}

function normalizeError(error) {
  if (!error) {
    return "Unknown error.";
  }
  const message = typeof error === "string" ? error : error.message;
  if (!message) {
    return "Unknown error.";
  }
  if (message.includes("Cannot access a chrome:// URL")) {
    return "Chrome internal pages cannot be renamed.";
  }
  if (message.includes("The extensions gallery cannot be scripted")) {
    return "Chrome Web Store pages cannot be renamed.";
  }
  if (message.includes("No tab with id")) {
    return "That tab is no longer available.";
  }
  return message;
}

function normalizeGroupColor(rawColor) {
  const color = String(rawColor || "").trim().toLowerCase();
  if (!TAB_GROUP_COLORS.has(color)) {
    return null;
  }
  return color;
}

function titleLocker(action, customTitle) {
  const stateKey = "__tsOpenChromeTitleState";
  const existing = window[stateKey] || {};

  if (action === "set") {
    const normalizedTitle = String(customTitle || "").trim();
    if (!normalizedTitle) {
      return { ok: false, error: "Title cannot be empty." };
    }

    if (typeof existing.originalTitle !== "string") {
      existing.originalTitle = document.title;
    }
    existing.customTitle = normalizedTitle;

    const applyTitle = () => {
      if (document.title !== existing.customTitle) {
        document.title = existing.customTitle;
      }
    };

    applyTitle();
    if (!existing.timerId) {
      existing.timerId = window.setInterval(applyTitle, 500);
    }
    window[stateKey] = existing;
    return { ok: true, title: existing.customTitle };
  }

  if (action === "clear") {
    if (existing.timerId) {
      window.clearInterval(existing.timerId);
    }
    const originalTitle = existing.originalTitle;
    window[stateKey] = {};
    if (typeof originalTitle === "string" && originalTitle.length > 0) {
      document.title = originalTitle;
    }
    return { ok: true, title: document.title };
  }

  return { ok: false, error: "Unknown action." };
}

async function runTitleLocker(tabId, action, customTitle) {
  const injection = await chrome.scripting.executeScript({
    target: { tabId },
    func: titleLocker,
    args: [action, customTitle]
  });
  if (!injection[0] || !injection[0].result) {
    return { ok: false, error: "No response from page script." };
  }
  return injection[0].result;
}

async function applyTitleToTab(tabId, title) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) {
    return { ok: false, error: "Title cannot be empty." };
  }
  try {
    return await runTitleLocker(tabId, "set", normalizedTitle);
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

async function restoreTitleOnTab(tabId) {
  try {
    return await runTitleLocker(tabId, "clear", "");
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

async function applySavedRuleToTab(tabId, rawUrl) {
  const key = createRuleKey(rawUrl);
  if (!key) {
    return { ok: true, skipped: true };
  }
  const rules = await getRules();
  const savedTitle = rules[key];
  if (!savedTitle) {
    return { ok: true, skipped: true };
  }
  return applyTitleToTab(tabId, savedTitle);
}

async function getTabState(rawUrl) {
  const supported = isScriptableUrl(rawUrl);
  const key = createRuleKey(rawUrl);
  if (!supported || !key) {
    return {
      ok: true,
      supported: false,
      key: null,
      savedTitle: ""
    };
  }

  const rules = await getRules();
  return {
    ok: true,
    supported: true,
    key,
    savedTitle: rules[key] || ""
  };
}

async function saveRule(rawUrl, title) {
  const key = createRuleKey(rawUrl);
  const normalizedTitle = String(title || "").trim();
  if (!key) {
    return { ok: false, error: "This page URL is not supported." };
  }
  if (!normalizedTitle) {
    return { ok: false, error: "Title cannot be empty." };
  }

  const rules = await getRules();
  rules[key] = normalizedTitle;
  await setRules(rules);
  return { ok: true, key, title: normalizedTitle };
}

async function clearRule(rawUrl) {
  const key = createRuleKey(rawUrl);
  if (!key) {
    return { ok: false, error: "This page URL is not supported." };
  }

  const rules = await getRules();
  delete rules[key];
  await setRules(rules);
  return { ok: true, key };
}

async function getGroupState(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab) {
    return { ok: false, error: "No active tab found." };
  }

  if (typeof tab.groupId !== "number" || tab.groupId === -1) {
    return {
      ok: true,
      inGroup: false,
      groupId: -1,
      title: "",
      color: "blue"
    };
  }

  const group = await chrome.tabGroups.get(tab.groupId);
  return {
    ok: true,
    inGroup: true,
    groupId: tab.groupId,
    title: group.title || "",
    color: group.color || "blue"
  };
}

async function assignGroup(tabId, title, color) {
  const normalizedColor = normalizeGroupColor(color);
  if (!normalizedColor) {
    return { ok: false, error: "Invalid group color." };
  }

  const tab = await chrome.tabs.get(tabId);
  if (!tab) {
    return { ok: false, error: "No active tab found." };
  }

  const normalizedTitle = String(title || "").trim();
  const wasUngrouped = tab.groupId === -1;
  let groupId = tab.groupId;
  if (wasUngrouped) {
    groupId = await chrome.tabs.group({ tabIds: [tabId] });
  }

  await chrome.tabGroups.update(groupId, {
    title: normalizedTitle,
    color: normalizedColor,
    collapsed: false
  });

  return {
    ok: true,
    groupId,
    title: normalizedTitle,
    color: normalizedColor,
    createdGroup: wasUngrouped
  };
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_RENAME_TAB_ID,
        title: "Rename current tab"
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
  });
}

async function resolveContextTab(tabFromEvent) {
  if (tabFromEvent && typeof tabFromEvent.id === "number") {
    return tabFromEvent;
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function openRenameUiForTab(tabFromEvent) {
  const tab = await resolveContextTab(tabFromEvent);
  if (tab && typeof tab.id === "number") {
    await setLaunchContext(tab.id);
  }

  try {
    if (tab && typeof tab.windowId === "number") {
      await chrome.action.openPopup({ windowId: tab.windowId });
      return;
    }
    await chrome.action.openPopup();
  } catch {
    // If popup cannot be opened programmatically on this Chrome build,
    // user can still open it manually via the action button.
  }
}

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);
setupContextMenus();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) {
    return;
  }
  try {
    await applySavedRuleToTab(tabId, tab.url);
  } catch {
    // Best-effort application to avoid noisy failures in event listeners.
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_RENAME_TAB_ID) {
    return;
  }
  void openRenameUiForTab(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "getTabState":
        sendResponse(await getTabState(message.url));
        break;
      case "applyOnce":
        sendResponse(await applyTitleToTab(message.tabId, message.title));
        break;
      case "saveRule":
        sendResponse(await saveRule(message.url, message.title));
        break;
      case "clearRule":
        sendResponse(await clearRule(message.url));
        break;
      case "restoreTab":
        sendResponse(await restoreTitleOnTab(message.tabId));
        break;
      case "consumeLaunchContext":
        sendResponse(await consumeLaunchContext());
        break;
      case "getGroupState":
        sendResponse(await getGroupState(message.tabId));
        break;
      case "assignGroup":
        sendResponse(await assignGroup(message.tabId, message.title, message.color));
        break;
      default:
        sendResponse({ ok: false, error: "Unknown message type." });
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: normalizeError(error) });
  });

  return true;
});
