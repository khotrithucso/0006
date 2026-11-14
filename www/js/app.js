if (window.CKEDITOR) {
  CKEDITOR.config.versionCheck = false;
}

// 1. Initialize IndexedDB (Notebooks with Custom Icon & Color -> Pages)
const db = new Dexie("App0006SmartNotebookV4");
db.version(1).stores({
  notebooks: "++id, title, icon, color, createdAt, updatedAt",
  pages: "++id, notebookId, title, content, createdAt, updatedAt"
});

let currentNotebookId = null;
let currentPageId = null;
let ckEditorInstance = null;
let workspaceMode = "write"; // 'write' | 'read'
let toolbarVisible = true;
let readerFontSize = 16;
let autoSaveTimer = null;
let actionCounter = 0;

// Notebook Modal State
let nbModalMode = "create"; // 'create' | 'edit'
let editingNotebookId = null;
let selectedNbIcon = "📘";
let selectedNbColor = "#6366f1";

// Canvas Drawing State
let isEraserMode = false;
let isGridEnabled = false;
let currentPenColor = "#0f172a";
let canvasUndoStack = [];

// 2. App Bootstrapping
window.addEventListener("DOMContentLoaded", async () => {
  applySavedTheme();
  initNotebookCustomizerPickers();
  initCKEditor();
  initCanvasDrawing();
  restoreSavedCloudEmail();
  await bootstrapData();
  initAdMobNative();
});

// 3. Toast Notification Engine
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast-item ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "✦";
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    toast.style.transition = "all 0.22s ease";
    setTimeout(() => toast.remove(), 240);
  }, 2400);
}

// 4. Dual Theme Engine (Light Paper vs. Midnight Obsidian)
function applySavedTheme() {
  const saved = localStorage.getItem("app0006_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = document.getElementById("btn-theme-toggle");
  if (btn) btn.textContent = saved === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode";
}

function toggleAppTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("app0006_theme", next);

  const btn = document.getElementById("btn-theme-toggle");
  btn.textContent = next === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode";
  syncEditorIframeTheme(next);
  showToast(next === "dark" ? "Switched to Obsidian Dark" : "Switched to Crisp Light");
}

function syncEditorIframeTheme(theme) {
  if (!ckEditorInstance || !ckEditorInstance.document) return;
  const body = ckEditorInstance.document.getBody().$;
  if (theme === "dark") {
    body.style.backgroundColor = "#111827";
    body.style.color = "#f8fafc";
  } else {
    body.style.backgroundColor = "#ffffff";
    body.style.color = "#0f172a";
  }
}

// 5. Full-Featured CKEditor 4 Setup
function initCKEditor() {
  CKEDITOR.config.versionCheck = false;

  ckEditorInstance = CKEDITOR.replace("editor", {
    height: "100%",
    allowedContent: true,
    extraAllowedContent: "*(*);*{*}",
    versionCheck: false,
    contentsCss: [
      "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css",
      "data:text/css;charset=utf-8," + encodeURIComponent(`
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 15.5px;
          line-height: 1.7;
          padding: 14px;
          margin: 0;
        }
        img { max-width: 100%; height: auto; border-radius: 10px; }
        table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        th, td { border: 1px solid #94a3b8; padding: 8px 10px; }
        blockquote { border-left: 4px solid #6366f1; padding: 8px 12px; background: rgba(99,102,241,0.08); margin: 10px 0; }
        pre { background: #0f172a; color: #38bdf8; padding: 12px; border-radius: 10px; overflow-x: auto; }
      `)
    ],
    toolbar: [
      { name: "document", items: ["Source", "-", "Undo", "Redo", "-", "Find", "Replace"] },
      { name: "basicstyles", items: ["Bold", "Italic", "Underline", "Strike", "Subscript", "Superscript", "RemoveFormat"] },
      { name: "paragraph", items: ["NumberedList", "BulletedList", "-", "Outdent", "Indent", "-", "Blockquote", "CreateDiv", "-", "JustifyLeft", "JustifyCenter", "JustifyRight"] },
      { name: "insert", items: ["Table", "HorizontalRule", "SpecialChar", "Link", "Unlink"] },
      { name: "styles", items: ["Styles", "Format", "Font", "FontSize"] },
      { name: "colors", items: ["TextColor", "BGColor"] }
    ]
  });

  ckEditorInstance.on("instanceReady", () => {
    const warn = document.querySelector(".cke_notification_warning");
    if (warn) warn.style.display = "none";
    syncEditorIframeTheme(document.documentElement.getAttribute("data-theme"));
  });

  ckEditorInstance.on("change", () => {
    updateWordStats();
    scheduleAutoSave();
  });
}

