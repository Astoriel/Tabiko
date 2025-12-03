document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const searchInput = document.getElementById('search-input');
  const searchContainer = document.getElementById('search-container');
  const emptyStateMsg = document.getElementById('empty-state-message');
  
  const workspacesListContainer = document.getElementById('workspaces-list-container');
  const newWorkspaceNameInput = document.getElementById('new-workspace-name');
  const addWorkspaceBtn = document.getElementById('add-workspace-btn');
  
  // Buttons
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const saveWindowBtn = document.getElementById('save-window-btn'); // НОВАЯ КНОПКА
  const fileInput = document.getElementById('file-input');
  
  const contextMenu = document.createElement('div');
  contextMenu.id = 'custom-context-menu';
  document.body.appendChild(contextMenu);

  // --- State ---
  let allData = {};
  let contextTarget = null;
  let isInternalDrag = false; 

  // --- Helpers ---
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  // --- UI State Manager ---
  function updateUIState() {
      const workspaceCount = Object.keys(allData).length;
      if (workspaceCount === 0) {
          searchContainer.style.display = 'none';
          emptyStateMsg.style.display = 'block';
          document.body.classList.add('is-empty'); 
      } else {
          searchContainer.style.display = 'block';
          emptyStateMsg.style.display = 'none';
          document.body.classList.remove('is-empty');
      }
  }

  // --- Initialization ---
  async function initialize() {
    const data = await chrome.storage.local.get(['workspaces']);
    allData = data.workspaces || {};

    let needSave = false;
    for (const wsName in allData) {
        if (allData[wsName].tabs) {
            allData[wsName].tabs.forEach(item => {
                if (!item.id) {
                    item.id = generateId();
                    needSave = true;
                }
            });
        }
    }
    if (needSave) await saveData();

    renderAllWorkspaces();
    updateUIState(); 
    addEventListeners();
    chrome.runtime.sendMessage({ action: 'UPDATE_CONTEXT_MENUS' });

    // Listener for background updates (Context Menu adds)
    chrome.runtime.onMessage.addListener(async (request) => {
        if (request.action === 'REFRESH_DATA') {
            const newData = await chrome.storage.local.get(['workspaces']);
            allData = newData.workspaces || {};
            renderAllWorkspaces();
            updateUIState();
        }
    });
  }

  async function saveData() {
    await chrome.storage.local.set({ workspaces: allData });
    updateUIState();
  }

  // --- Rendering ---
  function renderAllWorkspaces() {
    workspacesListContainer.innerHTML = '';
    
    for (const workspaceName in allData) {
      const workspaceDiv = document.createElement('div');
      workspaceDiv.className = 'workspace-container';

      const headerContainer = document.createElement('div');
      headerContainer.className = 'workspace-header-container';
      headerContainer.dataset.workspaceName = workspaceName; 
      
      const title = document.createElement('h3');
      title.className = 'workspace-header';
      title.textContent = workspaceName;
      
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'delete-workspace-icon';
      deleteBtn.textContent = 'x'; 
      deleteBtn.title = 'Delete Workspace';
      deleteBtn.onclick = (e) => {
          e.stopPropagation(); 
          handleDeleteWorkspace(workspaceName);
      };

      headerContainer.appendChild(title);
      headerContainer.appendChild(deleteBtn);
      workspaceDiv.appendChild(headerContainer);

      const tabsList = document.createElement('ul');
      tabsList.className = 'workspace-tabs-list';
      tabsList.dataset.workspaceName = workspaceName;

      attachDragListeners(tabsList, workspaceName);

      const workspaceData = allData[workspaceName];
      if (workspaceData && workspaceData.tabs) {
        workspaceData.tabs.forEach((item) => {
          if (item.type === 'tab') {
            const li = createListItem(item, workspaceName);
            tabsList.appendChild(li);
          }
        });
      }

      workspaceDiv.appendChild(tabsList);
      workspacesListContainer.appendChild(workspaceDiv);

      new Sortable(tabsList, {
        group: 'shared',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onStart: () => { isInternalDrag = true; },
        onEnd: (evt) => {
            isInternalDrag = false;
            handleInternalSort(evt);
        }
      });
    }
  }

  function renderSearchResults(query) {
    const lowerCaseQuery = query.toLowerCase().trim();
    if (!lowerCaseQuery) {
      renderAllWorkspaces();
      return;
    }

    workspacesListContainer.innerHTML = '';
    const resultsList = document.createElement('ul');
    resultsList.className = 'workspace-tabs-list';
    
    let found = false;

    for (const workspaceName in allData) {
        const items = allData[workspaceName].tabs || [];
        items.forEach(item => {
            if (item.type !== 'tab') return;
            const notesText = (item.notes || []).join(' ');
            const searchBase = `${item.title} ${item.url} ${notesText}`.toLowerCase();

            if (searchBase.includes(lowerCaseQuery)) {
                found = true;
                const li = createListItem(item, workspaceName);
                const hint = document.createElement('small');
                hint.style.color = '#999';
                hint.textContent = ` (${workspaceName})`;
                li.querySelector('.link-wrapper').appendChild(hint);
                resultsList.appendChild(li);
            }
        });
    }

    if (!found) {
        workspacesListContainer.innerHTML = '<p style="padding:15px; color:#666; font-size:13px; text-align:center;">No results found.</p>';
    } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'workspace-container';
        wrapper.appendChild(resultsList);
        workspacesListContainer.appendChild(wrapper);
    }
  }

  function createListItem(item, workspaceName) {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.dataset.workspaceName = workspaceName;
    li.dataset.tabId = item.id; 

    li.addEventListener('dblclick', (e) => {
        // Проверка, чтобы не срабатывало при удалении заметок
        if (e.target.classList.contains('delete-note-btn')) return;
        
        // Открываем ссылку в новой активной вкладке
        chrome.tabs.create({ url: item.url, active: true });
      
    const titleDiv = document.createElement('div');
    titleDiv.className = 'link-wrapper';

    // Favicon
    const favicon = document.createElement('img');
    favicon.className = 'link-favicon';
    const urlObj = new URL(chrome.runtime.getURL("/_favicon/"));
    urlObj.searchParams.set("pageUrl", item.url);
    urlObj.searchParams.set("size", "32");
    favicon.src = urlObj.toString();
    favicon.alt = "";
    
    const titleLink = document.createElement('a');
    titleLink.href = item.url;
    titleLink.textContent = item.title || item.url;
    titleLink.target = '_blank';
    
    titleDiv.appendChild(favicon);
    titleDiv.appendChild(titleLink);
    li.appendChild(titleDiv);

    if (item.notes && item.notes.length > 0) {
        const notesContainer = document.createElement('div');
        notesContainer.className = 'notes-container';
        
        item.notes.forEach((noteText, noteIndex) => {
            const noteChip = document.createElement('div');
            noteChip.className = 'note-chip';
            noteChip.textContent = noteText;

            const delNoteBtn = document.createElement('span');
            delNoteBtn.className = 'delete-note-btn';
            delNoteBtn.textContent = 'x';
            delNoteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteNote(workspaceName, item, noteIndex);
            };
            
            noteChip.appendChild(delNoteBtn);
            notesContainer.appendChild(noteChip);
        });
        li.appendChild(notesContainer);
    }
    return li;
  }

  // --- Logic Helpers ---

  async function handleAddWorkspace() {
      if (newWorkspaceNameInput.style.display === 'none') {
          newWorkspaceNameInput.style.display = 'block';
          newWorkspaceNameInput.focus();
          return;
      }
      let name = newWorkspaceNameInput.value.trim();
      if (!name) name = "general";

      let finalName = name;
      let counter = 1;
      while (allData[finalName]) {
          finalName = `${name} ${counter}`;
          counter++;
      }

      allData[finalName] = { tabs: [] };
      await saveData();
      renderAllWorkspaces();
      chrome.runtime.sendMessage({ action: 'UPDATE_CONTEXT_MENUS' });
      newWorkspaceNameInput.value = '';
      newWorkspaceNameInput.style.display = 'none';
  }

  async function renameWorkspace(oldName, newName) {
      if (!newName || newName === oldName) return;
      if (allData[newName]) {
          alert('Workspace already exists.');
          return;
      }
      const newData = {};
      for (let key in allData) {
          if (key === oldName) {
              newData[newName] = allData[oldName];
          } else {
              newData[key] = allData[key];
          }
      }
      allData = newData;
      await saveData();
      renderAllWorkspaces();
      chrome.runtime.sendMessage({ action: 'UPDATE_CONTEXT_MENUS' });
  }

  async function handleDeleteWorkspace(name) {
      if (confirm(`Delete workspace "${name}"?`)) {
          delete allData[name];
          await saveData();
          renderAllWorkspaces();
          chrome.runtime.sendMessage({ action: 'UPDATE_CONTEXT_MENUS' });
      }
  }

  async function deleteNote(workspaceName, itemObj, noteIndex) {
      if(itemObj.notes) {
          itemObj.notes.splice(noteIndex, 1);
          await saveData();
          searchInput.value ? renderSearchResults(searchInput.value) : renderAllWorkspaces();
      }
  }

  // --- Drag/Drop Logic ---

  async function handleInternalSort(event) {
      const fromWS = event.from.dataset.workspaceName;
      const toWS = event.to.dataset.workspaceName;
      if (!fromWS || !toWS) return;

      const [movedItem] = allData[fromWS].tabs.splice(event.oldIndex, 1);
      allData[toWS].tabs.splice(event.newIndex, 0, movedItem);
      
      await saveData();
      event.item.dataset.workspaceName = toWS;
  }

  function attachDragListeners(element, workspaceName) {
      element.addEventListener('dragover', (e) => {
          if (e.dataTransfer.types.includes('text/uri-list') || e.dataTransfer.types.includes('text/plain')) {
              e.preventDefault();
              element.classList.add('drag-hover');
          }
      });
      element.addEventListener('dragleave', () => element.classList.remove('drag-hover'));
      element.addEventListener('drop', async (e) => {
          e.preventDefault();
          element.classList.remove('drag-hover');
          if (isInternalDrag) return;
          
          const url = e.dataTransfer.getData('text/uri-list');
          const title = e.dataTransfer.getData('text/plain') || "New Link";
          
          if (url) {
              const newItem = { 
                  id: generateId(),
                  type: 'tab', 
                  url: url, 
                  title: title, 
                  notes: [] 
              };
              allData[workspaceName].tabs.push(newItem);
              await saveData();
              if (!searchInput.value) renderAllWorkspaces();
          }
      });
  }

  // --- Export / Import ---

  function exportData(specificWorkspaceName = null) {
      let markdown = "";
      markdown += `\n\n`;

      const workspacesToExport = specificWorkspaceName 
          ? [specificWorkspaceName] 
          : Object.keys(allData);

      workspacesToExport.forEach(wsName => {
          if (!allData[wsName]) return;
          markdown += `# ${wsName}\n`;
          const items = allData[wsName].tabs || [];
          items.forEach(item => {
              if (item.type === 'tab') {
                  const cleanTitle = (item.title || "Link").replace(/[\[\]]/g, '');
                  markdown += `- [${cleanTitle}](${item.url})\n`;
                  if (item.notes) {
                      item.notes.forEach(note => markdown += `  - ${note}\n`);
                  }
              }
          });
          markdown += `\n`;
      });

      const fileName = specificWorkspaceName 
          ? `${specificWorkspaceName.replace(/\s+/g, '_')}_backup.md` 
          : 'tab-saver-backup.md';

      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  }

  function importData(file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
          const text = e.target.result;
          const lines = text.split('\n');
          let currentWs = null;
          let currentLink = null;

          for (let line of lines) {
              const wsMatch = line.match(/^#\s+(.+)$/);
              if (wsMatch) {
                  currentWs = wsMatch[1].trim();
                  if (!allData[currentWs]) allData[currentWs] = { tabs: [] };
                  currentLink = null;
                  continue;
              }
              const linkMatch = line.match(/^\s*-\s+\[(.*?)\]\((.*?)\)/);
              if (linkMatch && currentWs) {
                  currentLink = { 
                      id: generateId(),
                      type: 'tab', 
                      url: linkMatch[2], 
                      title: linkMatch[1], 
                      notes: [] 
                  };
                  allData[currentWs].tabs.push(currentLink);
                  continue;
              }
              const noteMatch = line.match(/^\s+-\s+(.+)$/);
              if (noteMatch && currentLink) {
                  const noteText = noteMatch[1].trim();
                  if (!currentLink.notes.includes(noteText)) currentLink.notes.push(noteText);
              }
          }
          await saveData();
          renderAllWorkspaces();
          chrome.runtime.sendMessage({ action: 'UPDATE_CONTEXT_MENUS' });
          alert('Import successful!');
          fileInput.value = '';
      };
      reader.readAsText(file);
  }

  // --- Event Listeners ---

// --- Event Listeners ---

  function addEventListeners() {
    
    // 1. Global Context Menu Handler
    document.addEventListener('contextmenu', (e) => {
        document.querySelectorAll('.context-selected').forEach(el => el.classList.remove('context-selected'));

        // A. Link Item Menu
        const itemTarget = e.target.closest('.list-item');
        if (itemTarget) {
            e.preventDefault();
            itemTarget.classList.add('context-selected');
            const wsName = itemTarget.dataset.workspaceName;
            const tabId = itemTarget.dataset.tabId;
            const item = allData[wsName]?.tabs.find(i => i.id === tabId);
            
            if (item) {
                contextTarget = { type: 'link', item, wsName };
                contextMenu.innerHTML = `
                    <div class="menu-item" data-action="add_note">Add Note</div>
                    <div class="menu-item" data-action="copy_link">Copy URL</div>
                    <div class="menu-separator"></div>
                    <div class="menu-item" data-action="delete_link" style="color:#fa5252">Delete Link</div>
                `;
                showMenu(e.clientX, e.clientY);
            }
            return;
        }

        // B. Workspace Header Menu
        const headerTarget = e.target.closest('.workspace-header-container');
        if (headerTarget) {
            e.preventDefault();
            const wsName = headerTarget.dataset.workspaceName;
            contextTarget = { type: 'workspace', wsName };
            
            // Добавлен пункт "Open in New Window"
            contextMenu.innerHTML = `
                <div class="menu-item" data-action="open_window" style="font-weight:500;">Open in New Window</div>
                <div class="menu-separator"></div>
                <div class="menu-item" data-action="rename_ws">Rename</div>
                <div class="menu-item" data-action="export_ws">Export Workspace</div>
                <div class="menu-separator"></div>
                <div class="menu-item" data-action="delete_ws" style="color:#fa5252">Delete Workspace</div>
            `;
            showMenu(e.clientX, e.clientY);
            return;
        }
    });

    function showMenu(x, y) {
        const menuWidth = 160;
        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.style.display = 'block';
    }

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        document.querySelectorAll('.context-selected').forEach(el => el.classList.remove('context-selected'));
    });
    
    // 2. Handle Menu Actions
    contextMenu.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (!contextTarget || !action) return;

        // --- Link Actions ---
        if (contextTarget.type === 'link') {
            const { item, wsName } = contextTarget;
            if (action === 'delete_link') {
                const list = allData[wsName].tabs;
                const idx = list.indexOf(item);
                if (idx > -1) list.splice(idx, 1);
            } else if (action === 'add_note') {
                const text = prompt("Add a note:");
                if (text) {
                    if (!item.notes) item.notes = [];
                    item.notes.push(text);
                }
            } else if (action === 'copy_link') {
                navigator.clipboard.writeText(item.url);
            }
        }
        // --- Workspace Actions ---
        else if (contextTarget.type === 'workspace') {
            const { wsName } = contextTarget;
            
            if (action === 'open_window') {
                // НОВАЯ ЛОГИКА: Открыть все вкладки в новом окне
                const tabs = allData[wsName].tabs || [];
                if (tabs.length === 0) {
                    alert("Workspace is empty!");
                } else {
                    // Собираем массив URL
                    const urls = tabs.map(t => t.url);
                    chrome.windows.create({ url: urls, focused: true });
                }
            } 
            else if (action === 'delete_ws') {
                handleDeleteWorkspace(wsName);
            } else if (action === 'export_ws') {
                exportData(wsName);
            } else if (action === 'rename_ws') {
                const newName = prompt("Rename workspace to:", wsName);
                if (newName) renameWorkspace(wsName, newName.trim());
            }
        }

        await saveData();
        searchInput.value ? renderSearchResults(searchInput.value) : renderAllWorkspaces();
        contextMenu.style.display = 'none';
        document.querySelectorAll('.context-selected').forEach(el => el.classList.remove('context-selected'));
        contextTarget = null;
    });

    addWorkspaceBtn.addEventListener('click', handleAddWorkspace);
    newWorkspaceNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddWorkspace(); });
    
    exportBtn.addEventListener('click', () => exportData(null));
    importBtn.addEventListener('click', () => {
        const wantBackup = confirm("Save (export) current layout before importing?");
        if (wantBackup) {
            exportData(null);
        }
        setTimeout(() => fileInput.click(), 100);
    });

    saveWindowBtn.addEventListener('click', async () => {
        let name = prompt("Enter workspace name for current tabs:", "My Window");
        if (!name) return;
        let finalName = name.trim();
        let counter = 1;
        while (allData[finalName]) {
            finalName = `${name.trim()} ${counter}`;
            counter++;
        }
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const newTabs = tabs.map(tab => {
            const realUrl = tab.url || tab.pendingUrl;
            const realTitle = tab.title || realUrl || "No Title";
            return {
                id: generateId(),
                type: 'tab',
                url: realUrl,
                title: realTitle,
                notes: []
            };
        }).filter(t => t.url && !t.url.startsWith('chrome://newtab'));

        if (newTabs.length === 0) {
            alert("No valid tabs found to save!");
            return;
        }
        allData[finalName] = { tabs: newTabs };
        await saveData();
        renderAllWorkspaces();
        chrome.runtime.sendMessage({ action: 'UPDATE_CONTEXT_MENUS' });
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) importData(e.target.files[0]);
    });

    searchInput.addEventListener('input', (e) => renderSearchResults(e.target.value));
  }

  initialize();
});
