import Sortable from 'sortablejs';
import { showToast } from './js/toast.js';
import {
  loadPdfJsDocument,
  renderPageThumbnail,
  renderPageToCanvas,
  mergeAndOptimizePdfs,
  formatBytes
} from './js/pdfService.js';

// State Application Management
const state = {
  files: [], // Array of { id, file, name, size, arrayBuffer, pdfJsDoc, pageCount, pages: [...] }
  customPagesOrder: null, // Array of page objects when reordered across files in Page Grid view
  viewMode: 'files', // 'files' | 'pages'
  sortableFileInstance: null,
  sortablePageInstance: null
};

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const workspaceSection = document.getElementById('workspaceSection');
const fileListView = document.getElementById('fileListView');
const pageGridView = document.getElementById('pageGridView');
const viewFilesModeBtn = document.getElementById('viewFilesModeBtn');
const viewPagesModeBtn = document.getElementById('viewPagesModeBtn');
const addMoreFilesBtn = document.getElementById('addMoreFilesBtn');
const rotateAllBtn = document.getElementById('rotateAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const mergePdfBtn = document.getElementById('mergePdfBtn');
const outputFilenameInput = document.getElementById('outputFilename');
const addPageNumbersCheckbox = document.getElementById('addPageNumbers');
const flattenAnnotationsCheckbox = document.getElementById('flattenAnnotations');

// Stats Elements
const totalFilesCountEl = document.getElementById('totalFilesCount');
const totalPagesCountEl = document.getElementById('totalPagesCount');
const totalSizeEstimateEl = document.getElementById('totalSizeEstimate');

// Theme Elements
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');

// Modals
const processingModal = document.getElementById('processingModal');
const modalStatusTitle = document.getElementById('modalStatusTitle');
const modalStatusDetail = document.getElementById('modalStatusDetail');
const modalProgressBar = document.getElementById('modalProgressBar');

const previewModal = document.getElementById('previewModal');
const previewModalTitle = document.getElementById('previewModalTitle');
const previewCanvas = document.getElementById('previewCanvas');
const closePreviewBtn = document.getElementById('closePreviewBtn');

// Initialize Event Listeners & Theme Setup
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDragAndDrop();
  initViewModes();
  initSortables();
  initButtons();
});

/* ---------------- Theme Management ---------------- */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    themeIconSun.classList.remove('hidden');
    themeIconMoon.classList.add('hidden');
  } else {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
    themeIconSun.classList.add('hidden');
    themeIconMoon.classList.remove('hidden');
  }

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      themeIconSun.classList.remove('hidden');
      themeIconMoon.classList.add('hidden');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      themeIconSun.classList.add('hidden');
      themeIconMoon.classList.remove('hidden');
      localStorage.setItem('theme', 'dark');
    }
  });
}

/* ---------------- Drag & Drop Upload ---------------- */
function initDragAndDrop() {
  browseBtn.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', (e) => {
    if (e.target === dropZone || e.target.closest('#browseBtn')) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      fileInput.value = '';
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('border-indigo-500', 'bg-indigo-950/20');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (files.length > 0) {
      handleFiles(files);
    } else {
      showToast('Por favor, selecione apenas arquivos com extensão .pdf', 'warning');
    }
  });
}

