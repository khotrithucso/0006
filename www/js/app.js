// Disable CKEditor Version Warning Banner globally
if (window.CKEDITOR) {
  CKEDITOR.config.versionCheck = false;
}

// Initialize IndexedDB via Dexie
const db = new Dexie("App0006SmartNotebookDB");
db.version(1).stores({
  notebooks: "++id, title, content, createdAt, updatedAt"
});

let currentNotebookId = null;
let ckEditorInstance = null;
let isEraserMode = false;
let currentPenColor = "#1e293b";
const SECRET_TOKEN = "PhuongDevNe";

// Application Entrypoint
window.addEventListener("DOMContentLoaded", async () => {
  initCKEditor();
  initCanvasDrawing();
  await loadNotebooksList();
});

// Comprehensive Mobile-Optimized CKEditor Toolbar Setup with Source HTML & Extended Tools
function initCKEditor() {
  CKEDITOR.config.versionCheck = false;
  
  ckEditorInstance = CKEDITOR.replace("editor", {
    height: "100%",
    allowedContent: true,
    extraAllowedContent: "*(*);*{*}",
    versionCheck: false,
    toolbar: [
      { name: "document", items: ["Source", "-", "Preview", "Print"] },
      { name: "clipboard", items: ["Cut", "Copy", "Paste", "PasteText", "PasteFromWord", "-", "Undo", "Redo"] },
      { name: "editing", items: ["Find", "Replace", "-", "SelectAll"] },
      { name: "basicstyles", items: ["Bold", "Italic", "Underline", "Strike", "Subscript", "Superscript", "-", "RemoveFormat"] },
      { name: "paragraph", items: ["NumberedList", "BulletedList", "-", "Outdent", "Indent", "-", "Blockquote", "-", "JustifyLeft", "JustifyCenter", "JustifyRight", "JustifyBlock"] },
      { name: "links", items: ["Link", "Unlink"] },
      { name: "insert", items: ["Image", "Table", "HorizontalRule", "SpecialChar", "Smiley"] },
      { name: "styles", items: ["Styles", "Format", "Font", "FontSize"] },
      { name: "colors", items: ["TextColor", "BGColor"] },
      { name: "tools", items: ["Maximize", "ShowBlocks"] }
    ]
  });

  ckEditorInstance.on("instanceReady", () => {
    const warn = document.querySelector(".cke_notification_warning");
    if (warn) warn.style.display = "none";
  });

  ckEditorInstance.on("change", () => {
    document.getElementById("save-status").textContent = "Unsaved changes...";
    triggerKaTeXRender();
    updateWordCount();
  });
}

function triggerKaTeXRender() {
  setTimeout(() => {
    if (!ckEditorInstance || !ckEditorInstance.document) return;
    const bodyNode = ckEditorInstance.document.getBody().$;
    if (typeof renderMathInElement === "function") {
      renderMathInElement(bodyNode, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
      });
    }
  }, 350);
}

function updateWordCount() {
  if (!ckEditorInstance) return;
  const text = ckEditorInstance.document.getBody().getText() || "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const wordCountEl = document.getElementById("word-count-display");
  if (wordCountEl) {
    wordCountEl.textContent = `${words} words | ${chars} chars`;
  }
}

// Notebook Library CRUD
async function loadNotebooksList(filterText = "") {
  let notebooks = await db.notebooks.orderBy("updatedAt").reverse().toArray();
  
  if (filterText.trim() !== "") {
    const query = filterText.toLowerCase();
    notebooks = notebooks.filter(nb => 
      (nb.title && nb.title.toLowerCase().includes(query)) || 
      (nb.content && nb.content.toLowerCase().includes(query))
    );
  }

  const listEl = document.getElementById("notebook-list");
  listEl.innerHTML = "";

  if (notebooks.length === 0 && filterText === "") {
    await createNewNotebook();
    return;
  }

  notebooks.forEach(nb => {
    const li = document.createElement("li");
    li.className = nb.id === currentNotebookId ? "active" : "";
    
    const titleSpan = document.createElement("span");
    titleSpan.textContent = nb.title || "Untitled Notebook";
    titleSpan.onclick = () => selectNotebook(nb.id);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-close";
    delBtn.innerHTML = "🗑️";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteNotebook(nb.id);
    };

    li.appendChild(titleSpan);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });

  if (!currentNotebookId && notebooks.length > 0) {
    selectNotebook(notebooks[0].id);
  }
}