function toggleEditorToolbar() {
  const topBar = document.querySelector(".cke_top");
  const btn = document.getElementById("btn-toggle-toolbar");
  if (!topBar) return;

  toolbarVisible = !toolbarVisible;
  topBar.style.display = toolbarVisible ? "block" : "none";
  btn.textContent = toolbarVisible ? "🧰 Hide Toolbar" : "🧰 Show Toolbar";
}

// 6. Data Bootstrap
async function bootstrapData() {
  const notebooks = await db.notebooks.toArray();
  if (notebooks.length === 0) {
    const now = Date.now();
    const nbId = await db.notebooks.add({
      title: "General Studio",
      icon: "📘",
      color: "#6366f1",
      createdAt: now,
      updatedAt: now
    });
    await db.pages.add({
      notebookId: nbId,
      title: "Welcome to Smart Note Pro V4",
      content: `<h2>Aurora Studio Workspace</h2>
        <p>Organize unlimited <b>Notebooks</b> and structured <b>Pages</b> right on your device.</p>
        <ul>
          <li><b>Rename &amp; Customize Notebooks:</b> Tap the notebook badge in the top bar or click ✏️ in the drawer to rename and pick custom icons.</li>
          <li><b>Paste AI Lessons:</b> Tap <b>Paste AI HTML</b> to import formatted notes and KaTeX formulas from Gemini or ChatGPT.</li>
          <li><b>Math Preview:</b> Switch to <b>Read Mode</b> to render formulas cleanly: $$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$</li>
        </ul>`,
      createdAt: now,
      updatedAt: now
    });
  }
  await renderSidebarLists();
}

// 7. Sidebar Rendering (2-Level Notebooks & Pages)
async function renderSidebarLists(searchQuery = "") {
  const notebooks = await db.notebooks.orderBy("updatedAt").reverse().toArray();
  const nbListEl = document.getElementById("notebook-list");
  nbListEl.innerHTML = "";

  if (!currentNotebookId && notebooks.length > 0) {
    currentNotebookId = notebooks[0].id;
  }

  for (const nb of notebooks) {
    const pageCount = await db.pages.where("notebookId").equals(nb.id).count();
    const li = document.createElement("li");
    li.className = nb.id === currentNotebookId ? "active" : "";

    const icon = nb.icon || "📘";
    const color = nb.color || "#6366f1";

    li.innerHTML = `
      <div class="nb-item-main">
        <div class="nb-color-dot" style="background:${color};">${icon}</div>
        <div class="item-title-wrap">
          <span class="item-title-text">${escapeHtml(nb.title)}</span>
          <span class="item-sub-text">${pageCount} ${pageCount === 1 ? "page" : "pages"}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-micro" title="Rename Notebook" onclick="event.stopPropagation(); openNotebookModal('edit', ${nb.id})">✏️</button>
        <button class="btn-micro" title="Delete Notebook" onclick="event.stopPropagation(); deleteNotebook(${nb.id})">🗑️</button>
      </div>
    `;
    li.onclick = () => selectNotebook(nb.id);
    nbListEl.appendChild(li);
  }

  const activeNb = notebooks.find(n => n.id === currentNotebookId);
  updateActiveNotebookHeader(activeNb);

  // Render Pages
  let pages = [];
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    const allPages = await db.pages.toArray();
    pages = allPages.filter(p =>
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.content && p.content.toLowerCase().includes(q))
    );
  } else if (currentNotebookId) {
    pages = await db.pages.where("notebookId").equals(currentNotebookId).reverse().sortBy("updatedAt");
  }

  const pageListEl = document.getElementById("page-list");
  pageListEl.innerHTML = "";

  pages.forEach(pg => {
    const li = document.createElement("li");
    li.className = pg.id === currentPageId ? "active" : "";
    const dateStr = new Date(pg.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    li.innerHTML = `
      <div class="item-title-wrap">
        <span class="item-title-text">📄 ${escapeHtml(pg.title || "Untitled Page")}</span>
        <span class="item-sub-text">Updated ${dateStr}</span>
      </div>
      <div class="item-actions">
        <button class="btn-micro" title="Delete Page" onclick="event.stopPropagation(); deletePage(${pg.id})">🗑️</button>
      </div>
    `;
    li.onclick = () => selectPage(pg.id, true);
    pageListEl.appendChild(li);
  });

  if (!currentPageId && pages.length > 0) {
    await selectPage(pages[0].id, false);
  }
}

