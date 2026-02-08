const GROUP_COLOR_HEX = Object.freeze({
  grey: "#7e8791",
  blue: "#4b82ff",
  red: "#e34b4e",
  yellow: "#c7a117",
  green: "#2da56b",
  pink: "#d75ba7",
  purple: "#8a63db",
  cyan: "#1ba8ba",
  orange: "#e98a37"
});

const elements = {
  hostValue: document.getElementById("hostValue"),
  urlValue: document.getElementById("urlValue"),
  ruleBadge: document.getElementById("ruleBadge"),
  groupBadge: document.getElementById("groupBadge"),
  titleInput: document.getElementById("titleInput"),
  applyOnceBtn: document.getElementById("applyOnceBtn"),
  saveRuleBtn: document.getElementById("saveRuleBtn"),
  clearRuleBtn: document.getElementById("clearRuleBtn"),
  restoreBtn: document.getElementById("restoreBtn"),
  groupTitleInput: document.getElementById("groupTitleInput"),
  groupColorSelect: document.getElementById("groupColorSelect"),
  applyGroupBtn: document.getElementById("applyGroupBtn"),
  applyTitleAndGroupBtn: document.getElementById("applyTitleAndGroupBtn"),
  previewTitle: document.getElementById("previewTitle"),
  previewGroupName: document.getElementById("previewGroupName"),
  previewColor: document.getElementById("previewColor"),
  status: document.getElementById("status"),
  versionValue: document.getElementById("versionValue")
};

let activeTab = null;
let supported = false;
let savedTitle = "";
let busy = false;
let inGroup = false;
let currentGroupTitle = "";
let currentGroupColor = "blue";