/* ---------------- Process Uploaded Files ---------------- */
async function handleFiles(filesList) {
  showProcessingModal('Carregando arquivos PDF...', 'Processando páginas e gerando miniaturas...');
  updateModalProgress(0);

  let successCount = 0;

  for (let i = 0; i < filesList.length; i++) {
    const file = filesList[i];
    updateModalProgress(((i + 1) / filesList.length) * 100);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfJsDoc = await loadPdfJsDocument(arrayBuffer.slice(0)); // clone buffer
      const pageCount = pdfJsDoc.numPages;

      const fileObj = {
        id: 'file_' + Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
        arrayBuffer,
        pdfJsDoc,
        pageCount,
        pages: []
      };

      for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
        fileObj.pages.push({
          id: `page_${fileObj.id}_${pageIdx}`,
          fileId: fileObj.id,
          fileName: file.name,
          pageIndex: pageIdx,
          pageNumber: pageIdx + 1,
          rotation: 0,
          included: true,
          thumbnailUrl: null,
          arrayBuffer,
          pdfJsDoc
        });
      }

      state.files.push(fileObj);
      successCount++;
    } catch (err) {
      console.error('Erro ao ler PDF:', file.name, err);
      showToast(`Não foi possível carregar o arquivo "${file.name}". Pode estar corrompido ou protegido.`, 'error');
    }
  }

  // Reset custom page ordering when new files are added so new pages appear at the end
  state.customPagesOrder = null;

  hideProcessingModal();

  if (successCount > 0) {
    showToast(`${successCount} arquivo(s) PDF adicionado(s) com sucesso!`, 'success');
    workspaceSection.classList.remove('hidden');
    renderWorkspace();
  }
}

/* ---------------- View Mode Switcher ---------------- */
function initViewModes() {
  viewFilesModeBtn.addEventListener('click', () => {
    state.viewMode = 'files';
    viewFilesModeBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-2 bg-indigo-600 text-white shadow transition-all';
    viewPagesModeBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-2 text-slate-400 hover:text-slate-200 transition-all';
    fileListView.classList.remove('hidden');
    pageGridView.classList.add('hidden');
    renderWorkspace();
  });

  viewPagesModeBtn.addEventListener('click', () => {
    state.viewMode = 'pages';
    viewPagesModeBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-2 bg-indigo-600 text-white shadow transition-all';
    viewFilesModeBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-2 text-slate-400 hover:text-slate-200 transition-all';
    fileListView.classList.add('hidden');
    pageGridView.classList.remove('hidden');
    renderWorkspace();
  });
}

/* ---------------- Sortable Drag and Drop Reordering ---------------- */
function initSortables() {
  state.sortableFileInstance = new Sortable(fileListView, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: (evt) => {
      const { oldIndex, newIndex } = evt;
      if (oldIndex !== newIndex && oldIndex !== undefined && newIndex !== undefined) {
        const movedItem = state.files.splice(oldIndex, 1)[0];
        state.files.splice(newIndex, 0, movedItem);
        state.customPagesOrder = null; // reset page order to reflect new file order
        renderWorkspaceStats();
      }
    }
  });

  state.sortablePageInstance = new Sortable(pageGridView, {
    animation: 150,
    handle: '.drag-handle-page',
    ghostClass: 'sortable-ghost',
    onEnd: (evt) => {
      const { oldIndex, newIndex } = evt;
      if (oldIndex !== newIndex && oldIndex !== undefined && newIndex !== undefined) {
        const currentPages = getAllPagesFlat();
        const movedPage = currentPages.splice(oldIndex, 1)[0];
        currentPages.splice(newIndex, 0, movedPage);

        state.customPagesOrder = currentPages;
        renderWorkspaceStats();
      }
    }
  });
}

/**
 * Returns a flat list of page objects in current order (respecting customPagesOrder if set).
 */
function getAllPagesFlat() {
  if (state.customPagesOrder && state.customPagesOrder.length > 0) {
    // Filter out pages belonging to files that may have been deleted
    const validFileIds = new Set(state.files.map(f => f.id));
    return state.customPagesOrder.filter(p => validFileIds.has(p.fileId));
  }

  const flat = [];
  state.files.forEach(f => {
    f.pages.forEach(p => flat.push(p));
  });
  return flat;
}