function updateActiveNotebookHeader(nb) {
  if (!nb) return;
  document.getElementById("header-nb-icon").textContent = nb.icon || "📘";
  document.getElementById("header-nb-name").textContent = nb.title;
  document.getElementById("active-notebook-label").textContent = `PAGES • ${nb.title.toUpperCase()}`;
}

// 8. Create & Rename / Customize Notebook Modal
function initNotebookCustomizerPickers() {
  document.querySelectorAll("#nb-icon-picker .icon-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#nb-icon-picker .icon-opt").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedNbIcon = btn.dataset.icon;
    });
  });

  document.querySelectorAll("#nb-color-picker .color-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#nb-color-picker .color-opt").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedNbColor = btn.dataset.color;
    });
  });
}

async function openNotebookModal(mode, nbId = null) {
  nbModalMode = mode;
  editingNotebookId = nbId;

  const titleEl = document.getElementById("nb-modal-title");
  const nameInput = document.getElementById("nb-name-input");

  if (mode === "edit" && nbId) {
    const nb = await db.notebooks.get(nbId);
    if (!nb) return;
    titleEl.textContent = "✏️ Rename & Customize Notebook";
    nameInput.value = nb.title || "";
    selectedNbIcon = nb.icon || "📘";
    selectedNbColor = nb.color || "#6366f1";
  } else {
    titleEl.textContent = "📓 Create New Notebook";
    nameInput.value = "";
    selectedNbIcon = "📘";
    selectedNbColor = "#6366f1";
  }

  document.querySelectorAll("#nb-icon-picker .icon-opt").forEach(b => {
    b.classList.toggle("selected", b.dataset.icon === selectedNbIcon);
  });
  document.querySelectorAll("#nb-color-picker .color-opt").forEach(b => {
    b.classList.toggle("selected", b.dataset.color === selectedNbColor);
  });

  document.getElementById("notebook-modal").style.display = "flex";
  setTimeout(() => nameInput.focus(), 80);
}

function openEditActiveNotebook() {
  if (currentNotebookId) {
    openNotebookModal("edit", currentNotebookId);
  }
}

function closeNotebookModal() {
  document.getElementById("notebook-modal").style.display = "none";
}

async function saveNotebookModal() {
  const name = document.getElementById("nb-name-input").value.trim();
  if (!name) {
    showToast("Please enter a notebook name", "error");
    return;
  }

  const now = Date.now();
  if (nbModalMode === "edit" && editingNotebookId) {
    await db.notebooks.update(editingNotebookId, {
      title: name,
      icon: selectedNbIcon,
      color: selectedNbColor,
      updatedAt: now
    });
    showToast("Notebook updated", "success");
  } else {
    await saveCurrentPage(false);
    const newNbId = await db.notebooks.add({
      title: name,
      icon: selectedNbIcon,
      color: selectedNbColor,
      createdAt: now,
      updatedAt: now
    });
    const newPgId = await db.pages.add({
      notebookId: newNbId,
      title: "Page 1",
      content: "<p>Start writing or paste AI lesson HTML here...</p>",
      createdAt: now,
      updatedAt: now
    });
    currentNotebookId = newNbId;
    currentPageId = null;
    await renderSidebarLists();
    await selectPage(newPgId, true);
    closeNotebookModal();
    showToast("New notebook created", "success");
    return;
  }

  closeNotebookModal();
  await renderSidebarLists();
}

async function selectNotebook(nbId) {
  await saveCurrentPage(false);
  currentNotebookId = nbId;
  currentPageId = null;
  await renderSidebarLists();
}

async function deleteNotebook(id) {
  const count = await db.notebooks.count();
  if (count <= 1) {
    showToast("At least one notebook is required", "error");
    return;
  }
  if (confirm("Delete this notebook and all pages inside it?")) {
    await db.pages.where("notebookId").equals(id).delete();
    await db.notebooks.delete(id);
    if (currentNotebookId === id) {
      currentNotebookId = null;
      currentPageId = null;
    }
    await renderSidebarLists();
    showToast("Notebook deleted");
  }
}