function setStatus(message, kind = "info") {
  elements.status.textContent = message;
  elements.status.className = `status ${kind}`;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  updateButtons();
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function renderVersion() {
  const version = chrome.runtime.getManifest()?.version;
  if (!version) {
    elements.versionValue.textContent = "";
    return;
  }
  elements.versionValue.textContent = `v${version}`;
}

function getRequestedTabIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const rawTabId = params.get("tabId");
  const parsed = Number(rawTabId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function getRequestedTabIdFromLaunchContext() {
  try {
    const response = await sendMessage({ type: "consumeLaunchContext" });
    if (!response?.ok) {
      return null;
    }
    const parsed = Number(response.tabId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function resolveInitialTab() {
  const requestedTabId = getRequestedTabIdFromQuery();
  if (requestedTabId !== null) {
    try {
      const targetTab = await chrome.tabs.get(requestedTabId);
      if (targetTab && typeof targetTab.id === "number") {
        return targetTab;
      }
    } catch {
      // Fall back to default active-tab lookup below.
    }
  }

  const contextTabId = await getRequestedTabIdFromLaunchContext();
  if (contextTabId !== null) {
    try {
      const targetTab = await chrome.tabs.get(contextTabId);
      if (targetTab && typeof targetTab.id === "number") {
        return targetTab;
      }
    } catch {
      // Fall back to default active-tab lookup below.
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && typeof tab.id === "number") {
    return tab;
  }

  return null;
}

function getTrimmedTitle() {
  return elements.titleInput.value.trim();
}

function getTrimmedGroupTitle() {
  return elements.groupTitleInput.value.trim();
}

function truncate(value, maxLength = 20) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function getHostLabel(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "Current page";
  }
}

function getColorHex(colorName) {
  return GROUP_COLOR_HEX[colorName] || GROUP_COLOR_HEX.blue;
}

function updateButtons() {
  const hasTab = Boolean(activeTab && activeTab.id);
  const hasRenameInput = getTrimmedTitle().length > 0;
  const disableRename = busy || !hasTab || !supported;
  const disableGroup = busy || !hasTab;

  elements.titleInput.disabled = disableRename;
  elements.applyOnceBtn.disabled = disableRename || !hasRenameInput;
  elements.saveRuleBtn.disabled = disableRename || !hasRenameInput;
  elements.restoreBtn.disabled = disableRename;
  elements.clearRuleBtn.disabled = disableRename || !savedTitle;

  elements.groupTitleInput.disabled = disableGroup;
  elements.groupColorSelect.disabled = disableGroup;
  elements.applyGroupBtn.disabled = disableGroup;
  elements.applyTitleAndGroupBtn.disabled = disableGroup || !supported || !hasRenameInput;
}

function updateBadges() {
  if (!supported) {
    elements.ruleBadge.textContent = "Rename locked";
  } else if (!savedTitle) {
    elements.ruleBadge.textContent = "Rule: none";
  } else if (getTrimmedTitle() && getTrimmedTitle() !== savedTitle) {
    elements.ruleBadge.textContent = "Rule: saved, edited";
  } else {
    elements.ruleBadge.textContent = "Rule: saved";
  }

  const draftGroupTitle = getTrimmedGroupTitle();
  if (inGroup && draftGroupTitle !== currentGroupTitle) {
    elements.groupBadge.textContent = "Group: edited";
  } else if (inGroup) {
    const label = currentGroupTitle ? truncate(currentGroupTitle) : "Untitled";
    elements.groupBadge.textContent = `Group: ${label}`;
  } else if (draftGroupTitle) {
    elements.groupBadge.textContent = "Group: new";
  } else {
    elements.groupBadge.textContent = "Ungrouped";
  }
}

function updatePreview() {
  const previewTitle = getTrimmedTitle() || "Tab title preview";
  const previewGroupTitle = getTrimmedGroupTitle() || currentGroupTitle || "Ungrouped";
  const selectedColor = elements.groupColorSelect.value || currentGroupColor || "blue";

  elements.previewTitle.textContent = previewTitle;
  elements.previewGroupName.textContent = previewGroupTitle;
  elements.previewColor.style.backgroundColor = getColorHex(selectedColor);
}

function refreshDynamicUI() {
  updateButtons();
  updateBadges();
  updatePreview();
}

async function initialize() {
  try {
    const tab = await resolveInitialTab();
    if (!tab || !tab.id) {
      setStatus("No active tab found.", "error");
      refreshDynamicUI();
      return;
    }

    activeTab = tab;
    elements.urlValue.textContent = tab.url || "(no URL)";
    elements.hostValue.textContent = getHostLabel(tab.url || "");

    let statusMessage = "Enter a title, then apply title and group together.";
    let statusKind = "info";

    const renameState = await sendMessage({
      type: "getTabState",
      url: tab.url || ""
    });

    if (!renameState?.ok) {
      supported = false;
      savedTitle = "";
      elements.titleInput.value = tab.title || "";
      statusMessage = `Rename controls unavailable: ${renameState?.error || "unknown error."}`;
      statusKind = "error";
    } else {
      supported = renameState.supported;
      savedTitle = renameState.savedTitle || "";
      elements.titleInput.value = savedTitle || tab.title || "";
      if (savedTitle) {
        statusMessage = "Loaded saved rename rule for this page path.";
      }
      if (!supported) {
        statusMessage = "Rename is disabled on this page type, but group controls still work.";
        statusKind = "error";
      }
    }

    const groupState = await sendMessage({
      type: "getGroupState",
      tabId: tab.id
    });

    if (!groupState?.ok) {
      inGroup = false;
      currentGroupTitle = "";
      currentGroupColor = "blue";
      elements.groupTitleInput.value = "";
      elements.groupColorSelect.value = "blue";
      if (statusKind !== "error") {
        statusMessage = `Group state unavailable: ${groupState?.error || "unknown error."}`;
        statusKind = "error";
      }
    } else if (groupState.inGroup) {
      inGroup = true;
      currentGroupTitle = groupState.title || "";
      currentGroupColor = groupState.color || "blue";
      elements.groupTitleInput.value = currentGroupTitle;
      elements.groupColorSelect.value = currentGroupColor;
    } else {
      inGroup = false;
      currentGroupTitle = "";
      currentGroupColor = "blue";
      elements.groupTitleInput.value = "";
      elements.groupColorSelect.value = "blue";
    }

    setStatus(statusMessage, statusKind);
    refreshDynamicUI();
  } catch (error) {
    setStatus(error?.message || "Initialization failed.", "error");
    refreshDynamicUI();
  }
}

elements.titleInput.addEventListener("input", refreshDynamicUI);
elements.groupTitleInput.addEventListener("input", refreshDynamicUI);
elements.groupColorSelect.addEventListener("change", refreshDynamicUI);

elements.titleInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }
  if (!elements.applyTitleAndGroupBtn.disabled) {
    event.preventDefault();
    elements.applyTitleAndGroupBtn.click();
    return;
  }
  if (!elements.applyOnceBtn.disabled) {
    event.preventDefault();
    elements.applyOnceBtn.click();
  }
});

elements.groupTitleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !elements.applyGroupBtn.disabled) {
    event.preventDefault();
    elements.applyGroupBtn.click();
  }
});

elements.applyOnceBtn.addEventListener("click", async () => {
  const title = getTrimmedTitle();
  if (!title) {
    setStatus("Title cannot be empty.", "error");
    return;
  }

  setBusy(true);
  try {
    const response = await sendMessage({
      type: "applyOnce",
      tabId: activeTab.id,
      title
    });

    if (!response?.ok) {
      setStatus(response?.error || "Failed to apply title.", "error");
      return;
    }
    setStatus("Applied title to the active tab.", "success");
  } catch (error) {
    setStatus(error?.message || "Failed to apply title.", "error");
  } finally {
    setBusy(false);
    refreshDynamicUI();
  }
});

