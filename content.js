(function() {
  if (window.__tabiko_injected__) return;
  window.__tabiko_injected__ = true;

  // Configuration
  const STATE_DOWN_SRC = chrome.runtime.getURL('icons/state_down.png');
  const STATE_UP_SRC = chrome.runtime.getURL('icons/state_up.png');

  let selectedWorkspace = null;

  // Create Container
  const container = document.createElement('div');
  container.id = 'tabiko-widget-container-x';
  container.style.position = 'fixed';
  container.style.zIndex = '2147483647';
  
  let widgetSize = 200; // Default size

  // Try to load saved position or default
  chrome.storage.local.get(['tabiko_widget_pos', 'tabiko_selectedWorkspace', 'tabiko_widget_size'], (res) => {
    if (res.tabiko_widget_size) {
      widgetSize = parseInt(res.tabiko_widget_size, 10);
    }
    
    container.style.width = widgetSize + 'px';
    container.style.height = widgetSize + 'px';
    container.style.pointerEvents = 'none'; // let clicks pass through container bounds
    
    if (res.tabiko_widget_pos) {
      container.style.left = res.tabiko_widget_pos.x + 'px';
      container.style.top = res.tabiko_widget_pos.y + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    } else {
      const p = widgetSize * 0.25;
      container.style.right = `-${p}px`;
      container.style.bottom = `-${p}px`;
      container.style.left = 'auto';
      container.style.top = 'auto';
    }
    if (res.tabiko_selectedWorkspace) {
      selectedWorkspace = res.tabiko_selectedWorkspace;
    }
  });

  document.body.appendChild(container);

  const shadow = container.attachShadow({mode: 'closed'});
  
  const style = document.createElement('style');
  style.textContent = `
    .widget-root {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: auto;
      user-select: none;
      display: flex; justify-content: center; align-items: center;
    }
    .state-icon {
      width: 100%; height: 100%;
      object-fit: contain;
      cursor: grab;
      filter: drop-shadow(0px 2px 5px rgba(0,0,0,0.15)); /* No glow by default */
      transition: transform 0.1s ease, filter 0.2s ease;
    }
    .state-icon:active { cursor: grabbing; }
    .widget-root.dragover .state-icon {
      transform: scale(1.1);
      filter: drop-shadow(0px 0px 18px rgba(0,123,255,1)); /* Glows bright blue when hovering */
    }
    @keyframes shake {
      0% { transform: translate(1px, 1px) rotate(0deg); }
      10% { transform: translate(-1px, -2px) rotate(-3deg); }
      20% { transform: translate(-3px, 0px) rotate(3deg); }
      30% { transform: translate(3px, 2px) rotate(0deg); }
      40% { transform: translate(1px, -1px) rotate(3deg); }
      50% { transform: translate(-1px, 2px) rotate(-3deg); }
      60% { transform: translate(-3px, 1px) rotate(0deg); }
      70% { transform: translate(3px, 1px) rotate(-3deg); }
      80% { transform: translate(-1px, -1px) rotate(3deg); }
      90% { transform: translate(1px, 2px) rotate(0deg); }
      100% { transform: translate(1px, -2px) rotate(-3deg); }
    }
    .shaking .state-icon {
      animation: shake 0.4s infinite;
    }
    .speech-bubble {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: #fff;
      border-radius: 12px;
      padding: 8px 12px;
      font-size: 13px;
      color: #333;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
      font-weight: bold;
      border: 2px solid #333;
      font-family: sans-serif;
      margin-bottom: 10px;
    }
    .speech-bubble::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      margin-left: -6px;
      border-width: 6px;
      border-style: solid;
      border-color: #333 transparent transparent transparent;
    }
    .show-speech { opacity: 1; }
    
    .context-menu {
      position: fixed;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 4px 0;
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: none;
      color: #333;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      pointer-events: auto;
    }
    .menu-item { padding: 8px 16px; cursor: pointer; position: relative; }
    .menu-item:hover { background: #f1f3f5; }
    .menu-separator { height: 1px; background: #eee; margin: 4px 0; }
    .has-submenu::after { content: '▶'; position: absolute; right: 10px; font-size: 10px; top: 11px; color: #888; }
    .submenu {
      display: none;
      position: absolute;
      left: 100%; top: 0;
      background: #fff; border: 1px solid #ccc; border-radius: 6px;
      min-width: 140px; max-height: 200px; overflow-y: auto; padding: 4px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .has-submenu:hover .submenu { display: block; }
    .submenu-item { padding: 8px 16px; cursor: pointer; white-space: nowrap; }
    .submenu-item:hover { background: #f1f3f5; }
    .submenu-item.current { background: #e7f5ff; font-weight: bold; }

    .typing::after {
      content: '|';
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    .arrow-icon {
      width: 44px; height: 44px;
      background: #fff;
      border: 1px solid #d0d7de;
      border-radius: 50% !important; /* Force a circle */
      display: flex; justify-content: center; align-items: center;
      color: #666; font-size: 16px; font-weight: bold; font-family: sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
      box-sizing: border-box;
      display: none;
      transition: all 0.2s ease-in-out;
    }
    .arrow-icon:hover {
      background: #f6f8fa;
      color: #333;
      border-color: #b0b7be;
      transform: scale(1.05);
    }
    .minimized .arrow-icon { display: flex; }
    .minimized .state-icon { display: none; }
  `;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'widget-root';
  shadow.appendChild(root);

  const img = document.createElement('img');
  img.src = STATE_DOWN_SRC;
  img.className = 'state-icon';
  img.draggable = false;
  root.appendChild(img);

  const arrow = document.createElement('div');
  arrow.className = 'arrow-icon';
  arrow.textContent = '◀';
  root.appendChild(arrow);

  const speech = document.createElement('div');
  speech.className = 'speech-bubble';
  root.appendChild(speech);

  const contextMenu = document.createElement('div');
  contextMenu.className = 'context-menu';
  contextMenu.innerHTML = `
    <div class="menu-item" id="menu-minimize">Minimize</div>
    <div class="menu-item" id="menu-resize">Change Size</div>
    <div class="menu-separator"></div>
    <div class="menu-item has-submenu" id="menu-saveto">
      Save to
      <div class="submenu" id="submenu-workspaces"></div>
    </div>
  `;
  shadow.appendChild(contextMenu);

  // Interaction State
  let isDragging = false;
  let offsetX, offsetY;
  let isMinimized = false;

  // Restore logic
  arrow.addEventListener('click', () => {
    isMinimized = false;
    root.classList.remove('minimized');
    container.style.pointerEvents = 'none'; // restore pass-through
    container.style.width = widgetSize + 'px';
    container.style.height = widgetSize + 'px';
    // Snap back to near where it was (just shift inward from edge)
    const rect = container.getBoundingClientRect();
    if (rect.left < 0) container.style.left = '10px';
    if (rect.top < 0) container.style.top = '10px';
    if (rect.right > window.innerWidth) container.style.left = (window.innerWidth - widgetSize) + 'px';
    if (rect.bottom > window.innerHeight) container.style.top = (window.innerHeight - widgetSize) + 'px';
  });

  img.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click for dragging
    isDragging = true;
    const rect = container.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    
    // Bounds check with transparent padding allowance (~25% of size)
    const p = widgetSize * 0.25;
    if (x < -p) x = -p;
    if (y < -p) y = -p;
    if (x + widgetSize - p > window.innerWidth) x = window.innerWidth - widgetSize + p;
    if (y + widgetSize - p > window.innerHeight) y = window.innerHeight - widgetSize + p;

    container.style.left = x + 'px';
    container.style.top = y + 'px';
    container.style.right = 'auto'; // Clear right since we use left/top explicitly
    container.style.bottom = 'auto'; // Clear bottom as well
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    chrome.storage.local.set({
      tabiko_widget_pos: {
        x: parseInt(container.style.left),
        y: parseInt(container.style.top)
      }
    });
  }

  // Right-click Menu
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isMinimized) return; // Don't show menu when minimized

    // Populate workspaces
    chrome.storage.local.get(['workspaces'], (res) => {
      const wss = res.workspaces || {};
      const submenu = shadow.getElementById('submenu-workspaces');
      submenu.innerHTML = '';
      
      const wsNames = Object.keys(wss);
      if (wsNames.length === 0) {
        submenu.innerHTML = '<div class="submenu-item" style="color:#888;">No workspaces</div>';
      } else {
        wsNames.forEach(wsName => {
          const item = document.createElement('div');
          item.className = 'submenu-item';
          if (selectedWorkspace === wsName) item.classList.add('current');
          item.textContent = wsName;
          item.addEventListener('click', () => {
             selectedWorkspace = wsName;
             chrome.storage.local.set({tabiko_selectedWorkspace: wsName});
             contextMenu.style.display = 'none';
          });
          submenu.appendChild(item);
        });
      }
      
      contextMenu.style.display = 'block';
      
      // Calculate pos within fixed widget coords? No, context menu is fixed.
      let menuX = e.clientX;
      let menuY = e.clientY;
      if (menuX + 160 > window.innerWidth) menuX -= 160;
      contextMenu.style.left = menuX + 'px';
      contextMenu.style.top = menuY + 'px';
    });
  });

  shadow.getElementById('menu-resize').addEventListener('click', () => {
    contextMenu.style.display = 'none';
    const newSizeStr = window.prompt("Enter new widget size in pixels (e.g. 120, 150):", widgetSize);
    if (!newSizeStr) return;
    const newSize = parseInt(newSizeStr, 10);
    if (isNaN(newSize) || newSize < 40 || newSize > 500) {
      alert("Please enter a valid size between 40 and 500.");
      return;
    }
    widgetSize = newSize;
    container.style.width = widgetSize + 'px';
    container.style.height = widgetSize + 'px';
    chrome.storage.local.set({ tabiko_widget_size: widgetSize });
    
    // Auto-adjust position if out of bounds
    const rect = container.getBoundingClientRect();
    if (rect.right > window.innerWidth) container.style.left = (window.innerWidth - widgetSize) + 'px';
    if (rect.bottom > window.innerHeight) container.style.top = (window.innerHeight - widgetSize) + 'px';
  });

  shadow.getElementById('menu-minimize').addEventListener('click', () => {
    isMinimized = true;
    root.classList.add('minimized');
    contextMenu.style.display = 'none';

    const rect = container.getBoundingClientRect();
    const cx = rect.left + (rect.width / 2);
    const cy = rect.top + (rect.height / 2);
    
    container.style.width = '44px';
    container.style.height = '44px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.style.pointerEvents = 'auto'; // Accept clicks for arrow restore
    
    // Snap to closest edge
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // Distances
    const dL = cx;
    const dR = w - cx;
    const dT = cy;
    const dB = h - cy;
    
    const minD = Math.min(dL, dR, dT, dB);
    if (minD === dL) { // Left
      container.style.left = '-4px';
      container.style.top = (cy - 22) + 'px';
      arrow.textContent = '▶';
    } else if (minD === dR) { // Right
      container.style.left = (w - 40) + 'px';
      container.style.top = (cy - 22) + 'px';
      arrow.textContent = '◀';
    } else if (minD === dT) { // Top
      container.style.top = '-4px';
      container.style.left = (cx - 22) + 'px';
      arrow.textContent = '▼';
    } else { // Bottom
      container.style.top = (h - 40) + 'px';
      container.style.left = (cx - 22) + 'px';
      arrow.textContent = '▲';
    }
  });

  // Hide context menu on outside click
  document.addEventListener('click', (e) => {
    // If the click is inside shadow root, we handle it. If outside, hide.
    contextMenu.style.display = 'none';
  });

  // --- DROPZONE LOGIC ---
  root.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (isMinimized) return;
    if (e.dataTransfer.types.includes('text/uri-list') || e.dataTransfer.types.includes('text/plain')) {
      root.classList.add('dragover');
      img.src = STATE_UP_SRC;
    }
  });

  root.addEventListener('dragleave', (e) => {
    root.classList.remove('dragover');
    img.src = STATE_DOWN_SRC;
  });

  root.addEventListener('drop', (e) => {
    e.preventDefault();
    if (isMinimized) return;
    root.classList.remove('dragover');
    img.src = STATE_DOWN_SRC;

    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (!url) return;

    if (!selectedWorkspace) {
       triggerShakeAndSpeak();
       return;
    }

    // Attempt to save link
    chrome.storage.local.get(['workspaces'], (res) => {
       const wss = res.workspaces || {};
       if (!wss[selectedWorkspace]) {
           triggerShakeAndSpeak();
           return;
       }

       // Generate simple ID
       const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

       const newItem = {
           id: genId(),
           type: 'tab',
           url: url,
           title: url,
           notes: []
       };

       wss[selectedWorkspace].tabs.push(newItem);
       chrome.storage.local.set({workspaces: wss}, () => {
           // Optionally add a small success animation here
           const oldSrc = img.src;
           img.src = STATE_UP_SRC;
           setTimeout(() => { img.src = oldSrc }, 500);
       });
       
       // Alert extension to update if panel is open
       chrome.runtime.sendMessage({ action: 'REFRESH_DATA' });
    });
  });

  function triggerShakeAndSpeak() {
      root.classList.add('shaking');
      speech.classList.add('show-speech');
      
      const fullText = "I don't know where to save!";
      speech.textContent = '';
      speech.classList.add('typing');
      
      let i = 0;
      const interval = setInterval(() => {
          speech.textContent += fullText.charAt(i);
          i++;
          if (i >= fullText.length) {
              clearInterval(interval);
              speech.classList.remove('typing');
              setTimeout(() => {
                  root.classList.remove('shaking');
                  speech.classList.remove('show-speech');
              }, 2000);
          }
      }, 50);
  }

})();