// 9. Page Management & Auto-Save
async function createNewPage() {
  if (!currentNotebookId) return;
  await saveCurrentPage(false);

  const now = Date.now();
  const count = await db.pages.where("notebookId").equals(currentNotebookId).count();
  const pgId = await db.pages.add({
    notebookId: currentNotebookId,
    title: `Untitled Page ${count + 1}`,
    content: "<p></p>",
    createdAt: now,
    updatedAt: now
  });

  await db.notebooks.update(currentNotebookId, { updatedAt: now });
  await renderSidebarLists();
  await selectPage(pgId, true);
  showToast("New page added", "success");
}

async function selectPage(pgId, shouldCloseSidebar = true) {
  if (currentPageId && currentPageId !== pgId) {
    await saveCurrentPage(false);
  }

  const pg = await db.pages.get(pgId);
  if (!pg) return;

  currentNotebookId = pg.notebookId;
  currentPageId = pg.id;

  document.getElementById("page-title").value = pg.title || "";
  if (ckEditorInstance) {
    ckEditorInstance.setData(pg.content || "");
  }

  if (workspaceMode === "read") {
    renderReaderContent();
  }

  updateWordStats();
  setSaveStatus("Saved", true);
  await renderSidebarLists();
  if (shouldCloseSidebar) closeSidebar();
}

async function deletePage(pgId) {
  const count = await db.pages.where("notebookId").equals(currentNotebookId).count();
  if (count <= 1) {
    showToast("Each notebook must have at least one page", "error");
    return;
  }
  if (confirm("Delete this page?")) {
    await db.pages.delete(pgId);
    if (currentPageId === pgId) currentPageId = null;
    await renderSidebarLists();
    showToast("Page deleted");
  }
}

function scheduleAutoSave() {
  setSaveStatus("Saving...", false);
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveCurrentPage(false);
  }, 1400);
}

async function saveCurrentPage(manual = true) {
  if (!currentPageId || !ckEditorInstance) return;
  const title = document.getElementById("page-title").value.trim() || "Untitled Page";
  const content = ckEditorInstance.getData();
  const now = Date.now();

  await db.pages.update(currentPageId, {
    title: title,
    content: content,
    updatedAt: now
  });

  if (currentNotebookId) {
    await db.notebooks.update(currentNotebookId, { updatedAt: now });
  }

  setSaveStatus("Saved", true);
  const activePageTitle = document.querySelector("#page-list li.active .item-title-text");
  if (activePageTitle) activePageTitle.textContent = `📄 ${title}`;
  if (manual) showToast("Page saved", "success");
}

function setSaveStatus(label, isSaved) {
  document.getElementById("save-status").textContent = label;
  const dot = document.getElementById("save-dot");
  dot.className = isSaved ? "dot-saved" : "dot-saving";
}

function updateWordStats() {
  if (!ckEditorInstance) return;
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = ckEditorInstance.getData();
  const text = (tempDiv.textContent || "").trim();
  const words = text ? text.split(/\s+/).length : 0;
  const readMins = Math.max(1, Math.ceil(words / 200));
  document.getElementById("word-stats").textContent = `${words} words • ${readMins} min read`;
}

function onSearchInput(val) {
  renderSidebarLists(val);
}

// 10. Workspace Mode Switcher (Write vs. Reader Mode)
function setWorkspaceMode(mode) {
  workspaceMode = mode;
  const writeBtn = document.getElementById("btn-mode-write");
  const readBtn = document.getElementById("btn-mode-read");
  const editorWrap = document.getElementById("editor-wrapper");
  const readerWrap = document.getElementById("reader-wrapper");

  if (mode === "read") {
    saveCurrentPage(false);
    renderReaderContent();
    editorWrap.style.display = "none";
    readerWrap.style.display = "block";
    readBtn.classList.add("active");
    writeBtn.classList.remove("active");
  } else {
    readerWrap.style.display = "none";
    editorWrap.style.display = "flex";
    writeBtn.classList.add("active");
    readBtn.classList.remove("active");
  }
}

