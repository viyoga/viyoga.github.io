(() => {
  'use strict';

  // ---------- DOM ----------
  const dateEl = document.getElementById('date');
  const clockEl = document.getElementById('clock');
  const searchInput = document.getElementById('searchInput');
  const shortcutRow = document.getElementById('shortcutRow');
  const addBtn = document.getElementById('addBtn');
  const editToggle = document.getElementById('editToggle');

  const overlay = document.getElementById('overlay');
  const modalTitle = document.getElementById('modalTitle');
  const closeModalBtn = document.getElementById('closeModal');
  const form = document.getElementById('shortcutForm');
  const nameInput = document.getElementById('nameInput');
  const urlInput = document.getElementById('urlInput');
  const submitBtn = document.getElementById('submitBtn');

  let shortcuts = [];
  let editingId = null;

  // ---------- Clock / date ----------
  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}`;
  }

  function updateDate() {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    dateEl.textContent = `${weekday} ${month} ${now.getDate()}, ${now.getFullYear()}`.toUpperCase();
  }

  updateClock();
  updateDate();
  setInterval(updateClock, 1000);
  setInterval(updateDate, 60000);
  clockEl.style.fontFamily = "'Oxanium', var(--font)";
  clockEl.style.fontWeight = "700";

  // ---------- Storage ----------
  const STORAGE_VERSION = 4;

  const DEFAULT_SHORTCUTS = [
    { name: 'Hiraeth', url: 'https://viyoga.github.io' },
    { name: 'Proton', url: 'https://mail.proton.me' },
    { name: 'Drive', url: 'https://drive.google.com' },
    { name: 'Gmail', url: 'https://mail.google.com' },
    { name: 'Gemini', url: 'https://gemini.google.com' },
    { name: 'ChatGPT', url: 'https://chatgpt.com' },
    { name: 'Syncthing', url: 'http://127.0.0.1:8384/' },
    { name: 'Keybr', url: 'https://keybr.com' },
    { name: 'Kick', url: 'https://kick.com/gmhikaru' },
    { name: 'Anime', url: 'https://everythingmoe.com' },
    { name: 'FMHY', url: 'https://fmhy.net/video#anime-streaming' },
    { name: 'YouShows', url: 'https://youshows.org/' },
  ];

  const DEFAULT_URLS = new Set(DEFAULT_SHORTCUTS.map((s) => s.url));

  function loadShortcuts() {
    return new Promise((resolve) => {
      const applyDefaults = () => {
        const defaults = DEFAULT_SHORTCUTS.map((s) => ({ ...s, id: cryptoId() }));
        saveShortcuts(defaults);
        return defaults;
      };

      const mergeDefaults = (list, removed) => {
        const existingUrls = new Set(list.map((s) => s.url));
        const existingNames = new Set(list.map((s) => s.name.toLowerCase()));
        const missing = DEFAULT_SHORTCUTS
          .filter((s) => !existingUrls.has(s.url)
            && !existingNames.has(s.name.toLowerCase())
            && !removed.includes(s.url))
          .map((s) => ({ ...s, id: cryptoId() }));
        if (missing.length) {
          const merged = [...list, ...missing];
          saveShortcuts(merged);
          return merged;
        }
        return list;
      };

      if (chrome?.storage?.local) {
        chrome.storage.local.get(['shortcuts', 'seedVersion', 'removedDefaults'], (res) => {
          if (res.seedVersion !== STORAGE_VERSION || !res.shortcuts?.length) {
            resolve(applyDefaults());
          } else {
            resolve(mergeDefaults(res.shortcuts, res.removedDefaults || []));
          }
        });
      } else {
        const list = JSON.parse(localStorage.getItem('shortcuts') || '[]');
        const version = Number(localStorage.getItem('seedVersion') || '0');
        const removed = JSON.parse(localStorage.getItem('removedDefaults') || '[]');
        if (version !== STORAGE_VERSION || !list.length) {
          resolve(applyDefaults());
        } else {
          resolve(mergeDefaults(list, removed));
        }
      }
    });
  }

  function saveShortcuts(data) {
    return new Promise((resolve) => {
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ shortcuts: data, seedVersion: STORAGE_VERSION }, resolve);
      } else {
        localStorage.setItem('shortcuts', JSON.stringify(data));
        localStorage.setItem('seedVersion', String(STORAGE_VERSION));
        resolve();
      }
    });
  }

  // ---------- Favicon cache ----------
  // Favicons are cached as base64 data URLs in chrome.storage.local under
  // the key 'faviconCache' (an object keyed by origin). On first open they
  // load from chrome://favicon2 and are saved; on every subsequent open
  // they're read from storage and appear instantly with no network round-trip.

  let faviconCache = {}; // in-memory mirror of storage

  function faviconStorageUrl(pageUrl) {
    try {
      const url = new URL(chrome.runtime.getURL('/_favicon/'));
      url.searchParams.set('pageUrl', pageUrl);
      url.searchParams.set('size', '64');
      return url.toString();
    } catch (e) {
      return '';
    }
  }

  function cacheKey(pageUrl) {
    try { return new URL(pageUrl).origin; } catch (e) { return pageUrl; }
  }

  function saveFaviconCache() {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ faviconCache });
    }
  }

  function loadFaviconCache() {
    return new Promise((resolve) => {
      const finish = (cache) => {
        faviconCache = cache || {};
        // One-time cache refresh for Hiraeth to pick up new logo
        const hiraethKey = 'https://viyoga.github.io';
        if (!faviconCache._hiraethRefreshedV2) {
          delete faviconCache[hiraethKey];
          faviconCache._hiraethRefreshedV2 = true;
          saveFaviconCache();
        }
        resolve();
      };

      if (chrome?.storage?.local) {
        chrome.storage.local.get('faviconCache', (res) => {
          finish(res.faviconCache);
        });
      } else {
        try { finish(JSON.parse(localStorage.getItem('faviconCache') || '{}')); } catch (e) { finish({}); }
      }
    });
  }

  // Fetch favicon via chrome://favicon2, convert to base64, cache it, then
  // update the already-rendered <img> element in place.
  function fetchAndCacheFavicon(pageUrl, imgEl) {
    const src = faviconStorageUrl(pageUrl);
    if (!src) return;
    const tmp = new Image();
    tmp.crossOrigin = 'anonymous';
    tmp.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = tmp.naturalWidth || 64;
        canvas.height = tmp.naturalHeight || 64;
        canvas.getContext('2d').drawImage(tmp, 0, 0);
        const data = canvas.toDataURL('image/png');
        faviconCache[cacheKey(pageUrl)] = data;
        saveFaviconCache();
        if (imgEl && imgEl.isConnected) imgEl.src = data;
      } catch (e) {
        // canvas tainted (shouldn't happen with chrome:// favicon) — leave the direct URL
        if (imgEl && imgEl.isConnected) imgEl.src = src;
      }
    };
    tmp.onerror = () => {
      if (imgEl && imgEl.isConnected) imgEl.src = src;
    };
    tmp.src = src;
  }

  function initialColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 42%, 32%)`;
  }

  function makeInitialAvatar(name) {
    const span = document.createElement('span');
    span.className = 'initial-avatar';
    span.textContent = (name.trim()[0] || '?').toUpperCase();
    span.style.background = initialColor(name || '?');
    return span;
  }

  // ---------- Rendering ----------
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function renderShortcut(s) {
    const el = document.createElement('div');
    el.className = 'shortcut';
    el.tabIndex = 0;

    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', () => img.replaceWith(makeInitialAvatar(s.name)), { once: true });

    const cached = faviconCache[cacheKey(s.url)];
    if (cached) {
      img.src = cached;
    } else {
      img.src = faviconStorageUrl(s.url);
      fetchAndCacheFavicon(s.url, img);
    }

    el.appendChild(img);

    const label = document.createElement('span');
    label.textContent = s.name;
    el.appendChild(label);

    const del = document.createElement('span');
    del.className = 'delete-badge';
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeShortcut(s.id);
    });
    el.appendChild(del);

    el.addEventListener('click', () => {
      if (document.body.classList.contains('edit-mode')) {
        openModal('edit', s.id);
      } else {
        window.location.href = s.url;
      }
    });

    makeDraggable(el, s);

    return el;
  }

  function render() {
    shortcutRow.innerHTML = '';
    if (!shortcuts.length) return;

    shortcuts.forEach((s) => shortcutRow.appendChild(renderShortcut(s)));
  }

  function removeShortcut(id) {
    const removed = shortcuts.find((s) => s.id === id);
    shortcuts = shortcuts.filter((s) => s.id !== id);

    if (removed && DEFAULT_URLS.has(removed.url)) {
      getRemovedDefaults().then((list) => {
        if (!list.includes(removed.url)) list.push(removed.url);
        setRemovedDefaults(list).then(() => saveShortcuts(shortcuts).then(render));
      });
    } else {
      saveShortcuts(shortcuts).then(render);
    }
  }

  function getRemovedDefaults() {
    return new Promise((resolve) => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get('removedDefaults', (res) => resolve(res.removedDefaults || []));
      } else {
        resolve(JSON.parse(localStorage.getItem('removedDefaults') || '[]'));
      }
    });
  }

  function setRemovedDefaults(list) {
    return new Promise((resolve) => {
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ removedDefaults: list }, resolve);
      } else {
        localStorage.setItem('removedDefaults', JSON.stringify(list));
        resolve();
      }
    });
  }

  // ---------- Modal ----------
  function openModal(mode, id = null) {
    editingId = mode === 'edit' ? id : null;
    const shortcut = editingId ? shortcuts.find((s) => s.id === editingId) : null;

    modalTitle.textContent = mode === 'edit' ? 'Edit shortcut' : 'Add shortcut';
    submitBtn.textContent = mode === 'edit' ? 'Save changes' : 'Add shortcut';

    nameInput.value = shortcut ? shortcut.name : '';
    urlInput.value = shortcut ? shortcut.url : '';

    overlay.classList.add('open');
    setTimeout(() => nameInput.focus(), 50);
  }

  function closeModal() {
    overlay.classList.remove('open');
    form.reset();
    editingId = null;
  }

  addBtn.addEventListener('click', () => openModal('add'));
  closeModalBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  function setEditMode(on) {
    const isEdit = typeof on === 'boolean' ? on : !document.body.classList.contains('edit-mode');
    document.body.classList.toggle('edit-mode', isEdit);
    editToggle.classList.toggle('active', isEdit);
    editToggle.setAttribute('aria-pressed', String(isEdit));
    editToggle.title = isEdit ? 'Done editing — click to save' : 'Edit shortcuts';
    const label = editToggle.querySelector('.edit-label');
    if (label) label.textContent = isEdit ? 'Done' : 'Edit';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) { closeModal(); return; }
    if (e.key === 'Escape' && document.body.classList.contains('edit-mode')) { setEditMode(false); return; }
    // Quick toggle with 'e' when focus is on body (no input/modal)
    if (e.key.toLowerCase() === 'e' && !overlay.classList.contains('open') && document.activeElement === document.body && !e.metaKey && !e.ctrlKey && !e.altKey) {
      setEditMode(!document.body.classList.contains('edit-mode'));
    }
  });

  editToggle.addEventListener('click', () => setEditMode());

  function cryptoId() {
    return window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    if (editingId) {
      const idx = shortcuts.findIndex((s) => s.id === editingId);
      if (idx > -1) shortcuts[idx] = { ...shortcuts[idx], name, url };
    } else {
      shortcuts.push({ id: cryptoId(), name, url });
    }

    await saveShortcuts(shortcuts);
    closeModal();
    render();
  });

  // ---------- Search ----------
  const BANGS = {
    '/rr': { home: 'https://www.reddit.com/', search: 'https://www.reddit.com/search/?q=' },
    '/yt': { home: 'https://www.youtube.com/', search: 'https://www.youtube.com/results?search_query=' },
    '/ss': { home: 'https://www.startpage.com/', search: 'https://www.startpage.com/sp/search?query=' },
    '/dd': { home: 'https://duckduckgo.com/', search: 'https://duckduckgo.com/?q=' },
  };

  function bangMatch(q) {
    const lower = q.toLowerCase();
    for (const bang of Object.keys(BANGS)) {
      if (lower === bang || lower.startsWith(bang + ' ')) return bang;
    }
    return null;
  }

  function handleBang(q) {
    const bang = bangMatch(q);
    if (!bang) return false;
    const query = q.slice(bang.length).trim();
    const target = query ? BANGS[bang].search + encodeURIComponent(query) : BANGS[bang].home;
    window.location.href = target;
    return true;
  }

  function looksLikeUrl(value) {
    return /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]{2,})+(\/\S*)?$/.test(value);
  }

  function handleSearch(value) {
    const q = value.trim();
    if (!q) return;

    if (handleBang(q)) return;

    if (looksLikeUrl(q)) {
      window.location.href = /^https?:\/\//i.test(q) ? q : 'https://' + q;
      return;
    }

    if (chrome?.search?.query) {
      chrome.search.query({ text: q, disposition: 'CURRENT_TAB' });
    } else {
      window.location.href = 'https://www.google.com/search?q=' + encodeURIComponent(q);
    }
  }

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch(searchInput.value);
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    const bang = bangMatch(q);
    searchInput.classList.toggle('bang-valid', !!bang);
    searchInput.classList.toggle('bang-invalid', q.startsWith('/') && !bang);
  });

  // Typing anywhere jumps focus to search (like most launcher-style new tabs)
  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('open')) return;
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    searchInput.focus();
  });

  // ---------- Purr-o-Meter (Interactive Kitty) ----------
  const catLogo = document.getElementById('catLogo');
  const purrMeter = document.getElementById('purrMeter');
  const meterLabel = document.getElementById('meterLabel');
  const kittyStatus = document.getElementById('kittyStatus');
  const kittyMode = document.getElementById('kittyMode');

  if (catLogo && purrMeter) {
    const meterBoxes = Array.from(purrMeter.querySelectorAll('i'));
    const TOTAL_BOXES = meterBoxes.length || 11;

    // 10 min total drain = 600 000 ms across 11 boxes
    const DRAIN_TOTAL_MS = 10 * 60 * 1000;

    // purrCharge is a float 0..TOTAL_BOXES. We store the absolute timestamp at
    // which purrCharge was at its recorded value so we can recompute continuously.
    let purrCharge = 0;       // last known charge (float)
    let chargeSetAt = null;   // Date.now() when purrCharge was last set
    let rafId = null;

    function currentCharge() {
      if (chargeSetAt === null || purrCharge <= 0) return 0;
      const elapsed = Date.now() - chargeSetAt;
      const drained = (elapsed / DRAIN_TOTAL_MS) * TOTAL_BOXES;
      return Math.max(0, purrCharge - drained);
    }

    const HEARTS = ['♥', 'purr~', '✦', '🐾', 'zzZ'];

    function updatePurrUI(charge) {
      const level = Math.ceil(charge); // boxes lit = ceiling of float charge
      meterBoxes.forEach((box, idx) => {
        box.classList.toggle('lit', idx < level);
      });

      if (level >= TOTAL_BOXES) {
        purrMeter.classList.add('overload');
        if (meterLabel) meterLabel.textContent = 'PURR OVERLOAD! MAXIMUM LOVE';
        if (kittyStatus) kittyStatus.textContent = 'PURRING 100% (^._.^)ﾉ';
        if (kittyMode) kittyMode.textContent = 'OVERJOYED';
      } else if (level >= 8) {
        purrMeter.classList.remove('overload');
        if (meterLabel) meterLabel.textContent = 'PURR-O-METER: VERY COZY';
        if (kittyStatus) kittyStatus.textContent = `BLISSFUL (${Math.round((charge / TOTAL_BOXES) * 100)}%)`;
        if (kittyMode) kittyMode.textContent = 'HAPPY';
      } else if (level >= 4) {
        purrMeter.classList.remove('overload');
        if (meterLabel) meterLabel.textContent = 'PURR-O-METER: ENJOYING IT';
        if (kittyStatus) kittyStatus.textContent = `PURRING (${Math.round((charge / TOTAL_BOXES) * 100)}%)`;
        if (kittyMode) kittyMode.textContent = 'PETTING';
      } else if (level >= 1) {
        purrMeter.classList.remove('overload');
        if (meterLabel) meterLabel.textContent = 'PURR-O-METER: WAKING UP';
        if (kittyStatus) kittyStatus.textContent = `DOZING (${Math.round((charge / TOTAL_BOXES) * 100)}%)`;
        if (kittyMode) kittyMode.textContent = 'PETTING';
      } else {
        purrMeter.classList.remove('overload');
        if (meterLabel) meterLabel.textContent = 'SLEEP MODE / DO NOT DISTURB';
        if (kittyStatus) kittyStatus.textContent = 'RESTING';
        if (kittyMode) kittyMode.textContent = 'NEW TAB';
      }
    }

    function drainLoop() {
      const charge = currentCharge();
      updatePurrUI(charge);
      if (charge > 0) {
        rafId = requestAnimationFrame(drainLoop);
      } else {
        rafId = null;
      }
    }

    function startDrain() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(drainLoop);
    }

    function spawnFloatingHeart(e) {
      const heart = document.createElement('span');
      heart.className = 'pet-heart';
      const text = HEARTS[Math.floor(Math.random() * HEARTS.length)];
      heart.textContent = text;

      const rect = catLogo.getBoundingClientRect();
      const x = (e && e.clientX) ? (e.clientX - rect.left) : (rect.width * (0.3 + Math.random() * 0.4));
      const y = (e && e.clientY) ? (e.clientY - rect.top) : (rect.height * 0.3);

      heart.style.left = `${Math.max(5, Math.min(rect.width - 25, x))}px`;
      heart.style.top = `${Math.max(5, y)}px`;

      catLogo.appendChild(heart);
      setTimeout(() => heart.remove(), 750);
    }

    function handlePet(e) {
      // Snapshot current charge, add 1 box, restart drain from now
      const charge = currentCharge();
      purrCharge = Math.min(TOTAL_BOXES, charge + 1);
      chargeSetAt = Date.now();

      catLogo.classList.remove('pet-bounce');
      void catLogo.offsetWidth;
      catLogo.classList.add('pet-bounce');

      spawnFloatingHeart(e);
      updatePurrUI(purrCharge);
      startDrain();
    }

    catLogo.addEventListener('click', handlePet);
    updatePurrUI(0);
  }

  // ---------- Drag-to-reorder & trash-drop for shortcuts ----------
  let dragSrcId = null;
  let dragSrcEl = null;

  // Convert editToggle into a drop-trash zone when dragging
  function setTrashMode(on) {
    editToggle.classList.toggle('trash-zone', on);
    editToggle.querySelector('.edit-label').textContent = on ? 'Delete' : (document.body.classList.contains('edit-mode') ? 'Done' : 'Edit');
    editToggle.querySelector('.icon-pencil').style.display = on ? 'none' : '';
    editToggle.querySelector('.icon-check').style.display = 'none';
  }

  function makeDraggable(el, s) {
    el.draggable = true;

    el.addEventListener('dragstart', (e) => {
      dragSrcId = s.id;
      dragSrcEl = el;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', s.id);
      requestAnimationFrame(() => el.classList.add('dragging'));
      setTrashMode(true);
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.shortcut.drag-over').forEach(x => x.classList.remove('drag-over'));
      setTrashMode(false);
      dragSrcId = null;
      dragSrcEl = null;
    });

    el.addEventListener('dragover', (e) => {
      if (dragSrcId === s.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.shortcut.drag-over').forEach(x => x.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === s.id) return;
      const fromIdx = shortcuts.findIndex(x => x.id === dragSrcId);
      const toIdx = shortcuts.findIndex(x => x.id === s.id);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = shortcuts.splice(fromIdx, 1);
      shortcuts.splice(toIdx, 0, moved);
      saveShortcuts(shortcuts).then(render);
    });
  }

  // Wire trash-drop on the edit button
  editToggle.addEventListener('dragover', (e) => {
    if (!dragSrcId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    editToggle.classList.add('trash-active');
  });
  editToggle.addEventListener('dragleave', () => {
    editToggle.classList.remove('trash-active');
  });
  editToggle.addEventListener('drop', (e) => {
    e.preventDefault();
    editToggle.classList.remove('trash-active');
    if (!dragSrcId) return;
    removeShortcut(dragSrcId);
    setTrashMode(false);
    dragSrcId = null;
  });

  // ---------- Init ----------
  // Load favicon cache first so cached icons are ready before render().
  loadFaviconCache().then(() => loadShortcuts()).then((data) => {
    shortcuts = data;
    render();
  });
})();
