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

// Compact Mobile-Optimized CKEditor Toolbar Setup
function initCKEditor() {
  CKEDITOR.config.versionCheck = false;
  
  ckEditorInstance = CKEDITOR.replace("editor", {
    height: "100%",
    allowedContent: true,
    extraAllowedContent: "*(*);*{*}",
    versionCheck: false,
    toolbar: [
      { name: "basicstyles", items: ["Bold", "Italic", "Underline", "Strike", "RemoveFormat"] },
      { name: "paragraph", items: ["NumberedList", "BulletedList", "-", "Blockquote", "-", "JustifyLeft", "JustifyCenter", "JustifyRight"] },
      { name: "insert", items: ["Image", "Table", "SpecialChar"] },
      { name: "styles", items: ["Format"] },
      { name: "colors", items: ["TextColor", "BGColor"] }
    ]
  });

  ckEditorInstance.on("instanceReady", () => {
    const warn = document.querySelector(".cke_notification_warning");
    if (warn) warn.style.display = "none";
  });

  ckEditorInstance.on("change", () => {
    document.getElementById("save-status").textContent = "Unsaved changes...";
    triggerKaTeXRender();
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
  currentNotebookId = id;
  const nb = await db.notebooks.get(id);
  if (nb) {
    document.getElementById("note-title").value = nb.title || "";
    ckEditorInstance.setData(nb.content || "", () => {
      triggerKaTeXRender();
    });
  }
  document.getElementById("save-status").textContent = "All changes saved";
  loadNotebooksList();
}

async function saveCurrentNoteAuto() {
  if (!currentNotebookId) return;
  const title = document.getElementById("note-title").value;
  const content = ckEditorInstance.getData();

  await db.notebooks.update(currentNotebookId, {
    title: title,
    content: content,
    updatedAt: new Date().getTime()
  });

  document.getElementById("save-status").textContent = "All changes saved";
  loadNotebooksList();
}

async function deleteNotebook(id) {
  if (confirm("Are you sure you want to delete this notebook?")) {
    await db.notebooks.delete(id);
    if (currentNotebookId === id) currentNotebookId = null;
    await loadNotebooksList();
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
  }
}

// Canvas Drawing Engine
const canvas = document.getElementById("drawing-board");
const ctx = canvas.getContext("2d");
let isDrawing = false;

function initCanvasDrawing() {
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

function startDrawing(e) {
  isDrawing = true;
  ctx.beginPath();
  const pos = getCanvasPos(e);
  ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);
  const size = document.getElementById("brush-size").value;

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
  document.getElementById("btn-eraser").classList.add("active");
  document.getElementById("btn-pen").classList.remove("active");
}

function setPenMode() {
  isEraserMode = false;
  document.getElementById("btn-pen").classList.add("active");
  document.getElementById("btn-eraser").classList.remove("active");
}

function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
function openCanvasModal() { document.getElementById("canvas-modal").style.display = "flex"; }
function closeCanvasModal() { document.getElementById("canvas-modal").style.display = "none"; }

function insertDrawingToEditor() {
  const dataURL = canvas.toDataURL("image/png");
  ckEditorInstance.insertHtml(`<p><img src="${dataURL}" style="max-width:100%; height:auto; border-radius:8px;" /></p>`);
  clearCanvas();
  closeCanvasModal();
  saveCurrentNoteAuto();
}

// Cloud Backup & Sync Engine
function openCloudModal() { document.getElementById("cloud-modal").style.display = "flex"; }
function closeCloudModal() { document.getElementById("cloud-modal").style.display = "none"; }

async function performCloudBackup() {
  const email = document.getElementById("cloud-email").value;
  const password = document.getElementById("cloud-pass").value;

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  const allNotebooks = await db.notebooks.toArray();
  
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

async function fetchCloudVersions() {
  const email = document.getElementById("cloud-email").value;
  const password = document.getElementById("cloud-pass").value;

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
      listEl.innerHTML = "";
      document.getElementById("cloud-versions-wrapper").style.display = "block";

      if (result.backups.length === 0) {
        listEl.innerHTML = "<li style='padding:10px;'>No backups found.</li>";
        return;
      }

      result.backups.forEach(item => {
        const li = document.createElement("li");
        li.innerHTML = `<span>📅 ${item.timestamp}</span> <button class='btn-tool-sm' onclick='restoreCloudVersion("${item.filename}")'>Restore</button>`;
        listEl.appendChild(li);
      });
    } else {
      alert(result.message);
    }
  } catch (err) {
    alert("Error fetching versions: " + err.message);
  }
}

async function restoreCloudVersion(filename) {
  const email = document.getElementById("cloud-email").value;
  const password = document.getElementById("cloud-pass").value;

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
      await db.notebooks.clear();
      await db.notebooks.bulkAdd(result.data);
      alert("Data restored successfully!");
      closeCloudModal();
      await loadNotebooksList();
    } else {
      alert(result.message || "Invalid restore data.");
    }
  } catch (err) {
    alert("Restore failed: " + err.message);
  }
}

// Local JSON Backup & Export
async function exportDataJSON() {
  const data = await db.notebooks.toArray();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SmartNote_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

function triggerImport() { document.getElementById("import-file-input").click(); }

async function importDataJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (Array.isArray(data)) {
        await db.notebooks.clear();
        await db.notebooks.bulkAdd(data);
        alert("Import successful!");
        await loadNotebooksList();
      }
    } catch (err) {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
}
 