/* ---------------- Actions & Buttons Setup ---------------- */
function initButtons() {
  addMoreFilesBtn.addEventListener('click', () => fileInput.click());

  rotateAllBtn.addEventListener('click', () => {
    state.files.forEach(f => {
      f.pages.forEach(p => {
        p.rotation = (p.rotation + 90) % 360;
      });
    });
    showToast('Todas as páginas foram giradas 90°', 'info');
    renderWorkspace();
  });

  clearAllBtn.addEventListener('click', () => {
    if (confirm('Tem certeza que deseja remover todos os arquivos adicionados?')) {
      state.files = [];
      state.customPagesOrder = null;
      workspaceSection.classList.add('hidden');
      fileListView.innerHTML = '';
      pageGridView.innerHTML = '';
      showToast('Lista de arquivos limpa', 'info');
    }
  });

  closePreviewBtn.addEventListener('click', () => {
    previewModal.classList.add('hidden');
  });

  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.classList.add('hidden');
    }
  });

  mergePdfBtn.addEventListener('click', handleMergeAndDownload);
}

/* ---------------- Render Workspace ---------------- */
async function renderWorkspace() {
  renderWorkspaceStats();

  if (state.viewMode === 'files') {
    renderFileListView();
  } else {
    await renderPageGridView();
  }
}

function renderWorkspaceStats() {
  const totalFiles = state.files.length;
  let totalPages = 0;
  let totalBytes = 0;

  state.files.forEach(f => {
    totalBytes += f.size;
  });

  const activePages = getAllPagesFlat().filter(p => p.included);
  totalPages = activePages.length;

  totalFilesCountEl.textContent = `${totalFiles} arquivo(s)`;
  totalPagesCountEl.textContent = `${totalPages} página(s)`;
  totalSizeEstimateEl.textContent = formatBytes(totalBytes);

  if (totalFiles === 0) {
    workspaceSection.classList.add('hidden');
  }
}

/* ---------------- Render File View ---------------- */
function renderFileListView() {
  fileListView.innerHTML = '';

  state.files.forEach((fileObj, index) => {
    const activePageCount = fileObj.pages.filter(p => p.included).length;

    const itemEl = document.createElement('div');
    itemEl.className = 'bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-600 transition-all shadow-md group';
    itemEl.setAttribute('data-id', fileObj.id);

    itemEl.innerHTML = `
      <div class="flex items-center space-x-3 flex-1 min-w-0">
        <!-- Drag Handle -->
        <div class="drag-handle cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors shrink-0" title="Arrastar para reordenar">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
          </svg>
        </div>

        <!-- PDF Icon -->
        <div class="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
          PDF
        </div>

        <!-- File Name & Meta -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center space-x-2">
            <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">#${index + 1}</span>
            <h4 class="text-sm font-semibold text-slate-100 truncate" title="${fileObj.name}">${fileObj.name}</h4>
          </div>
          <div class="text-xs text-slate-400 mt-0.5 flex items-center space-x-2">
            <span>${activePageCount} de ${fileObj.pageCount} páginas</span>
            <span>•</span>
            <span>${formatBytes(fileObj.size)}</span>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center space-x-2 self-end md:self-auto shrink-0">
        <!-- Rotate File Pages -->
        <button type="button" class="rotate-file-btn p-2 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1 border border-slate-600 transition-colors" title="Girar todas as páginas deste arquivo em 90°">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="hidden sm:inline">Girar</span>
        </button>

        <!-- Delete File -->
        <button type="button" class="remove-file-btn p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center space-x-1 transition-colors" title="Remover este arquivo">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `;

    const rotateBtn = itemEl.querySelector('.rotate-file-btn');
    rotateBtn.addEventListener('click', () => {
      fileObj.pages.forEach(p => p.rotation = (p.rotation + 90) % 360);
      showToast(`Páginas do arquivo "${fileObj.name}" giradas 90°`, 'info');
      renderWorkspace();
    });

    const removeBtn = itemEl.querySelector('.remove-file-btn');
    removeBtn.addEventListener('click', () => {
      state.files = state.files.filter(f => f.id !== fileObj.id);
      if (state.customPagesOrder) {
        state.customPagesOrder = state.customPagesOrder.filter(p => p.fileId !== fileObj.id);
      }
      showToast(`Arquivo "${fileObj.name}" removido`, 'info');
      renderWorkspace();
    });

    fileListView.appendChild(itemEl);
  });
}

