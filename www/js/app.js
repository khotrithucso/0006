// 1. Khởi tạo Database IndexedDB qua Dexie
const db = new Dexie("App0006NotebookDB");
db.version(1).stores({
  notebooks: "++id, title, content, createdAt, updatedAt"
});

let currentNotebookId = null;
let ckEditorInstance = null;
let isEraserMode = false;
let currentPenColor = "#000000";

// 2. Khởi động App khi Window Load
window.addEventListener("DOMContentLoaded", async () => {
  initCKEditor();
  initCanvasDrawing();
  await loadNotebooksList();
});

// 3. Khởi tạo CKEditor 4 & Cấu hình Tự Động Render KaTeX
function initCKEditor() {
  ckEditorInstance = CKEDITOR.replace("editor", {
    height: "100%",
    allowedContent: true, // Cho phép paste đầy đủ thẻ HTML từ Gemini/ChatGPT
    extraAllowedContent: "*(*);*{*}",
    toolbar: [
      { name: "document", items: ["Source", "-", "NewPage", "Preview"] },
      { name: "clipboard", items: ["Cut", "Copy", "Paste", "PasteText", "PasteFromWord", "-", "Undo", "Redo"] },
      { name: "editing", items: ["Find", "Replace", "SelectAll"] },
      { name: "basicstyles", items: ["Bold", "Italic", "Underline", "Strike", "Subscript", "Superscript", "RemoveFormat"] },
      { name: "paragraph", items: ["NumberedList", "BulletedList", "-", "Outdent", "Indent", "-", "Blockquote", "-", "JustifyLeft", "JustifyCenter", "JustifyRight", "JustifyBlock"] },
      { name: "links", items: ["Link", "Unlink"] },
      { name: "insert", items: ["Image", "Table", "HorizontalRule", "Smiley", "SpecialChar"] },
      { name: "styles", items: ["Styles", "Format", "Font", "FontSize"] },
      { name: "colors", items: ["TextColor", "BGColor"] }
    ]
  });

  // Tự động quét và vẽ công thức toán KaTeX mỗi khi nội dung thay đổi
  ckEditorInstance.on("change", () => {
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
  }, 400);
}

// 4. Quản lý Danh Sách Cuốn Tập (CRUD Operations)
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
    titleSpan.textContent = nb.title || "Tập chưa đặt tên";
    titleSpan.onclick = () => selectNotebook(nb.id);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-icon";
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
    title: "Cuốn tập mới " + new Date().toLocaleDateString("vi-VN"),
    content: "<p>Dán nội dung HTML hoặc mã LaTeX từ Gemini/ChatGPT vào đây...</p>",
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

  const listEl = document.getElementById("notebook-list");
  const activeLi = listEl.querySelector("li.active span");
  if (activeLi) activeLi.textContent = title || "Tập chưa đặt tên";
}

async function deleteNotebook(id) {
  if (confirm("Bạn có chắc chắn muốn xóa cuốn tập này không?")) {
    await db.notebooks.delete(id);
    if (currentNotebookId === id) {
      currentNotebookId = null;
    }
    await loadNotebooksList();
  }
}

function onSearchInput(val) {
  loadNotebooksList(val);
}

// 5. Drawer UI Toggle Functions
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").style.display = "block";
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").style.display = "none";
}

// 6. Chèn Nhanh Mẫu Công Thức Toán (Math Helper Prompt)
function insertMathFormulaPrompt() {
  const formula = prompt("Nhập công thức LaTeX (Ví dụ: \\frac{-b \\pm \\sqrt{\\Delta}}{2a} hoặc E = mc^2):", "\\int_{0}^{\\infty} x^2 dx");
  if (formula) {
    const formatted = ` $$${formula}$$ `;
    ckEditorInstance.insertHtml(formatted);
    triggerKaTeXRender();
  }
}

// 7. Xử Lý Vẽ Tay Canvas (Drawing Board Engine)
const canvas = document.getElementById("drawing-board");
const ctx = canvas.getContext("2d");
let isDrawing = false;

function initCanvasDrawing() {
  const sizeInput = document.getElementById("brush-size");
  sizeInput.addEventListener("input", (e) => {
    document.getElementById("brush-size-val").textContent = e.target.value + "px";
  });

  const colorInput = document.getElementById("brush-color");
  colorInput.addEventListener("input", (e) => {
    currentPenColor = e.target.value;
    setPenMode();
  });

  // Event Listeners cho Touch & Mouse
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

function stopDrawing() {
  isDrawing = false;
  ctx.beginPath();
}

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function openCanvasModal() {
  document.getElementById("canvas-modal").style.display = "flex";
}

function closeCanvasModal() {
  document.getElementById("canvas-modal").style.display = "none";
}

function insertDrawingToEditor() {
  const dataURL = canvas.toDataURL("image/png");
  ckEditorInstance.insertHtml(`<p><img src="${dataURL}" style="max-width:100%; height:auto; border:1px solid #ddd; border-radius:4px;" /></p>`);
  clearCanvas();
  closeCanvasModal();
  saveCurrentNoteAuto();
}

// 8. Backup & Restore Data (Export/Import JSON)
async function exportDataJSON() {
  const allData = await db.notebooks.toArray();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allData, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `Backup_App0006_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function triggerImport() {
  document.getElementById("import-file-input").click();
}

async function importDataJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedNotebooks = JSON.parse(e.target.result);
      if (Array.isArray(importedNotebooks)) {
        await db.notebooks.clear();
        await db.notebooks.bulkAdd(importedNotebooks);
        alert("Khôi phục dữ liệu thành công!");
        await loadNotebooksList();
      } else {
        alert("File JSON không hợp lệ!");
      }
    } catch (err) {
      alert("Lỗi đọc file JSON: " + err.message);
    }
  };
  reader.readAsText(file);
}
 