async function createNewNotebook() {
  // Save current note before creating new one
  if (currentNotebookId) {
    await saveCurrentNoteAuto();
  }

  const timestamp = new Date().getTime();
  const id = await db.notebooks.add({
    title: "New Notebook " + new Date().toLocaleDateString("en-US"),
    content: "<p>Paste HTML or LaTeX content from Gemini/ChatGPT here...</p>",
    createdAt: timestamp,
    updatedAt: timestamp
  });
  await selectNotebook(id);
  await loadNotebooksList();
  closeSidebar();
}

async function selectNotebook(id) {
  if (currentNotebookId === id) return;

  // Auto-save current note before switching
  if (currentNotebookId) {
    await saveCurrentNoteAuto();
  }

  currentNotebookId = id;
  const nb = await db.notebooks.get(id);
  if (nb) {
    document.getElementById("note-title").value = nb.title || "";
    if (ckEditorInstance) {
      ckEditorInstance.setData(nb.content || "", () => {
        triggerKaTeXRender();
        updateWordCount();
      });
    }
  }
  document.getElementById("save-status").textContent = "All changes saved";
  loadNotebooksList();
}

async function saveCurrentNoteAuto() {
  if (!currentNotebookId) return;
  const titleField = document.getElementById("note-title");
  const title = titleField ? titleField.value : "Untitled Notebook";
  const content = ckEditorInstance ? ckEditorInstance.getData() : "";

  await db.notebooks.update(currentNotebookId, {
    title: title,
    content: content,
    updatedAt: new Date().getTime()
  });

  const statusEl = document.getElementById("save-status");
  if (statusEl) statusEl.textContent = "All changes saved";
  loadNotebooksList();
}

async function deleteNotebook(id) {
  if (confirm("Are you sure you want to delete this notebook?")) {
    await db.notebooks.delete(id);
    if (currentNotebookId === id) {
      currentNotebookId = null;
    }
    await loadNotebooksList();
    const notebooks = await db.notebooks.toArray();
    if (notebooks.length > 0) {
      await selectNotebook(notebooks[0].id);
    } else {
      await createNewNotebook();
    }
  }
}

function onSearchInput(val) { loadNotebooksList(val); }

// Navigation UI
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").style.display = "block";
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").style.display = "none";
}

function insertMathFormulaPrompt() {
  const formula = prompt("Enter LaTeX math formula (e.g., \\frac{a}{b} or E = mc^2):", "\\int_{0}^{\\infty} x^2 dx");
  if (formula) {
    ckEditorInstance.insertHtml(` $$${formula}$$ `);
    triggerKaTeXRender();
    updateWordCount();
  }
}

// Canvas Drawing Engine
const canvas = document.getElementById("drawing-board");
const ctx = canvas.getContext("2d");
let isDrawing = false;

function initCanvasDrawing() {
  const sizeInput = document.getElementById("brush-size");
  if (sizeInput) {
    sizeInput.addEventListener("input", (e) => {
      const valEl = document.getElementById("brush-size-val");
      if (valEl) valEl.textContent = e.target.value + "px";
    });
  }
  const colorInput = document.getElementById("brush-color");
  if (colorInput) {
    colorInput.addEventListener("input", (e) => {
      currentPenColor = e.target.value;
      setPenMode();
    });
  }

  if (canvas) {
    canvas.addEventListener("pointerdown", startDrawing);
    canvas.addEventListener("pointermove", draw);
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
  }
}

function startDrawing(e) {
  isDrawing = true;
  ctx.beginPath();
  const pos = getCanvasPos(e);
  ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);
  const sizeEl = document.getElementById("brush-size");
  const size = sizeEl ? sizeEl.value : 4;

  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (isEraserMode) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = currentPenColor;
  }

  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

function stopDrawing() { isDrawing = false; ctx.beginPath(); }

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function setEraserMode() {
  isEraserMode = true;
  const eraserBtn = document.getElementById("btn-eraser");
  const penBtn = document.getElementById("btn-pen");
  if (eraserBtn) eraserBtn.classList.add("active");
  if (penBtn) penBtn.classList.remove("active");
}