/* ---------------- Render Page Grid View ---------------- */
async function renderPageGridView() {
  pageGridView.innerHTML = '';
  const flatPages = getAllPagesFlat();

  for (let idx = 0; idx < flatPages.length; idx++) {
    const pageObj = flatPages[idx];

    const card = document.createElement('div');
    card.className = `relative rounded-xl border p-2 flex flex-col space-y-2 transition-all shadow-md group ${
      pageObj.included ? 'bg-slate-800/90 border-slate-700/80 hover:border-indigo-500/80' : 'bg-slate-900/50 border-slate-800 opacity-50'
    }`;
    card.setAttribute('data-page-id', pageObj.id);

    card.innerHTML = `
      <!-- Card Header Toolbar -->
      <div class="flex items-center justify-between text-xs text-slate-400">
        <div class="drag-handle-page cursor-grab active:cursor-grabbing p-1 hover:text-slate-200" title="Arrastar página">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
          </svg>
        </div>
        <span class="font-semibold text-slate-300">Pág. ${idx + 1}</span>
        <button type="button" class="preview-page-btn hover:text-indigo-400 p-1" title="Ampliar página">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>

      <!-- Thumbnail Preview Box -->
      <div class="relative bg-slate-950 rounded-lg h-40 flex items-center justify-center overflow-hidden border border-slate-800/80">
        <div class="thumbnail-loading text-slate-500 text-xs flex items-center space-x-1">
          <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
        <img class="thumbnail-img hidden max-h-full max-w-full object-contain transition-transform duration-200" />
      </div>

      <!-- File origin badge & Rotation indicator -->
      <div class="text-[10px] text-slate-400 truncate text-center" title="${pageObj.fileName}">
        ${pageObj.fileName} (${pageObj.pageNumber})
      </div>

      <!-- Page Controls -->
      <div class="flex items-center justify-between pt-1 border-t border-slate-700/50">
        <button type="button" class="rotate-page-btn p-1.5 rounded hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1 transition-colors" title="Girar 90°">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="text-[10px]">${pageObj.rotation}°</span>
        </button>

        <button type="button" class="toggle-include-btn p-1.5 rounded text-xs transition-colors ${
          pageObj.included ? 'text-rose-400 hover:bg-rose-500/20' : 'text-emerald-400 hover:bg-emerald-500/20'
        }" title="${pageObj.included ? 'Excluir esta página do PDF final' : 'Incluir esta página'}">
          ${pageObj.included ? 'Excluir' : 'Incluir'}
        </button>
      </div>
    `;

    const imgEl = card.querySelector('.thumbnail-img');
    const loadingEl = card.querySelector('.thumbnail-loading');

    if (!pageObj.thumbnailUrl) {
      renderPageThumbnail(pageObj.pdfJsDoc, pageObj.pageNumber)
        .then(dataUrl => {
          pageObj.thumbnailUrl = dataUrl;
          imgEl.src = dataUrl;
          imgEl.style.transform = `rotate(${pageObj.rotation}deg)`;
          loadingEl.classList.add('hidden');
          imgEl.classList.remove('hidden');
        })
        .catch(() => {
          loadingEl.textContent = 'Erro ao carregar';
        });
    } else {
      imgEl.src = pageObj.thumbnailUrl;
      imgEl.style.transform = `rotate(${pageObj.rotation}deg)`;
      loadingEl.classList.add('hidden');
      imgEl.classList.remove('hidden');
    }

    card.querySelector('.rotate-page-btn').addEventListener('click', () => {
      pageObj.rotation = (pageObj.rotation + 90) % 360;
      imgEl.style.transform = `rotate(${pageObj.rotation}deg)`;
      card.querySelector('.rotate-page-btn span').textContent = `${pageObj.rotation}°`;
    });

    card.querySelector('.toggle-include-btn').addEventListener('click', () => {
      pageObj.included = !pageObj.included;
      renderWorkspace();
    });

    card.querySelector('.preview-page-btn').addEventListener('click', () => {
      openPagePreviewModal(pageObj);
    });

    pageGridView.appendChild(card);
  }
}