function renderReaderContent() {
  const title = document.getElementById("page-title").value || "Untitled Page";
  const nbName = document.getElementById("header-nb-name").textContent;
  const html = ckEditorInstance ? ckEditorInstance.getData() : "";

  document.getElementById("reader-title").textContent = title;
  document.getElementById("reader-meta-line").textContent = `${nbName} • ${document.getElementById("word-stats").textContent}`;

  const container = document.getElementById("reader-content");
  container.innerHTML = html;

  if (typeof renderMathInElement === "function") {
    renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true }
      ],
      throwOnError: false
    });
  }
}

function changeReaderFontSize(delta) {
  readerFontSize = Math.min(24, Math.max(13, readerFontSize + delta));
  document.getElementById("reader-content").style.fontSize = readerFontSize + "px";
}

// 11. Content Insertion Helpers (Paste HTML, Math, Callout, Photo)
function openPasteHtmlModal() {
  document.getElementById("raw-html-input").value = "";
  document.getElementById("paste-modal").style.display = "flex";
}

function closePasteHtmlModal() {
  document.getElementById("paste-modal").style.display = "none";
}

function insertRawHtmlToEditor() {
  const raw = document.getElementById("raw-html-input").value;
  if (!raw.trim()) return;
  if (workspaceMode === "read") setWorkspaceMode("write");
  ckEditorInstance.insertHtml(raw);
  closePasteHtmlModal();
  saveCurrentPage(true);
}

function insertMathFormulaPrompt() {
  const formula = prompt("Enter LaTeX formula (e.g. \\frac{-b \\pm \\sqrt{\\Delta}}{2a}):", "E = mc^2");
  if (formula && formula.trim()) {
    if (workspaceMode === "read") setWorkspaceMode("write");
    ckEditorInstance.insertHtml(` $$${formula.trim()}$$ `);
    saveCurrentPage(true);
  }
}

function insertCalloutBox() {
  if (workspaceMode === "read") setWorkspaceMode("write");
  ckEditorInstance.insertHtml(`<blockquote><p><strong>💡 Key Takeaway:</strong> Write your highlighted insight here...</p></blockquote><p></p>`);
  saveCurrentPage(false);
}

function triggerPhotoPicker() {
  document.getElementById("photo-picker-input").click();
}

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 960;
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const offCanvas = document.createElement("canvas");
      offCanvas.width = width;
      offCanvas.height = height;
      offCanvas.getContext("2d").drawImage(img, 0, 0, width, height);

      const compressed = offCanvas.toDataURL("image/jpeg", 0.8);
      if (workspaceMode === "read") setWorkspaceMode("write");
      ckEditorInstance.insertHtml(`<p><img src="${compressed}" style="max-width:100%; height:auto; border-radius:10px;" /></p>`);
      saveCurrentPage(true);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

// 12. Whiteboard Hand-Drawing Canvas Engine (With Undo & Grid Paper)
const canvas = document.getElementById("drawing-board");
const ctx = canvas.getContext("2d");
let isDrawing = false;

function initCanvasDrawing() {
  resetCanvasSurface();
  document.getElementById("brush-size").addEventListener("input", (e) => {
    document.getElementById("brush-size-val").textContent = e.target.value + "px";
  });
  document.getElementById("brush-color").addEventListener("input", (e) => {
    currentPenColor = e.target.value;
    setPenMode();
  });

  canvas.addEventListener("pointerdown", startDrawing);
  canvas.addEventListener("pointermove", draw);
  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
}

function resetCanvasSurface() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (isGridEnabled) {
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }
}