function setPenMode() {
  isEraserMode = false;
  const eraserBtn = document.getElementById("btn-eraser");
  const penBtn = document.getElementById("btn-pen");
  if (penBtn) penBtn.classList.add("active");
  if (eraserBtn) eraserBtn.classList.remove("active");
}

function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
function openCanvasModal() { 
  const modal = document.getElementById("canvas-modal");
  if (modal) modal.style.display = "flex"; 
}
function closeCanvasModal() { 
  const modal = document.getElementById("canvas-modal");
  if (modal) modal.style.display = "none"; 
}

function insertDrawingToEditor() {
  const dataURL = canvas.toDataURL("image/png");
  ckEditorInstance.insertHtml(`<p><img src="${dataURL}" style="max-width:100%; height:auto; border-radius:8px;" /></p>`);
  clearCanvas();
  closeCanvasModal();
  saveCurrentNoteAuto();
  updateWordCount();
}

// Cloud Backup & Sync Engine
function openCloudModal() { 
  const modal = document.getElementById("cloud-modal");
  if (modal) modal.style.display = "flex"; 
}
function closeCloudModal() { 
  const modal = document.getElementById("cloud-modal");
  if (modal) modal.style.display = "none"; 
}




async function fetchCloudVersions() {
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  const email = emailEl ? emailEl.value : "";
  const password = passEl ? passEl.value : "";

  if (!email || !password) {
    alert("Please enter credentials first.");
    return;
  }

  try {
    const res = await fetch("https://khotrithucso.io.vn/apps/0006/restore.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: SECRET_TOKEN,
        email: email,
        password: password,
        action: "list"
      })
    });
    const result = await res.json();
    
    if (result.status === "success") {
      const listEl = document.getElementById("cloud-versions-list");
      const wrapperEl = document.getElementById("cloud-versions-wrapper");
      if (wrapperEl) wrapperEl.style.display = "block";
      if (listEl) {
        listEl.innerHTML = "";

        if (result.backups.length === 0) {
          listEl.innerHTML = "<li style='padding:10px;'>No backups found.</li>";
          return;
        }

        result.backups.forEach(item => {
          const li = document.createElement("li");
          li.innerHTML = `<span>📅 ${item.timestamp}</span> <button class='btn-tool-sm' onclick='restoreCloudVersion("${item.filename}")'>Restore</button>`;
          listEl.appendChild(li);
        });
      }
    } else {
      alert(result.message);
    }
  } catch (err) {
    alert("Error fetching versions: " + err.message);
  }
}


async function performCloudBackup() {
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  const email = emailEl ? emailEl.value.trim() : "";
  const password = passEl ? passEl.value.trim() : "";

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  // Lưu nội dung đang gõ xuống IndexedDB trước khi đẩy lên server
  await saveCurrentNoteAuto();

  const allNotebooks = await db.notebooks.toArray();
  if (allNotebooks.length === 0) {
    alert("No notebooks to backup.");
    return;
  }

  try {
    const res = await fetch("https://khotrithucso.io.vn/apps/0006/backup.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: SECRET_TOKEN,
        email: email,
        password: password,
        data: allNotebooks
      })
    });
    const result = await res.json();
    alert(result.message);
  } catch (err) {
    alert("Cloud connection failed: " + err.message);
  }
}

async function restoreCloudVersion(filename) {
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  const email = emailEl ? emailEl.value.trim() : "";
  const password = passEl ? passEl.value.trim() : "";

  if (!confirm("Restoring will overwrite your current local data. Continue?")) return;

  try {
    const res = await fetch("https://khotrithucso.io.vn/apps/0006/restore.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: SECRET_TOKEN,
        email: email,
        password: password,
        action: "fetch",
        filename: filename
      })
    });
    const result = await res.json();

    if (result.status === "success" && Array.isArray(result.data)) {
      // Reset ID hiện tại về null trước khi xóa DB để ép giao diện nạp lại dữ liệu mới
      currentNotebookId = null;

      await db.notebooks.clear();
      if (result.data.length > 0) {
        await db.notebooks.bulkPut(result.data);
      }

      closeCloudModal();
      closeSidebar();
      await loadNotebooksList();
      alert("Data restored successfully!");
    } else {
      alert(result.message || "Invalid restore data.");
    }
  } catch (err) {
    alert("Restore failed: " + err.message);
  }
}
 