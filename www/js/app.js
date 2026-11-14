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
const BACKUP_API_URL = "https://khotrithucso.io.vn/apps/0006/backup.php";
const RESTORE_API_URL = "https://khotrithucso.io.vn/apps/0006/restore.php";
const STORAGE_API_URL = "https://khotrithucso.io.vn/apps/0006/storage.php";

let cachedMediaItems = [];
let currentMediaFilter = "all";

// ================= HELPER UTILITIES =================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOrCreateDeviceUUID() {
  let uuid = localStorage.getItem("sn_device_uuid");
  if (!uuid) {
    uuid = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("sn_device_uuid", uuid);
  }
  return uuid;
}

function getSavedAccount() {
  return {
    uuid: getOrCreateDeviceUUID(),
    email: (localStorage.getItem("sn_user_email") || "").trim(),
    password: (localStorage.getItem("sn_user_pass") || "").trim()
  };
}

function saveAccountCredentials(email, password) {
  if (email) localStorage.setItem("sn_user_email", email.trim());
  if (password) localStorage.setItem("sn_user_pass", password.trim());
}

// ================= APPLICATION ENTRYPOINT =================
window.addEventListener("DOMContentLoaded", async () => {
  // Tự động điền lại Email/Password đã lưu
  const acc = getSavedAccount();
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  if (emailEl && acc.email) emailEl.value = acc.email;
  if (passEl && acc.password) passEl.value = acc.password;

  initCKEditor();
  initCanvasDrawing();
  await loadNotebooksList();
});

// ================= CKEDITOR & KATEX ENGINE =================
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
    triggerKaTeXRender();
    updateWordCount();
  });

  ckEditorInstance.on("change", () => {
    const statusEl = document.getElementById("save-status");
    if (statusEl) statusEl.textContent = "Unsaved changes...";
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
  if (!ckEditorInstance || !ckEditorInstance.document) return;
  const text = ckEditorInstance.document.getBody().getText() || "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const wordCountEl = document.getElementById("word-count-display");
  if (wordCountEl) {
    wordCountEl.textContent = `${words} words | ${chars} chars`;
  }
}

// ================= NOTEBOOK LIBRARY CRUD =================
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
  if (listEl) {
    listEl.innerHTML = "";
  }

  if (notebooks.length === 0 && filterText === "") {
    await createNewNotebook();
    return;
  }

  if (listEl) {
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
  }

  if (!currentNotebookId && notebooks.length > 0) {
    await selectNotebook(notebooks[0].id);
  }
}

async function createNewNotebook() {
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

  if (currentNotebookId) {
    await saveCurrentNoteAuto();
  }

  currentNotebookId = id;
  const nb = await db.notebooks.get(id);
  if (nb) {
    const titleEl = document.getElementById("note-title");
    if (titleEl) titleEl.value = nb.title || "";
    if (ckEditorInstance) {
      ckEditorInstance.setData(nb.content || "", () => {
        triggerKaTeXRender();
        updateWordCount();
      });
    }
  }
  const statusEl = document.getElementById("save-status");
  if (statusEl) statusEl.textContent = "All changes saved";
  await loadNotebooksList();
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
  await loadNotebooksList();
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

function onSearchInput(val) {
  loadNotebooksList(val);
}

// ================= NAVIGATION & MATH PROMPT =================
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
  if (formula && ckEditorInstance) {
    ckEditorInstance.insertHtml(` $$${formula}$$ `);
    triggerKaTeXRender();
    updateWordCount();
  }
}

// ================= CANVAS DRAWING ENGINE =================
const canvas = document.getElementById("drawing-board");
const ctx = canvas ? canvas.getContext("2d") : null;
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
  if (!ctx) return;
  isDrawing = true;
  ctx.beginPath();
  const pos = getCanvasPos(e);
  ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing || !ctx) return;
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