elements.saveRuleBtn.addEventListener("click", async () => {
  const title = getTrimmedTitle();
  if (!title) {
    setStatus("Title cannot be empty.", "error");
    return;
  }

  setBusy(true);
  try {
    const saveResponse = await sendMessage({
      type: "saveRule",
      url: activeTab.url || "",
      title
    });

    if (!saveResponse?.ok) {
      setStatus(saveResponse?.error || "Failed to save rule.", "error");
      return;
    }

    const applyResponse = await sendMessage({
      type: "applyOnce",
      tabId: activeTab.id,
      title
    });

    savedTitle = title;
    if (!applyResponse?.ok) {
      setStatus(
        `Saved rule, but applying title failed: ${applyResponse?.error || "unknown error."}`,
        "error"
      );
      return;
    }

    setStatus("Saved and applied rule for this page path.", "success");
  } catch (error) {
    setStatus(error?.message || "Failed to save rule.", "error");
  } finally {
    setBusy(false);
    refreshDynamicUI();
  }
});

elements.clearRuleBtn.addEventListener("click", async () => {
  if (!savedTitle) {
    setStatus("No saved rule exists for this page path.", "info");
    return;
  }

  const shouldClear = window.confirm("Clear the saved rename rule for this page path?");
  if (!shouldClear) {
    return;
  }

  setBusy(true);
  try {
    const response = await sendMessage({
      type: "clearRule",
      url: activeTab.url || ""
    });

    if (!response?.ok) {
      setStatus(response?.error || "Failed to clear rule.", "error");
      return;
    }
    savedTitle = "";
    setStatus("Cleared saved rename rule.", "success");
  } catch (error) {
    setStatus(error?.message || "Failed to clear rule.", "error");
  } finally {
    setBusy(false);
    refreshDynamicUI();
  }
});

elements.restoreBtn.addEventListener("click", async () => {
  setBusy(true);
  try {
    const response = await sendMessage({
      type: "restoreTab",
      tabId: activeTab.id
    });

    if (!response?.ok) {
      setStatus(response?.error || "Failed to restore tab title.", "error");
      return;
    }
    setStatus("Restored the active tab to its original title.", "success");
  } catch (error) {
    setStatus(error?.message || "Failed to restore tab title.", "error");
  } finally {
    setBusy(false);
    refreshDynamicUI();
  }
});

elements.applyGroupBtn.addEventListener("click", async () => {
  setBusy(true);
  try {
    const response = await sendMessage({
      type: "assignGroup",
      tabId: activeTab.id,
      title: getTrimmedGroupTitle(),
      color: elements.groupColorSelect.value
    });

    if (!response?.ok) {
      setStatus(response?.error || "Failed to apply group settings.", "error");
      return;
    }

    inGroup = true;
    currentGroupTitle = response.title || "";
    currentGroupColor = response.color || elements.groupColorSelect.value || "blue";
    elements.groupTitleInput.value = currentGroupTitle;
    elements.groupColorSelect.value = currentGroupColor;

    if (response.createdGroup) {
      setStatus("Created tab group and applied color/name.", "success");
    } else {
      setStatus("Updated tab group name and color.", "success");
    }
  } catch (error) {
    setStatus(error?.message || "Failed to apply group settings.", "error");
  } finally {
    setBusy(false);
    refreshDynamicUI();
  }
});

elements.applyTitleAndGroupBtn.addEventListener("click", async () => {
  const title = getTrimmedTitle();
  if (!title) {
    setStatus("Title cannot be empty.", "error");
    return;
  }

  setBusy(true);
  try {
    const renameResponse = await sendMessage({
      type: "applyOnce",
      tabId: activeTab.id,
      title
    });

    if (!renameResponse?.ok) {
      setStatus(renameResponse?.error || "Failed to apply title.", "error");
      return;
    }

    const groupResponse = await sendMessage({
      type: "assignGroup",
      tabId: activeTab.id,
      title: getTrimmedGroupTitle(),
      color: elements.groupColorSelect.value
    });

    if (!groupResponse?.ok) {
      setStatus(
        `Title applied, but group update failed: ${groupResponse?.error || "unknown error."}`,
        "error"
      );
      return;
    }

    inGroup = true;
    currentGroupTitle = groupResponse.title || "";
    currentGroupColor = groupResponse.color || elements.groupColorSelect.value || "blue";
    elements.groupTitleInput.value = currentGroupTitle;
    elements.groupColorSelect.value = currentGroupColor;
    setStatus("Applied title and group settings together.", "success");
  } catch (error) {
    setStatus(error?.message || "Failed to apply title and group settings.", "error");
  } finally {
    setBusy(false);
    refreshDynamicUI();
  }
});

initialize();
renderVersion();