function saveCanvasSnapshot() {
  if (canvasUndoStack.length > 20) canvasUndoStack.shift();
  canvasUndoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function undoCanvasStroke() {
  if (canvasUndoStack.length > 0) {
    const prev = canvasUndoStack.pop();
    ctx.putImageData(prev, 0, 0);
  }
}

function toggleCanvasGrid() {
  isGridEnabled = !isGridEnabled;
  document.getElementById("btn-grid").classList.toggle("active", isGridEnabled);
  saveCanvasSnapshot();
  resetCanvasSurface();
}

function startDrawing(e) {
  saveCanvasSnapshot();
  isDrawing = true;
  ctx.beginPath();
  const pos = getCanvasPos(e);
  ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);
  ctx.lineWidth = document.getElementById("brush-size").value;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = isEraserMode ? "#ffffff" : currentPenColor;
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

function stopDrawing() {
  isDrawing = false;
  ctx.beginPath();
}

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function setEraserMode() {
  isEraserMode = true;
  document.getElementById("btn-eraser").classList.add("active");
  document.getElementById("btn-pen").classList.remove("active");
}

function setPenMode() {
  isEraserMode = false;
  document.getElementById("btn-pen").classList.add("active");
  document.getElementById("btn-eraser").classList.remove("active");
}

function clearCanvas() {
  saveCanvasSnapshot();
  resetCanvasSurface();
}

function openCanvasModal() {
  document.getElementById("canvas-modal").style.display = "flex";
}

function closeCanvasModal() {
  document.getElementById("canvas-modal").style.display = "none";
}

function insertDrawingToEditor() {
  const dataURL = canvas.toDataURL("image/png");
  if (workspaceMode === "read") setWorkspaceMode("write");
  ckEditorInstance.insertHtml(`<p><img src="${dataURL}" style="max-width:100%; height:auto; border:1px solid #cbd5e1; border-radius:10px;" /></p>`);
  canvasUndoStack = [];
  resetCanvasSurface();
  closeCanvasModal();
  saveCurrentPage(true);
}

// 13. Drawer Navigation
function openSidebar() {
  saveCurrentPage(false);
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").style.display = "block";
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").style.display = "none";
}

// 14. Cloud Backup & Restore Engine
function openCloudModal() {
  document.getElementById("cloud-modal").style.display = "flex";
}

function closeCloudModal() {
  document.getElementById("cloud-modal").style.display = "none";
}

function restoreSavedCloudEmail() {
  const saved = localStorage.getItem("app0006_cloud_email");
  if (saved) document.getElementById("cloud-email").value = saved;
}

async function buildFullBackupPackage() {
  await saveCurrentPage(false);
  return {
    app: window.APP_CONFIG.appId,
    version: window.APP_CONFIG.version,
    exportedAt: new Date().toISOString(),
    notebooks: await db.notebooks.toArray(),
    pages: await db.pages.toArray()
  };
}

async function applyBackupPackage(pkg) {
  if (pkg && Array.isArray(pkg.notebooks) && Array.isArray(pkg.pages)) {
    const normalizedNotebooks = pkg.notebooks.map(nb => ({
      ...nb,
      icon: nb.icon || "📘",
      color: nb.color || "#6366f1"
    }));
    await db.notebooks.clear();
    await db.pages.clear();
    await db.notebooks.bulkAdd(normalizedNotebooks);
    await db.pages.bulkAdd(pkg.pages);
    currentNotebookId = null;
    currentPageId = null;
    await bootstrapData();
    return true;
  }
  return false;
}

async function performCloudBackup() {
  const email = document.getElementById("cloud-email").value.trim();
  const password = document.getElementById("cloud-pass").value.trim();
  const label = document.getElementById("cloud-label").value.trim();

  if (!email || !password) {
    showToast("Please enter both email and password", "error");
    return;
  }

  localStorage.setItem("app0006_cloud_email", email);
  const fullPackage = await buildFullBackupPackage();

  try {
    const res = await fetch(window.APP_CONFIG.backupUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: window.APP_CONFIG.securityToken,
        email: email,
        password: password,
        label: label,
        data: fullPackage
      })
    });
    const result = await res.json();
    showToast(result.message, result.status === "success" ? "success" : "error");
    if (result.status === "success") {
      document.getElementById("cloud-label").value = "";
      triggerInterstitialAd();
    }
  } catch (err) {
    showToast("Cloud error: " + err.message, "error");
  }
}