function stopDrawing() {
  if (!ctx) return;
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

function clearCanvas() {
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function openCanvasModal() {
  const modal = document.getElementById("canvas-modal");
  if (modal) modal.style.display = "flex";
}

function closeCanvasModal() {
  const modal = document.getElementById("canvas-modal");
  if (modal) modal.style.display = "none";
}

function insertDrawingToEditor() {
  if (!canvas || !ckEditorInstance) return;
  const dataURL = canvas.toDataURL("image/png");
  ckEditorInstance.insertHtml(`<p><img src="${dataURL}" style="max-width:100%; height:auto; border-radius:8px;" /></p>`);
  clearCanvas();
  closeCanvasModal();
  saveCurrentNoteAuto();
  updateWordCount();
}

// ================= CLOUD BACKUP & SYNC ENGINE =================
function openCloudModal() {
  const acc = getSavedAccount();
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  if (emailEl && acc.email && !emailEl.value) emailEl.value = acc.email;
  if (passEl && acc.password && !passEl.value) passEl.value = acc.password;

  const modal = document.getElementById("cloud-modal");
  if (modal) modal.style.display = "flex";
}

function closeCloudModal() {
  const modal = document.getElementById("cloud-modal");
  if (modal) modal.style.display = "none";
}

async function performCloudBackup() {
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  const email = emailEl ? emailEl.value.trim() : "";
  const password = passEl ? passEl.value.trim() : "";

  if (!email || !password) {
    alert("Vui lòng nhập đầy đủ Email và Mật khẩu.");
    return;
  }

  saveAccountCredentials(email, password);
  await saveCurrentNoteAuto();

  const allNotebooks = await db.notebooks.toArray();
  if (allNotebooks.length === 0) {
    alert("Không có ghi chú nào để sao lưu.");
    return;
  }

  try {
    const res = await fetch(BACKUP_API_URL, {
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
    alert("Lỗi kết nối máy chủ: " + err.message);
  }
}

async function fetchCloudVersions() {
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  const email = emailEl ? emailEl.value.trim() : "";
  const password = passEl ? passEl.value.trim() : "";

  if (!email || !password) {
    alert("Vui lòng nhập Email và Mật khẩu trước.");
    return;
  }

  saveAccountCredentials(email, password);

  try {
    const res = await fetch(RESTORE_API_URL, {
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
        if (!result.backups || result.backups.length === 0) {
          listEl.innerHTML = "<li style='padding:10px;'>Chưa có bản sao lưu nào.</li>";
          return;
        }
        result.backups.forEach(item => {
          const li = document.createElement("li");
          li.innerHTML = `<span>📅 ${escapeHtml(item.timestamp)}</span> <button class='btn-tool-sm' onclick='restoreCloudVersion("${escapeHtml(item.filename)}")'>Restore</button>`;
          listEl.appendChild(li);
        });
      }
    } else {
      alert(result.message);
    }
  } catch (err) {
    alert("Lỗi tải danh sách sao lưu: " + err.message);
  }
}

async function restoreCloudVersion(filename) {
  const emailEl = document.getElementById("cloud-email");
  const passEl = document.getElementById("cloud-pass");
  const email = emailEl ? emailEl.value.trim() : "";
  const password = passEl ? passEl.value.trim() : "";

  if (!confirm("Khôi phục sẽ ghi đè dữ liệu hiện tại trên máy. Tiếp tục?")) return;

  try {
    const res = await fetch(RESTORE_API_URL, {
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
      currentNotebookId = null;
      await db.notebooks.clear();
      if (result.data.length > 0) {
        await db.notebooks.bulkPut(result.data);
      }
      closeCloudModal();
      closeSidebar();
      await loadNotebooksList();
      alert("Khôi phục dữ liệu thành công!");
    } else {
      alert(result.message || "Dữ liệu khôi phục không hợp lệ.");
    }
  } catch (err) {
    alert("Khôi phục thất bại: " + err.message);
  }
}

// ================= MEDIA & FILE CLOUD LIBRARY ENGINE =================
function openMediaModal() {
  const modal = document.getElementById("media-modal");
  if (modal) modal.style.display = "flex";
  loadMediaLibrary();
}

function closeMediaModal() {
  const modal = document.getElementById("media-modal");
  if (modal) modal.style.display = "none";
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

function updateQuotaUI(quota) {
  if (!quota) return;
  const badgeEl = document.getElementById("media-account-badge");
  const textEl = document.getElementById("media-quota-text");
  const fillEl = document.getElementById("media-quota-fill");
  const bannerEl = document.getElementById("media-upgrade-banner");

  if (badgeEl) {
    if (quota.email) {
      badgeEl.textContent = `📧 ${quota.email} (${quota.tier === "PRO" ? "PRO" : "Free"})`;
    } else {
      badgeEl.textContent = `📱 Khách (${quota.tier})`;
    }
  }

  if (textEl) {
    textEl.textContent = `${formatFileSize(quota.used_bytes)} / ${formatFileSize(quota.quota_bytes)}`;
  }

  const pct = Math.min(100, quota.percent_used || 0);
  if (fillEl) {
    fillEl.style.width = pct + "%";
    fillEl.style.background = pct >= 90 ? "#ef4444" : (pct >= 75 ? "#f59e0b" : "#10b981");
  }

  if (bannerEl) {
    bannerEl.style.display = pct >= 85 ? "block" : "none";
  }
}

async function loadMediaLibrary() {
  const gridEl = document.getElementById("media-library-grid");
  if (gridEl) gridEl.innerHTML = `<p class="media-empty-msg">⏳ Đang tải danh sách file...</p>`;

  const acc = getSavedAccount();
  try {
    const res = await fetch(STORAGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: SECRET_TOKEN,
        action: "list",
        uuid: acc.uuid,
        email: acc.email
      })
    });
    const result = await res.json();
    if (result.status === "success") {
      cachedMediaItems = result.items || [];
      updateQuotaUI(result.quota);
      renderMediaGrid();
    } else {
      if (gridEl) gridEl.innerHTML = `<p class="media-empty-msg">❌ ${escapeHtml(result.message)}</p>`;
    }
  } catch (err) {
    if (gridEl) gridEl.innerHTML = `<p class="media-empty-msg">❌ Lỗi kết nối: ${escapeHtml(err.message)}</p>`;
  }
}

function filterMediaLibrary(type, btnEl) {
  currentMediaFilter = type;
  document.querySelectorAll(".media-tab").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderMediaGrid();
}

function renderMediaGrid() {
  const gridEl = document.getElementById("media-library-grid");
  if (!gridEl) return;

  const filtered = cachedMediaItems.filter(item => {
    if (currentMediaFilter === "all") return true;
    return item.type === currentMediaFilter;
  });

  if (filtered.length === 0) {
    gridEl.innerHTML = `<p class="media-empty-msg">Chưa có ảnh hoặc tài liệu nào trong mục này.</p>`;
    return;
  }

  gridEl.innerHTML = "";
  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "media-card";

    const safeName = escapeHtml(item.name);
    const safeUrl = escapeHtml(item.url);
    const safeExt = escapeHtml(item.ext);
    const safeId = escapeHtml(item.id);
    const uploadDate = item.uploaded_at ? item.uploaded_at.split(" ")[0] : "";

    const thumbHtml = item.type === "image"
      ? `<img src="${safeUrl}" class="media-thumb" loading="lazy" alt="${safeName}">`
      : `<div class="media-thumb">📄<small style="font-size:0.7rem;margin-left:4px;text-transform:uppercase;">.${safeExt}</small></div>`;

    card.innerHTML = `
      ${thumbHtml}
      <div class="media-info">
        <div class="media-name" title="${safeName}">${safeName}</div>
        <div class="media-meta">${formatFileSize(item.size)} • ${uploadDate}</div>
      </div>
      <div class="media-card-actions">
        <button class="btn-media-insert" onclick='insertMediaToEditor("${safeId}")'>➕ Chèn vào bài</button>
        <button class="btn-media-del" onclick='deleteMediaItem("${safeId}")' title="Xóa">🗑️</button>
      </div>
    `;
    gridEl.appendChild(card);
  });
}

async function handleMediaFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const btnUpload = document.getElementById("btn-trigger-upload");
  const origBtnText = btnUpload ? btnUpload.textContent : "";
  const acc = getSavedAccount();

  for (let i = 0; i < files.length; i++) {
    if (btnUpload) btnUpload.textContent = `⏳ Đang tải lên (${i + 1}/${files.length})...`;

    const formData = new FormData();
    formData.append("token", SECRET_TOKEN);
    formData.append("action", "upload");
    formData.append("uuid", acc.uuid);
    formData.append("email", acc.email);
    formData.append("file", files[i]);

    try {
      const res = await fetch(STORAGE_API_URL, {
        method: "POST",
        body: formData
      });
      const result = await res.json();

      if (result.status === "success") {
        cachedMediaItems.unshift(result.file);
        updateQuotaUI(result.quota);
      } else if (result.status === "quota_exceeded") {
        updateQuotaUI(result.quota);
        alert(result.message);
        break;
      } else {
        alert(`Lỗi tải file "${files[i].name}": ${result.message}`);
      }
    } catch (err) {
      alert(`Lỗi mạng khi tải "${files[i].name}": ${err.message}`);
    }
  }

  if (btnUpload) btnUpload.textContent = origBtnText;
  event.target.value = "";
  renderMediaGrid();
}