/* ---------------- Preview Modal ---------------- */
async function openPagePreviewModal(pageObj) {
  previewModalTitle.textContent = `Visualizando página ${pageObj.pageNumber} - ${pageObj.fileName}`;
  previewModal.classList.remove('hidden');

  try {
    await renderPageToCanvas(pageObj.pdfJsDoc, pageObj.pageNumber, previewCanvas);
  } catch (err) {
    console.error('Erro ao renderizar prévia:', err);
    showToast('Não foi possível carregar a prévia em alta resolução.', 'error');
  }
}

/* ---------------- PDF Merge & Compression Execution ---------------- */
async function handleMergeAndDownload() {
  const activePages = getAllPagesFlat().filter(p => p.included);

  if (activePages.length === 0) {
    showToast('Nenhuma página selecionada para juntar! Inclua ao menos uma página.', 'warning');
    return;
  }

  const compressionOption = document.querySelector('input[name="compressionLevel"]:checked');
  const compressionLevel = compressionOption ? compressionOption.value : 'recommended';

  let filename = outputFilenameInput.value.trim() || 'pdf_combinado.pdf';
  if (!filename.toLowerCase().endsWith('.pdf')) {
    filename += '.pdf';
  }

  const addPageNumbers = addPageNumbersCheckbox.checked;
  const flattenAnnotations = flattenAnnotationsCheckbox.checked;

  showProcessingModal('Otimizando e gerando PDF...', 'Inicializando montagem do documento...');
  updateModalProgress(0);

  try {
    const totalOriginalSize = state.files.reduce((acc, f) => acc + f.size, 0);

    // Pass flat ordered pages directly to preserve interleaved drag-and-drop order!
    const itemsToMerge = (state.viewMode === 'pages' || state.customPagesOrder)
      ? activePages
      : state.files;

    const mergedBytes = await mergeAndOptimizePdfs(
      itemsToMerge,
      {
        compressionLevel,
        addPageNumbers,
        flattenAnnotations,
        onProgress: ({ current, total, status }) => {
          updateModalProgress((current / total) * 100);
          modalStatusDetail.textContent = status;
        }
      }
    );

    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    hideProcessingModal();

    const newSize = blob.size;
    let savingsText = '';
    if (newSize < totalOriginalSize) {
      const diff = totalOriginalSize - newSize;
      const pct = Math.round((diff / totalOriginalSize) * 100);
      savingsText = ` (Redução de ${pct}% no tamanho! De ${formatBytes(totalOriginalSize)} para ${formatBytes(newSize)})`;
    } else {
      savingsText = ` (Tamanho final: ${formatBytes(newSize)})`;
    }

    showToast(`PDF gerado e baixado com sucesso!${savingsText}`, 'success');

  } catch (err) {
    console.error('Erro ao juntar PDFs:', err);
    hideProcessingModal();
    showToast('Ocorreu um erro ao processar os PDFs. Verifique se os arquivos não estão corrompidos.', 'error');
  }
}

/* ---------------- Modal Helpers ---------------- */
function showProcessingModal(title, detail) {
  modalStatusTitle.textContent = title;
  modalStatusDetail.textContent = detail;
  processingModal.classList.remove('hidden');
}

function updateModalProgress(percent) {
  modalProgressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function hideProcessingModal() {
  processingModal.classList.add('hidden');
}