async function fetchCloudVersions() {
  const email = document.getElementById("cloud-email").value.trim();
  const password = document.getElementById("cloud-pass").value.trim();

  if (!email || !password) {
    showToast("Please enter email and password first", "error");
    return;
  }

  localStorage.setItem("app0006_cloud_email", email);

  try {
    const res = await fetch(window.APP_CONFIG.restoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: window.APP_CONFIG.securityToken,
        email: email,
        password: password,
        action: "list"
      })
    });
    const result = await res.json();

    if (result.status === "success") {
      const listEl = document.getElementById("cloud-versions-list");
      listEl.innerHTML = "";
      document.getElementById("cloud-versions-wrapper").style.display = "block";

      if (!result.backups || result.backups.length === 0) {
        listEl.innerHTML = "<li style='padding:10px;'>No cloud backups found.</li>";
        return;
      }

      result.backups.forEach(item => {
        const li = document.createElement("li");
        const noteTag = item.label ? ` • <b>${escapeHtml(item.label)}</b>` : "";
        const statsTag = item.notebooks_count !== undefined
          ? ` (${item.notebooks_count} nb, ${item.pages_count} pg)`
          : "";
        li.innerHTML = `
          <div>
            <div>📅 ${item.timestamp}${noteTag}</div>
            <small style="color:var(--text-muted);">${item.size_kb || 0} KB${statsTag}</small>
          </div>
          <div style="display:flex; gap:5px;">
            <button class="canvas-btn active" onclick="restoreCloudVersion('${item.filename}')">Restore</button>
            <button class="canvas-btn" onclick="deleteCloudVersion('${item.filename}')">🗑️</button>
          </div>
        `;
        listEl.appendChild(li);
      });
    } else {
      showToast(result.message, "error");
    }
  } catch (err) {
    showToast("Failed to load versions: " + err.message, "error");
  }
}

async function restoreCloudVersion(filename) {
  const email = document.getElementById("cloud-email").value.trim();
  const password = document.getElementById("cloud-pass").value.trim();

  if (!confirm("Restoring this version will replace your current local notebooks. Continue?")) return;

  try {
    const res = await fetch(window.APP_CONFIG.restoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: window.APP_CONFIG.securityToken,
        email: email,
        password: password,
        action: "fetch",
        filename: filename
      })
    });
    const result = await res.json();

    if (result.status === "success" && await applyBackupPackage(result.data)) {
      closeCloudModal();
      showToast("Cloud backup restored successfully", "success");
    } else {
      showToast(result.message || "Invalid backup file", "error");
    }
  } catch (err) {
    showToast("Restore failed: " + err.message, "error");
  }
}

async function deleteCloudVersion(filename) {
  const email = document.getElementById("cloud-email").value.trim();
  const password = document.getElementById("cloud-pass").value.trim();

  if (!confirm("Permanently delete this cloud snapshot?")) return;

  try {
    const res = await fetch(window.APP_CONFIG.restoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: window.APP_CONFIG.securityToken,
        email: email,
        password: password,
        action: "delete",
        filename: filename
      })
    });
    const result = await res.json();
    showToast(result.message, result.status === "success" ? "success" : "error");
    if (result.status === "success") fetchCloudVersions();
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

// 15. Local JSON Export & Import
async function exportDataJSON() {
  const fullPackage = await buildFullBackupPackage();
  const blob = new Blob([JSON.stringify(fullPackage, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SmartNote_0006_V4_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("JSON backup exported", "success");
  triggerInterstitialAd();
}

function triggerImport() {
  document.getElementById("import-file-input").click();
}

function importDataJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (await applyBackupPackage(parsed)) {
        closeSidebar();
        showToast("Backup imported successfully", "success");
      } else {
        showToast("Invalid backup JSON structure", "error");
      }
    } catch (err) {
      showToast("Failed to parse JSON file", "error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// 16. Native AdMob Integration (Banner + Interstitial)
async function initAdMobNative() {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.AdMob) {
      const { AdMob } = window.Capacitor.Plugins;
      const cfg = window.APP_CONFIG.admob;

      await AdMob.initialize({
        initializeForTesting: cfg.isTesting
      });

      await AdMob.showBanner({
        adId: cfg.bannerId,
        adSize: "ADAPTIVE_BANNER",
        position: "BOTTOM_CENTER",
        margin: 0,
        isTesting: cfg.isTesting
      });

      const webAdSlot = document.getElementById("admob-banner-container");
      if (webAdSlot) webAdSlot.style.display = "none";
      document.getElementById("app-footer").style.paddingBottom = "56px";
    }
  } catch (e) {
    console.warn("AdMob skipped:", e);
  }
}

async function triggerInterstitialAd() {
  actionCounter++;
  const cfg = window.APP_CONFIG.admob;
  if (actionCounter % cfg.interstitialInterval !== 0) return;

  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.AdMob) {
      const { AdMob } = window.Capacitor.Plugins;
      await AdMob.prepareInterstitial({
        adId: cfg.interstitialId,
        isTesting: cfg.isTesting
      });
      await AdMob.showInterstitial();
    }
  } catch (e) {
    console.warn("Interstitial skipped:", e);
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