function insertMediaToEditor(fileId) {
  const item = cachedMediaItems.find(it => it.id === fileId);
  if (!item || !ckEditorInstance) return;

  const safeName = escapeHtml(item.name);
  const safeUrl = escapeHtml(item.url);

  if (item.type === "image") {
    ckEditorInstance.insertHtml(
      `<p><img src="${safeUrl}" alt="${safeName}" style="max-width:100%; height:auto; border-radius:8px; margin:6px 0;" /></p>`
    );
  } else {
    const sizeStr = formatFileSize(item.size);
    const attachmentHtml = `
      <p>
        <a href="${safeUrl}" download="${safeName}" target="_blank" rel="noopener"
           style="display:inline-flex; align-items:center; gap:8px; padding:10px 14px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; color:#0369a1; text-decoration:none; font-weight:600; font-size:14px; margin:4px 0;">
          <span>📎</span>
          <span>${safeName} (${sizeStr})</span>
          <span style="background:#0284c7; color:#fff; padding:2px 8px; border-radius:6px; font-size:12px;">Tải xuống</span>
        </a>
      </p>`;
    ckEditorInstance.insertHtml(attachmentHtml);
  }

  closeMediaModal();
  saveCurrentNoteAuto();
  updateWordCount();
}

async function deleteMediaItem(fileId) {
  if (!confirm("Xóa file này khỏi đám mây? (Lưu ý: các bài viết đang chèn link file này sẽ không tải được nữa)")) return;

  const acc = getSavedAccount();
  try {
    const res = await fetch(STORAGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: SECRET_TOKEN,
        action: "delete",
        uuid: acc.uuid,
        email: acc.email,
        file_id: fileId
      })
    });
    const result = await res.json();
    if (result.status === "success") {
      cachedMediaItems = cachedMediaItems.filter(it => it.id !== fileId);
      updateQuotaUI(result.quota);
      renderMediaGrid();
    } else {
      alert(result.message);
    }
  } catch (err) {
    alert("Lỗi xóa file: " + err.message);
  }
}
