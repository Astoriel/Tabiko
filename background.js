// --- Context Menu Management ---

async function updateContextMenus() {
  await chrome.contextMenus.removeAll();

  // Root Item
  chrome.contextMenus.create({
    id: "tab-saver-root",
    title: "Tabiko: Save Link",
    contexts: ["link", "page"]
  });

  // Load workspaces
  const data = await chrome.storage.local.get('workspaces');
  const workspaces = data.workspaces || {};
  const workspaceNames = Object.keys(workspaces);

  if (workspaceNames.length === 0) {
    chrome.contextMenus.create({
      parentId: "tab-saver-root",
      id: "no-workspaces",
      title: "No workspaces created",
      enabled: false,
      contexts: ["link", "page"]
    });
  } else {
    for (const name of workspaceNames) {
      chrome.contextMenus.create({
        parentId: "tab-saver-root",
        id: `save-to-ws-${name}`,
        title: name,
        contexts: ["link", "page"]
      });
    }
  }
}

// Initialize
chrome.runtime.onInstalled.addListener(updateContextMenus);
chrome.runtime.onStartup.addListener(updateContextMenus);

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'UPDATE_CONTEXT_MENUS') {
    updateContextMenus();
  }
});

// --- Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('save-to-ws-')) return;

  const targetWorkspace = info.menuItemId.replace('save-to-ws-', '');
  const data = await chrome.storage.local.get('workspaces');
  const allData = data.workspaces || {};

  if (!allData[targetWorkspace]) return;

  // 1. URL
  const url = info.linkUrl || info.pageUrl;
  
  // 2. Title logic
  let title = info.selectionText; 

  if (!title) {
      if (info.linkUrl) {
          title = info.linkUrl; 
      } else {
          title = tab.title;
      }
  }

  // 3. ID Generation
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

  allData[targetWorkspace].tabs.push({
    id: uniqueId,
    type: 'tab',
    url: url,
    title: title,
    notes: []
  });

  await chrome.storage.local.set({ workspaces: allData });

  // --- ВАЖНОЕ ИЗМЕНЕНИЕ: Сообщаем Sidepanel, что нужно обновиться ---
  // .catch нужен, чтобы не было ошибки в консоли, если панель закрыта
  chrome.runtime.sendMessage({ action: 'REFRESH_DATA' }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});