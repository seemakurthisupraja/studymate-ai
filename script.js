/**
 * StudyMate AI – Frontend Controller
 * 
 * Handles:
 * 1. Client-side PDF text extraction using PDF.js
 * 2. API communication with Express backend (Gemini 3.5 Flash)
 * 3. Rendering structured Study Notes (Summary, Key Points, Definitions, 2/5/10-Mark Exam Qs, Quick Revision)
 * 4. Interactive Practice Quiz Arena (MCQs with instant color & text feedback and score tracking)
 * 5. Grounded Q&A Chatbot ("Ask StudyMate")
 * 6. Export tools (Markdown download, Print, Clipboard copy)
 */

// Configure PDF.js Worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Global Application State
const StudyMateApp = {
  currentFile: null,
  extractedText: '',
  pageCount: 0,
  wordCount: 0,
  notesData: null,
  quizData: null,
  quizState: {
    userAnswers: {},
    score: 0,
    answeredCount: 0
  },
  chatHistory: [],
  customApiKey: localStorage.getItem('studymate_custom_api_key') || ''
};

// Built-in Sample Study Material for instant testing
const SAMPLE_STUDY_MATERIAL = `
Operating Systems & Distributed Architecture: Process Scheduling and Google File System (GFS)

Chapter 1: Process Scheduling in Modern Operating Systems
An operating system (OS) is core system software that manages computer hardware and software resources. One of the central responsibilities of the operating system kernel is Process Scheduling and CPU Management.

A process is an active program in execution. A process state alternates between Ready, Running, and Blocked (Waiting). 
The OS uses CPU Scheduling Algorithms to allocate CPU cores to processes in the ready queue:
1. First-Come, First-Served (FCFS): Non-preemptive algorithm where the process requesting CPU first gets allocated first. Vulnerable to the 'Convoy Effect' where short processes wait behind a massive I/O or compute-heavy task.
2. Shortest Job First (SJF) & Shortest Remaining Time First (SRTF): Chooses the process with the smallest execution burst time. Mathematically optimal for minimizing average turnaround and waiting times, though difficult to predict future burst times in practice.
3. Round Robin (RR): Preemptive scheduling where each process gets a small fixed slice of CPU time known as a 'Time Quantum' (typically 10-100ms). If the time quantum expires, the process is moved to the back of the ready queue. Prevents starvation and guarantees fair responsiveness in interactive operating systems.
4. Multilevel Feedback Queue (MLFQ): Multiple queues with differing priority levels and time quantums. CPU-intensive batch jobs drop to lower-priority queues, while interactive I/O-bound jobs stay in higher-priority queues.

Key Performance Metrics:
- Turnaround Time: Total time elapsed from process submission to completion.
- Waiting Time: Total time a process spends waiting in the ready queue.
- Response Time: Time from request submission to the first generated response.
- Throughput: Number of processes completed per unit of time.

Chapter 2: Distributed Storage & Google File System (GFS)
Google File System (GFS) is a scalable distributed file system developed by Google to meet rapidly expanding data processing requirements on large clusters of commodity hardware.

Architectural Principles & Design Assumptions:
1. Hardware Failure is the Norm: Systems built from thousands of commodity disks and nodes experience regular disk crashes and network partitions. Fault tolerance, proactive monitoring, and automatic self-recovery are architectural requirements.
2. Large Files: Files are typically gigabytes to terabytes in size. Managing billions of tiny KB-sized files is not the target optimization.
3. Append-Dominated Writes: Most files are mutated by appending new data rather than overwriting existing records.
4. Large Block Size: GFS divides files into fixed-size chunks of 64 Megabytes (MB). Each chunk has an immutable 64-bit globally unique chunk handle assigned by the Master at creation.

GFS Architecture Components:
- Single Master Node: Maintains all file system metadata in memory (namespace hierarchy, access control, file-to-chunk mapping, and chunk replica locations). Periodically communicates with Chunkservers via Heartbeat messages.
- Chunkservers: Store 64MB chunks as ordinary Linux files on local disks. Chunks are replicated across 3 separate chunkservers by default on distinct racks to safeguard against power outage or rack switch failures.
- GFS Client: Code library linked into applications that communicates with the Master for metadata lookups, and then connects directly to Chunkservers for data transfer (reads and writes) to eliminate master throughput bottlenecks.
`;

// Initialize App upon DOM load
document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  initServerStatusCheck();
  initUploadHandlers();
  initNavigationTabs();
  initActionButtons();
  initQuizListeners();
  initChatListeners();
  initSettingsModal();
});

/**
 * Check backend server status & API Key availability
 */
async function initServerStatusCheck() {
  const badge = document.getElementById('serverStatusBadge');
  if (!badge) return;
  const text = badge.querySelector('.status-text');

  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.status === 'online') {
      badge.className = 'status-badge status-online';
      if (data.hasApiKey || StudyMateApp.customApiKey) {
        text.textContent = 'Gemini Ready';
      } else {
        badge.className = 'status-badge status-loading';
        text.textContent = 'API Key Needed';
        showToast('Please configure your Gemini API Key in .env or Settings.', 'info');
      }
    }
  } catch (err) {
    badge.className = 'status-badge status-offline';
    if (text) text.textContent = 'Server Offline';
    console.error('Server status check failed:', err);
  }
}

/**
 * Initialize Drag-and-Drop & File Upload Handlers
 */
function initUploadHandlers() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('pdfFileInput');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const loadSampleBtn = document.getElementById('loadSampleDocBtn');

  if (!dropzone || !fileInput) return;

  // Click dropzone to open file dialog (unless clicking remove button or file info)
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('#removeFileBtn') || e.target.closest('.file-info-state')) return;
    fileInput.click();
  });

  // Handle keyboard interaction (Enter / Space)
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // Drag over animations
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  // Handle file drop
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  });

  // Handle file input selection
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  });

  // Remove file button
  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetUploadedFile();
    });
  }

  // Load sample material button
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', () => {
      loadSampleMaterial();
    });
  }
}

/**
 * Validate and process selected file
 */
async function processSelectedFile(file) {
  hideErrorBanner();

  // Validate file extension / MIME type
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showErrorBanner('Invalid File Format', 'Please upload a valid PDF document (.pdf file).');
    return;
  }

  // Max 25MB check
  if (file.size > 25 * 1024 * 1024) {
    showErrorBanner('File Too Large', 'The uploaded PDF exceeds the 25MB limit. Please upload a smaller document.');
    return;
  }

  StudyMateApp.currentFile = file;

  // Show extraction UI
  document.getElementById('dropzonePrompt')?.classList.add('hidden');
  document.getElementById('fileInfoState')?.classList.add('hidden');
  document.getElementById('extractingState')?.classList.remove('hidden');

  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('extractingProgress');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    const totalPages = pdfDoc.numPages;
    StudyMateApp.pageCount = totalPages;

    let fullText = '';

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (progressText) progressText.textContent = `Extracting text from page ${pageNum} of ${totalPages}...`;
      const progressPercent = Math.round((pageNum / totalPages) * 100);
      if (progressBar) progressBar.style.width = `${progressPercent}%`;

      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `\n--- Page ${pageNum} ---\n` + pageText;
    }

    const cleanText = fullText.trim();

    // Check if extracted text is empty (e.g. scanned image PDF without OCR)
    if (!cleanText || cleanText.replace(/--- Page \d+ ---/g, '').trim().length < 20) {
      throw new Error('This PDF appears to be a scanned image or empty. No selectable text could be extracted.');
    }

    StudyMateApp.extractedText = cleanText;
    const words = cleanText.split(/\s+/).filter(Boolean).length;
    StudyMateApp.wordCount = words;

    // Display File Meta
    displayFileMetadata(file.name, file.size, totalPages, words);
    showToast('PDF processed successfully! Ready to generate notes.', 'success');

  } catch (err) {
    console.error('PDF extraction error:', err);
    resetUploadedFile();
    showErrorBanner('PDF Extraction Failed', err.message || 'Could not extract readable text from this PDF.');
  }
}

/**
 * Load built-in sample document for instant testing
 */
function loadSampleMaterial() {
  hideErrorBanner();
  StudyMateApp.currentFile = { name: 'Operating_Systems_&_GFS_Study_Guide.pdf', size: 145000 };
  StudyMateApp.extractedText = SAMPLE_STUDY_MATERIAL.trim();
  StudyMateApp.pageCount = 3;
  StudyMateApp.wordCount = StudyMateApp.extractedText.split(/\s+/).filter(Boolean).length;

  displayFileMetadata(
    'Operating_Systems_&_GFS_Study_Guide.pdf',
    145000,
    3,
    StudyMateApp.wordCount
  );

  showToast('Loaded sample study material on OS & GFS!', 'info');
}

/**
 * Render File Metadata in UI
 */
function displayFileMetadata(name, sizeInBytes, pages, words) {
  document.getElementById('dropzonePrompt')?.classList.add('hidden');
  document.getElementById('extractingState')?.classList.add('hidden');
  document.getElementById('fileInfoState')?.classList.remove('hidden');

  const nameEl = document.getElementById('fileNameDisplay');
  const sizeEl = document.getElementById('fileSizeDisplay');
  const pageEl = document.getElementById('pageCountDisplay');
  const wordEl = document.getElementById('wordCountDisplay');
  const readEl = document.getElementById('readingTimeDisplay');

  if (nameEl) nameEl.textContent = name;
  if (sizeEl) sizeEl.textContent = formatBytes(sizeInBytes);
  if (pageEl) pageEl.textContent = `${pages} Page${pages > 1 ? 's' : ''}`;
  if (wordEl) wordEl.textContent = `${words.toLocaleString()} Words`;

  const readingTime = Math.max(1, Math.round(words / 200));
  if (readEl) readEl.textContent = `~${readingTime} min read`;

  // Enable buttons
  const genBtn = document.getElementById('generateNotesBtn');
  const viewBtn = document.getElementById('viewExtractedTextBtn');
  if (genBtn) {
    genBtn.disabled = false;
    genBtn.classList.remove('btn-loading');
    genBtn.innerHTML = '<span class="btn-ai-sparkle">✨</span><span class="btn-label-text">Generate Study Notes</span>';
  }
  if (viewBtn) viewBtn.classList.remove('hidden');

  // Update Raw text preview
  const rawDisplay = document.getElementById('extractedRawTextDisplay');
  if (rawDisplay) rawDisplay.textContent = StudyMateApp.extractedText;
}

/**
 * Reset file upload state
 */
function resetUploadedFile() {
  StudyMateApp.currentFile = null;
  StudyMateApp.extractedText = '';
  StudyMateApp.pageCount = 0;
  StudyMateApp.wordCount = 0;

  const fileInput = document.getElementById('pdfFileInput');
  if (fileInput) fileInput.value = '';

  document.getElementById('dropzonePrompt')?.classList.remove('hidden');
  document.getElementById('extractingState')?.classList.add('hidden');
  document.getElementById('fileInfoState')?.classList.add('hidden');

  const genBtn = document.getElementById('generateNotesBtn');
  const viewBtn = document.getElementById('viewExtractedTextBtn');
  const progressBar = document.getElementById('progressBar');

  if (genBtn) {
    genBtn.disabled = true;
    genBtn.classList.remove('btn-loading');
    genBtn.innerHTML = '<span class="btn-ai-sparkle">✨</span><span class="btn-label-text">Generate Study Notes</span>';
  }
  if (viewBtn) viewBtn.classList.add('hidden');
  if (progressBar) progressBar.style.width = '0%';
}

/**
 * Initialize Notes Tab Navigation
 */
function initNavigationTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  // Exam marks sub-tabs filter
  const examSubtabs = document.querySelectorAll('.exam-subtab');
  examSubtabs.forEach(subtab => {
    subtab.addEventListener('click', () => {
      examSubtabs.forEach(t => t.classList.remove('active'));
      subtab.classList.add('active');
      filterExamQuestions(subtab.getAttribute('data-exam-type'));
    });
  });

  // Definitions search filter
  const defSearch = document.getElementById('defSearchInput');
  if (defSearch) {
    defSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const cards = document.querySelectorAll('.def-card');
      cards.forEach(card => {
        const term = card.querySelector('.def-term')?.textContent.toLowerCase() || '';
        const explanation = card.querySelector('.def-explanation')?.textContent.toLowerCase() || '';
        if (term.includes(query) || explanation.includes(query)) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }
}

function switchTab(targetId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const activeTabBtn = document.querySelector(`.nav-tab[data-tab="${targetId}"]`);
  const activePane = document.getElementById(targetId);

  if (activeTabBtn) activeTabBtn.classList.add('active');
  if (activePane) activePane.classList.add('active');
}

/**
 * Initialize Main Buttons & Actions
 */
function initActionButtons() {
  const generateNotesBtn = document.getElementById('generateNotesBtn');
  const viewExtractedBtn = document.getElementById('viewExtractedTextBtn');
  const copyAllNotesBtn = document.getElementById('copyAllNotesBtn');
  const downloadMarkdownBtn = document.getElementById('downloadMarkdownBtn');
  const printNotesBtn = document.getElementById('printNotesBtn');
  const closeErrorBtn = document.getElementById('closeErrorBannerBtn');

  if (generateNotesBtn) generateNotesBtn.addEventListener('click', generateStudyNotes);
  if (viewExtractedBtn) viewExtractedBtn.addEventListener('click', openTextInspectorModal);
  if (copyAllNotesBtn) copyAllNotesBtn.addEventListener('click', copyAllNotesToClipboard);
  if (downloadMarkdownBtn) downloadMarkdownBtn.addEventListener('click', downloadNotesAsMarkdown);
  if (printNotesBtn) printNotesBtn.addEventListener('click', () => window.print());
  if (closeErrorBtn) closeErrorBtn.addEventListener('click', hideErrorBanner);
}

/**
 * Core AI Dispatch: Generate Study Notes
 */
async function generateStudyNotes() {
  if (!StudyMateApp.extractedText) {
    showToast('Please upload a PDF or load sample material first.', 'error');
    return;
  }

  hideErrorBanner();
  showGenerationLoader(true);

  // Animate step progress in loader
  const stepItems = [
    document.getElementById('step1'),
    document.getElementById('step2'),
    document.getElementById('step3'),
    document.getElementById('step4'),
    document.getElementById('step5')
  ].filter(Boolean);

  // Reset steps
  stepItems.forEach((st, i) => {
    if (i < 2) st.classList.add('active');
    else st.classList.remove('active');
  });

  let stepIdx = 2;
  const stepInterval = setInterval(() => {
    if (stepIdx < stepItems.length) {
      stepItems[stepIdx]?.classList.add('active');
      stepIdx++;
    }
  }, 1000);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof StudyMateAuth !== 'undefined') {
      const token = await StudyMateAuth.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    if (StudyMateApp.customApiKey) {
      headers['x-gemini-api-key'] = StudyMateApp.customApiKey;
    }

    const response = await fetch('/api/generate-notes', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text: StudyMateApp.extractedText })
    });

    clearInterval(stepInterval);
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      const parsed = parseApiError(result, 'Failed to generate study notes', response.status);
      showGenerationLoader(false);
      showErrorBanner(parsed.title, parsed.message, () => generateStudyNotes(), parsed.retryLabel);
      showToast(parsed.isQuota ? 'AI temporarily unavailable: usage limit reached' : parsed.message, 'error');
      return;
    }

    StudyMateApp.notesData = result.data;
    renderStudyNotes(result.data);

    // Show results section
    showGenerationLoader(false);
    document.getElementById('resultsSection')?.classList.remove('hidden');
    switchTab('tab-summary');

    // Smooth scroll to results
    document.getElementById('resultsSection')?.scrollIntoView({ behavior: 'smooth' });
    showToast('Study notes successfully generated!', 'success');

  } catch (err) {
    clearInterval(stepInterval);
    showGenerationLoader(false);
    console.error('Error generating notes:', err);
    const parsed = parseApiError({ message: err.message }, 'Failed to communicate with Gemini AI.');
    showErrorBanner(parsed.title, parsed.message, () => generateStudyNotes(), parsed.retryLabel);
    showToast(parsed.isQuota ? 'AI temporarily unavailable: usage limit reached' : parsed.message, 'error');
  }
}

/**
 * Render Structured Study Notes in UI
 */
function renderStudyNotes(data) {
  // 1. Topic Title
  const topicTitle = document.getElementById('generatedTopicTitle');
  if (topicTitle) {
    topicTitle.textContent = data.topic || 'Comprehensive Study Notes';
  }

  // 2. Summary
  const summaryDiv = document.getElementById('summaryText');
  if (summaryDiv) {
    summaryDiv.innerHTML = formatMarkdownToHtml(data.summary || 'Summary unavailable.');
  }

  // 3. Key Points
  const keyPointsList = document.getElementById('keyPointsList');
  if (keyPointsList) {
    keyPointsList.innerHTML = '';
    const keyPoints = data.keyPoints || [];
    const kpBadge = document.getElementById('keyPointsBadge');
    if (kpBadge) kpBadge.textContent = keyPoints.length;

    keyPoints.forEach((point, idx) => {
      const li = document.createElement('li');
      li.className = 'key-point-item';
      const numStr = String(idx + 1).padStart(2, '0');
      let title = `Key Concept ${numStr}`;
      let body = point;
      if (point.includes(':')) {
        const parts = point.split(':');
        title = parts[0].trim();
        body = parts.slice(1).join(':').trim();
      } else if (point.includes(' - ')) {
        const parts = point.split(' - ');
        title = parts[0].trim();
        body = parts.slice(1).join(' - ').trim();
      }
      li.innerHTML = `
        <div class="key-point-top-row">
          <span class="key-point-seq">${numStr}</span>
          <span class="key-point-check">✓</span>
        </div>
        <h4 class="key-point-heading">${escapeHtml(title)}</h4>
        <p class="key-point-desc">${escapeHtml(body)}</p>
      `;
      keyPointsList.appendChild(li);
    });
  }

  // 4. Definitions
  const defsGrid = document.getElementById('definitionsGrid');
  if (defsGrid) {
    defsGrid.innerHTML = '';
    const definitions = data.definitions || [];
    const defBadge = document.getElementById('definitionsBadge');
    if (defBadge) defBadge.textContent = definitions.length;

    definitions.forEach(def => {
      const card = document.createElement('div');
      card.className = 'def-card';
      card.innerHTML = `
        <h4 class="def-term">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path></svg>
          <span>${escapeHtml(def.term)}</span>
        </h4>
        <p class="def-explanation">${escapeHtml(def.explanation)}</p>
      `;
      defsGrid.appendChild(card);
    });
  }

  // 5. Exam Questions (2-mark, 5-mark, 10-mark)
  renderExamQuestions(data.examQuestions || {});

  // 6. Quick Revision
  const revisionList = document.getElementById('quickRevisionList');
  if (revisionList) {
    revisionList.innerHTML = '';
    const revPoints = data.quickRevision || [];
    revPoints.forEach((rev, idx) => {
      const item = document.createElement('div');
      item.className = 'rev-item';
      item.innerHTML = `
        <span class="rev-icon">⚡</span>
        <div><strong>Key Takeaway ${idx + 1}:</strong> ${escapeHtml(rev)}</div>
      `;
      revisionList.appendChild(item);
    });
  }
}

/**
 * Render Exam Questions Hub with Accordions
 */
function renderExamQuestions(examData) {
  const container = document.getElementById('examQuestionsContainer');
  if (!container) return;
  container.innerHTML = '';

  const twoMark = examData.twoMark || [];
  const fiveMark = examData.fiveMark || [];
  const tenMark = examData.tenMark || [];

  const allQuestions = [
    ...twoMark.map(q => ({ ...q, type: 'twoMark', badge: '2 MARK', badgeDesc: 'Definition / Recall', badgeClass: 'badge-2mark' })),
    ...fiveMark.map(q => ({ ...q, type: 'fiveMark', badge: '5 MARK', badgeDesc: 'Explain / Compare', badgeClass: 'badge-5mark' })),
    ...tenMark.map(q => ({ ...q, type: 'tenMark', badge: '10 MARK', badgeDesc: 'Analyze / Discuss', badgeClass: 'badge-10mark' }))
  ];

  allQuestions.forEach((qObj, index) => {
    const card = document.createElement('div');
    card.className = 'exam-q-card';
    card.setAttribute('data-type', qObj.type);

    card.innerHTML = `
      <div class="exam-q-header" tabindex="0" role="button" aria-expanded="false">
        <div class="exam-q-title-wrap">
          <div class="marks-badge-cluster">
            <span class="marks-badge ${qObj.badgeClass}">${qObj.badge}</span>
            <span class="marks-badge-desc">${qObj.badgeDesc}</span>
          </div>
          <span class="exam-q-text">${escapeHtml(qObj.question)}</span>
        </div>
        <span class="exam-q-toggle-icon">▼</span>
      </div>
      <div class="exam-q-body">
        <div class="exam-solution-box">
          <div class="solution-label">Model Answer</div>
          <div class="solution-text">${formatMarkdownToHtml(qObj.answer || 'Answer outline.')}</div>
        </div>
      </div>
    `;

    // Accordion Toggle
    const header = card.querySelector('.exam-q-header');
    header.addEventListener('click', () => {
      const expanded = card.classList.toggle('expanded');
      header.setAttribute('aria-expanded', expanded);
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const expanded = card.classList.toggle('expanded');
        header.setAttribute('aria-expanded', expanded);
      }
    });

    container.appendChild(card);
  });
}

/**
 * Filter Exam Questions by Mark Category
 */
function filterExamQuestions(type) {
  const cards = document.querySelectorAll('.exam-q-card');
  cards.forEach(card => {
    if (type === 'all' || card.getAttribute('data-type') === type) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

/**
 * Initialize Interactive Quiz Arena
 */
function initQuizListeners() {
  const startQuizBtn = document.getElementById('startQuizBtn');
  const regenerateQuizBtn = document.getElementById('regenerateQuizBtn');
  const resetQuizBtn = document.getElementById('resetQuizBtn');
  const retakeQuizBtn = document.getElementById('retakeQuizBtn');

  if (startQuizBtn) startQuizBtn.addEventListener('click', generateQuiz);
  if (regenerateQuizBtn) regenerateQuizBtn.addEventListener('click', generateQuiz);
  if (resetQuizBtn) resetQuizBtn.addEventListener('click', resetQuizAnswers);
  if (retakeQuizBtn) retakeQuizBtn.addEventListener('click', resetQuizAnswers);
}

/**
 * AI Dispatch: Generate 5-Question MCQ Quiz
 */
async function generateQuiz() {
  if (!StudyMateApp.extractedText) {
    showToast('Please upload study material first.', 'error');
    return;
  }

  const emptyState = document.getElementById('quizEmptyState');
  const loadingState = document.getElementById('quizLoadingState');
  const quizContainer = document.getElementById('quizContainer');

  emptyState?.classList.add('hidden');
  loadingState?.classList.remove('hidden');
  quizContainer?.classList.add('hidden');

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof StudyMateAuth !== 'undefined') {
      const token = await StudyMateAuth.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    if (StudyMateApp.customApiKey) {
      headers['x-gemini-api-key'] = StudyMateApp.customApiKey;
    }

    const res = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text: StudyMateApp.extractedText })
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) {
      const parsed = parseApiError(result, 'Failed to generate quiz', res.status);
      loadingState?.classList.add('hidden');
      emptyState?.classList.remove('hidden');
      showToast(parsed.message, 'error');

      if (emptyState) {
        const heading = emptyState.querySelector('h4');
        const desc = emptyState.querySelector('p');
        const startBtn = emptyState.querySelector('#startQuizBtn');
        if (heading) heading.textContent = parsed.title;
        if (desc) desc.textContent = parsed.message;
        if (startBtn) {
          startBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
            <span>${parsed.retryLabel || (parsed.isQuota ? 'Try Again Later' : 'Retry')}</span>
          `;
        }
      }
      return;
    }

    StudyMateApp.quizData = result.data;
    renderQuizQuestions(result.data);

    loadingState?.classList.add('hidden');
    quizContainer?.classList.remove('hidden');
    showToast('Practice Quiz Ready!', 'success');

  } catch (err) {
    console.error('Quiz generation error:', err);
    loadingState?.classList.add('hidden');
    emptyState?.classList.remove('hidden');
    const parsed = parseApiError({ message: err.message }, 'Failed to generate quiz');
    showToast(parsed.message, 'error');
    if (emptyState) {
      const heading = emptyState.querySelector('h4');
      const desc = emptyState.querySelector('p');
      const startBtn = emptyState.querySelector('#startQuizBtn');
      if (heading) heading.textContent = parsed.title;
      if (desc) desc.textContent = parsed.message;
      if (startBtn) {
        startBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
          <span>${parsed.retryLabel || (parsed.isQuota ? 'Try Again Later' : 'Retry')}</span>
        `;
      }
    }
  }
}

/**
 * Render 5 MCQ Cards
 */
function renderQuizQuestions(quizData) {
  const list = document.getElementById('quizQuestionsList');
  if (!list) return;
  list.innerHTML = '';
  document.getElementById('quizCompletedBanner')?.classList.add('hidden');

  StudyMateApp.quizState = {
    userAnswers: {},
    score: 0,
    answeredCount: 0
  };

  updateQuizScoreboard();

  const questions = quizData.questions || [];
  const mainTitle = document.getElementById('quizMainTitle');
  if (mainTitle && quizData.quizTitle) {
    mainTitle.textContent = quizData.quizTitle;
  }

  const optionLetters = ['A', 'B', 'C', 'D', 'E'];

  questions.forEach((q, qIndex) => {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.id = `quiz-card-${qIndex}`;

    const optionsHtml = q.options.map((opt, optIndex) => `
      <button class="quiz-opt-btn" data-qid="${qIndex}" data-opt="${optIndex}">
        <span class="quiz-opt-text"><strong>${optionLetters[optIndex] || ''}.</strong> ${escapeHtml(opt)}</span>
        <span class="quiz-opt-feedback"></span>
      </button>
    `).join('');

    card.innerHTML = `
      <div class="quiz-q-number">Question ${qIndex + 1} of ${questions.length}</div>
      <h4 class="quiz-q-title">${escapeHtml(q.question)}</h4>
      <div class="quiz-options">${optionsHtml}</div>
      <div class="quiz-explanation-box hidden" id="exp-${qIndex}">
        <strong>💡 Conceptual Explanation:</strong> ${escapeHtml(q.explanation)}
      </div>
    `;

    // Add option click handlers
    const optButtons = card.querySelectorAll('.quiz-opt-btn');
    optButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        handleQuizOptionSelect(qIndex, parseInt(btn.getAttribute('data-opt')), q, optButtons, card);
      });
    });

    list.appendChild(card);
  });
}

/**
 * Handle Option Selection & Instant Feedback
 */
function handleQuizOptionSelect(qIndex, selectedOptIndex, questionObj, allOptionButtons, card) {
  // Prevent re-answering
  if (StudyMateApp.quizState.userAnswers[qIndex] !== undefined) return;

  StudyMateApp.quizState.userAnswers[qIndex] = selectedOptIndex;
  StudyMateApp.quizState.answeredCount++;

  const isCorrect = (selectedOptIndex === questionObj.correctAnswerIndex);
  if (isCorrect) {
    StudyMateApp.quizState.score++;
  }

  // Highlight choices with both visual color and explicit text (Accessibility)
  allOptionButtons.forEach((btn, idx) => {
    btn.disabled = true;
    const feedbackSpan = btn.querySelector('.quiz-opt-feedback');

    if (idx === questionObj.correctAnswerIndex) {
      btn.classList.add('correct');
      if (feedbackSpan) feedbackSpan.innerHTML = '<span class="quiz-feedback-tag tag-correct">✓ Correct Answer</span>';
    } else if (idx === selectedOptIndex && !isCorrect) {
      btn.classList.add('wrong');
      if (feedbackSpan) feedbackSpan.innerHTML = '<span class="quiz-feedback-tag tag-wrong">✕ Your Choice</span>';
    }
  });

  // Reveal explanation
  const expBox = card.querySelector(`#exp-${qIndex}`);
  if (expBox) expBox.classList.remove('hidden');

  updateQuizScoreboard();

  // Check if quiz is fully complete
  const totalQuestions = StudyMateApp.quizData?.questions?.length || 5;
  if (StudyMateApp.quizState.answeredCount === totalQuestions) {
    showQuizCompletionBanner();
  }
}

/**
 * Update Scoreboard
 */
function updateQuizScoreboard() {
  const total = StudyMateApp.quizData ? StudyMateApp.quizData.questions.length : 5;
  const scoreEl = document.getElementById('quizScoreDisplay');
  const countEl = document.getElementById('quizAnsweredCount');

  const currentQ = Math.min(StudyMateApp.quizState.answeredCount + 1, total);
  if (scoreEl) scoreEl.textContent = `SCORE ${StudyMateApp.quizState.score} / ${total}`;
  if (countEl) countEl.textContent = `QUESTION ${currentQ} / ${total}`;
}

/**
 * Reset quiz answers for retake
 */
function resetQuizAnswers() {
  if (!StudyMateApp.quizData) return;
  renderQuizQuestions(StudyMateApp.quizData);
}

/**
 * Show Celebratory Completion Banner
 */
function showQuizCompletionBanner() {
  const banner = document.getElementById('quizCompletedBanner');
  const verdictTitle = document.getElementById('quizVerdictTitle');
  const verdictText = document.getElementById('quizVerdictText');
  if (!banner) return;

  const score = StudyMateApp.quizState.score;
  const total = StudyMateApp.quizData?.questions?.length || 5;

  banner.classList.remove('hidden');

  if (score === total) {
    if (verdictTitle) verdictTitle.textContent = '🌟 Perfect Score! (100% Mastery)';
    if (verdictText) verdictText.innerHTML = `<div class="quiz-visual-score">${score} / ${total}</div><div class="quiz-visual-verdict">Excellent! You're exam ready.</div>`;
  } else if (score >= total * 0.7) {
    if (verdictTitle) verdictTitle.textContent = '🎉 Great Job!';
    if (verdictText) verdictText.innerHTML = `<div class="quiz-visual-score">${score} / ${total}</div><div class="quiz-visual-verdict">Excellent! You're exam ready.</div>`;
  } else {
    if (verdictTitle) verdictTitle.textContent = '📚 Keep Practicing!';
    if (verdictText) verdictText.innerHTML = `<div class="quiz-visual-score">${score} / ${total}</div><div class="quiz-visual-verdict">Review the 5-Minute Revision sheet and retake the quiz!</div>`;
  }

  banner.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Initialize "Ask StudyMate" Chatbot Handlers
 */
function initChatListeners() {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const clearBtn = document.getElementById('clearChatBtn');
  const chips = document.querySelectorAll('.prompt-chips .chip');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitUserQuestion();
    });
  }

  // Shift+Enter for new line, Enter to submit
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitUserQuestion();
      }
    });
  }

  // Prompt chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (input) {
        input.value = chip.getAttribute('data-prompt');
        input.focus();
      }
    });
  });

  // Clear chat
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const chatContainer = document.getElementById('chatMessages');
      if (chatContainer) {
        chatContainer.innerHTML = `
          <div class="chat-message message-ai">
            <div class="message-avatar">🎓</div>
            <div class="message-content">
              <p><strong>Chat reset.</strong> Ask me any question about your study material!</p>
            </div>
          </div>
        `;
      }
      StudyMateApp.chatHistory = [];
    });
  }
}

/**
 * Submit question to Gemini
 */
async function submitUserQuestion() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;

  const chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) return;

  // Append user message
  appendChatMessage('user', question);
  input.value = '';

  // Append temporary loading AI message
  const loadingMsgId = 'ai-loading-' + Date.now();
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-message message-ai';
  loadingDiv.id = loadingMsgId;
  loadingDiv.innerHTML = `
    <div class="message-avatar">🎓</div>
    <div class="message-content">
      <div class="message-sender-name">StudyMate AI Tutor</div>
      <div class="studymate-thinking-row">
        <span class="thinking-text">StudyMate is thinking</span>
        <span class="thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
      </div>
    </div>
  `;
  chatContainer.appendChild(loadingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof StudyMateAuth !== 'undefined') {
      const token = await StudyMateAuth.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    if (StudyMateApp.customApiKey) {
      headers['x-gemini-api-key'] = StudyMateApp.customApiKey;
    }

    const res = await fetch('/api/ask-question', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        text: StudyMateApp.extractedText,
        question: question
      })
    });

    const result = await res.json().catch(() => ({}));
    document.getElementById(loadingMsgId)?.remove();

    if (!res.ok || !result.success) {
      const parsed = parseApiError(result, 'Failed to get answer', res.status);
      appendChatErrorMessage(parsed.title, parsed.message, question, parsed.isQuota);
      return;
    }

    appendChatMessage('ai', result.answer);

  } catch (err) {
    document.getElementById(loadingMsgId)?.remove();
    console.error('Ask question error:', err);
    const parsed = parseApiError({ message: err.message }, 'Could not communicate with Gemini.');
    appendChatErrorMessage(parsed.title, parsed.message, question, parsed.isQuota);
  }
}

/**
 * Append error message bubble with optional retry button to chat log
 */
function appendChatErrorMessage(title, message, questionToRetry = '', isQuota = false) {
  const chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message message-ai message-error';

  const escapedQ = escapeHtml(questionToRetry).replace(/'/g, "\\'");
  const retryLabel = isQuota ? '⏳ Try Again Later' : '↻ Retry Question';
  const retryBtnHtml = questionToRetry
    ? `<button type="button" class="chat-retry-btn" onclick="retryQuestion('${escapedQ}')">${retryLabel}</button>`
    : '';

  msgDiv.innerHTML = `
    <div class="message-avatar">🎓</div>
    <div class="message-content">
      <div class="message-sender-name">StudyMate AI Tutor</div>
      <p><strong>${escapeHtml(title)}</strong></p>
      <p style="margin-top: 4px;">${escapeHtml(message)}</p>
      ${retryBtnHtml}
    </div>
  `;

  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

window.retryQuestion = function (questionText) {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = questionText;
    submitUserQuestion();
  }
};

/**
 * Append message bubble to chat log
 */
function appendChatMessage(sender, rawContent) {
  const chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message message-${sender}`;

  const avatar = sender === 'ai' ? '🎓' : '👤';
  const senderName = sender === 'ai' ? 'StudyMate AI Tutor' : 'You';
  const formattedHtml = sender === 'ai' ? formatMarkdownToHtml(rawContent) : `<p>${escapeHtml(rawContent)}</p>`;

  msgDiv.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <div class="message-sender-name">${senderName}</div>
      ${formattedHtml}
    </div>
  `;

  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Export Tools: Download Notes as Markdown
 */
function downloadNotesAsMarkdown() {
  if (!StudyMateApp.notesData) {
    showToast('Generate study notes first before exporting.', 'error');
    return;
  }

  const d = StudyMateApp.notesData;
  let md = `# ${d.topic || 'Study Notes'}\n\n`;
  md += `*Generated by StudyMate AI on ${new Date().toLocaleDateString()}*\n\n`;
  md += `---\n\n## 📌 Document Summary\n\n${d.summary}\n\n`;

  md += `---\n\n## 🎯 Key Concepts & Takeaways\n\n`;
  (d.keyPoints || []).forEach(p => md += `- ${p}\n`);
  md += `\n`;

  md += `---\n\n## 📖 Important Definitions\n\n`;
  (d.definitions || []).forEach(def => md += `### **${def.term}**\n${def.explanation}\n\n`);

  md += `---\n\n## 📝 Expected Exam Questions & Solutions\n\n`;
  md += `### 2-Mark Questions (Short Answer)\n`;
  (d.examQuestions?.twoMark || []).forEach((q, i) => md += `**Q${i + 1}. ${q.question}**\n- *Answer:* ${q.answer}\n\n`);

  md += `### 5-Mark Questions (Analytical)\n`;
  (d.examQuestions?.fiveMark || []).forEach((q, i) => md += `**Q${i + 1}. ${q.question}**\n- *Answer:* ${q.answer}\n\n`);

  md += `### 10-Mark Questions (Essay/Long Answer)\n`;
  (d.examQuestions?.tenMark || []).forEach((q, i) => md += `**Q${i + 1}. ${q.question}**\n- *Answer:* ${q.answer}\n\n`);

  md += `---\n\n## ⚡ 5-Minute Quick Revision Cram Sheet\n\n`;
  (d.quickRevision || []).forEach((r, i) => md += `${i + 1}. ${r}\n`);

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = (d.topic || 'StudyMate_Notes').toLowerCase().replace(/[^a-z0-9]/g, '_') + '.md';
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Downloaded ${fileName}!`, 'success');
}

/**
 * Copy All Notes to Clipboard
 */
function copyAllNotesToClipboard() {
  if (!StudyMateApp.notesData) {
    showToast('Please generate notes first.', 'error');
    return;
  }
  const d = StudyMateApp.notesData;
  let text = `${d.topic}\n\n=== SUMMARY ===\n${d.summary}\n\n=== KEY POINTS ===\n`;
  (d.keyPoints || []).forEach(p => text += `• ${p}\n`);
  text += `\n=== QUICK REVISION ===\n`;
  (d.quickRevision || []).forEach(r => text += `• ${r}\n`);

  navigator.clipboard.writeText(text).then(() => {
    showToast('All notes copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}

/**
 * Copy Individual Section
 */
StudyMateApp.copySection = function (elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    showToast('Section copied to clipboard!', 'success');
  });
};

/**
 * Settings / API Key Modal Controller
 */
function initSettingsModal() {
  const openBtn = document.getElementById('openSettingsBtn');
  const closeBtn = document.getElementById('closeSettingsBtn');
  const closeBackdrop = document.getElementById('closeSettingsBackdrop');
  const saveBtn = document.getElementById('saveSettingsBtn');
  const modal = document.getElementById('settingsModal');
  const keyInput = document.getElementById('customApiKeyInput');

  if (!modal) return;

  const openModal = () => {
    if (keyInput) keyInput.value = StudyMateApp.customApiKey;
    modal.classList.remove('hidden');
  };

  const closeModal = () => modal.classList.add('hidden');

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (closeBackdrop) closeBackdrop.addEventListener('click', closeModal);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const val = keyInput ? keyInput.value.trim() : '';
      StudyMateApp.customApiKey = val;
      if (val) {
        localStorage.setItem('studymate_custom_api_key', val);
        showToast('API Key saved for this session!', 'success');
      } else {
        localStorage.removeItem('studymate_custom_api_key');
        showToast('Custom API Key cleared. Using server .env key.', 'info');
      }
      initServerStatusCheck();
      closeModal();
    });
  }
}

/**
 * Extracted Text Inspector Modal
 */
function openTextInspectorModal() {
  const modal = document.getElementById('textInspectorModal');
  const closeBtn = document.getElementById('closeInspectorBtn');
  const closeBackdrop = document.getElementById('closeInspectorBackdrop');
  const closeFooter = document.getElementById('closeInspectorFooterBtn');
  const copyBtn = document.getElementById('copyExtractedTextBtn');

  if (!modal) return;
  modal.classList.remove('hidden');

  const closeModal = () => modal.classList.add('hidden');
  if (closeBtn) closeBtn.onclick = closeModal;
  if (closeBackdrop) closeBackdrop.onclick = closeModal;
  if (closeFooter) closeFooter.onclick = closeModal;

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(StudyMateApp.extractedText).then(() => {
        showToast('Extracted text copied!', 'success');
      });
    };
  }
}

/**
 * UI State Helpers
 */
function showGenerationLoader(show) {
  const loader = document.getElementById('generationLoader');
  const genBtn = document.getElementById('generateNotesBtn');

  if (show) {
    if (loader) loader.classList.remove('hidden');
    document.getElementById('resultsSection')?.classList.add('hidden');
    if (genBtn) {
      genBtn.disabled = true;
      genBtn.classList.add('btn-loading');
      genBtn.innerHTML = '<span class="btn-loading-spinner"></span><span class="btn-ai-sparkle">✨</span><span class="btn-label-text">Generating Study Notes...</span>';
    }
  } else {
    if (loader) loader.classList.add('hidden');
    if (genBtn) {
      genBtn.classList.remove('btn-loading');
      genBtn.disabled = !StudyMateApp.extractedText;
      genBtn.innerHTML = '<span class="btn-ai-sparkle">✨</span><span class="btn-label-text">Generate Study Notes</span>';
    }
  }
}

/**
 * Helper: Parse API Error response into clean user-friendly title and message.
 * Never exposes raw GoogleGenerativeAI errors or stack traces to the user.
 */
function parseApiError(result, fallbackMsg = 'Failed to communicate with Gemini AI', httpStatus = null) {
  const code = result?.errorCode;
  const status = httpStatus || result?.status;
  const rawMsg = [
    result?.message,
    result?.error,
    result?.errorDetails ? JSON.stringify(result.errorDetails) : '',
    fallbackMsg
  ].filter(Boolean).join(' ');
  const rawStr = String(rawMsg);

  // 1. Quota / Rate Limit / High Demand (HTTP 429 / RESOURCE_EXHAUSTED / 503)
  if (
    code === 'QUOTA_EXHAUSTED' ||
    status === 429 ||
    status === 503 ||
    rawStr.includes('429') ||
    rawStr.includes('RESOURCE_EXHAUSTED') ||
    rawStr.toLowerCase().includes('quota') ||
    rawStr.toLowerCase().includes('rate limit') ||
    rawStr.toLowerCase().includes('rate_limit') ||
    rawStr.toLowerCase().includes('too many requests') ||
    rawStr.toLowerCase().includes('resource has been exhausted') ||
    rawStr.includes('503') ||
    rawStr.toLowerCase().includes('high demand') ||
    rawStr.toLowerCase().includes('overloaded') ||
    rawStr.includes('temporarily unavailable')
  ) {
    return {
      title: '⏳ AI temporarily unavailable',
      message: 'StudyMate has reached its current Gemini API usage limit. Please try again later.',
      isQuota: true,
      retryLabel: 'Try Again Later'
    };
  }

  // 2. 404 Model Unavailable / Not Found
  if (
    code === 'MODEL_UNAVAILABLE' ||
    status === 404 ||
    rawStr.includes('404') ||
    rawStr.includes('NOT_FOUND') ||
    rawStr.toLowerCase().includes('model is currently unavailable') ||
    (rawStr.toLowerCase().includes('model') && rawStr.toLowerCase().includes('not found')) ||
    rawStr.toLowerCase().includes('is not supported')
  ) {
    return {
      title: 'The configured Gemini model is currently unavailable.',
      message: 'The configured Gemini model is currently unavailable.',
      isQuota: false,
      retryLabel: 'Retry'
    };
  }

  // 3. API Key Missing / Invalid
  if (
    code === 'API_KEY_INVALID' ||
    status === 401 ||
    status === 403 ||
    rawStr.includes('API_KEY_INVALID') ||
    rawStr.toLowerCase().includes('api key') ||
    rawStr.toLowerCase().includes('permission_denied') ||
    rawStr.includes('API_KEY')
  ) {
    return {
      title: 'Gemini API key is missing or invalid.',
      message: 'Gemini API key is missing or invalid.',
      isQuota: false,
      retryLabel: 'Configure API Key'
    };
  }

  // 4. Clean structured error from backend
  if (result && result.error && result.message && result.error !== result.message) {
    return {
      title: result.error,
      message: result.message,
      isQuota: false,
      retryLabel: 'Retry'
    };
  }

  // 5. Default fallback
  return {
    title: 'AI Processing Error',
    message: result?.message || result?.error || fallbackMsg || 'An unexpected error occurred while communicating with Gemini AI. Please try again later.',
    isQuota: false,
    retryLabel: 'Retry'
  };
}

function showErrorBanner(title, message, onRetry = null, retryLabel = 'Retry') {
  const banner = document.getElementById('errorBanner');
  const titleEl = document.getElementById('errorBannerTitle');
  const msgEl = document.getElementById('errorBannerMessage');
  const retryBtn = document.getElementById('errorBannerRetryBtn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  if (retryBtn) {
    if (typeof onRetry === 'function' || retryLabel === 'Configure API Key') {
      retryBtn.classList.remove('hidden');
      retryBtn.textContent = retryLabel || 'Retry';
      retryBtn.onclick = () => {
        hideErrorBanner();
        if (retryLabel === 'Configure API Key') {
          const settingsModal = document.getElementById('settingsModal');
          if (settingsModal) {
            settingsModal.classList.remove('hidden');
            return;
          }
        }
        if (typeof onRetry === 'function') onRetry();
      };
    } else {
      retryBtn.classList.add('hidden');
      retryBtn.onclick = null;
    }
  }

  if (banner) {
    banner.classList.remove('hidden');
    banner.scrollIntoView({ behavior: 'smooth' });
  }
}

function hideErrorBanner() {
  document.getElementById('errorBanner')?.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdownToHtml(text) {
  if (typeof marked !== 'undefined' && marked.parse) {
    return marked.parse(text);
  }
  return text.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('');
}

/**
 * ==============================================================================
 * Authentication UI Controller & Handlers
 * ==============================================================================
 */
let lastAuthedUid = null;

function initAuthUI() {
  // Default to auth-mode when unauthenticated
  document.body.classList.add('auth-mode');

  const tabLogin = document.getElementById('tabAuthLogin');
  const tabSignup = document.getElementById('tabAuthSignup');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const switchToSignupBtn = document.getElementById('switchToSignupBtn');
  const switchToLoginBtn = document.getElementById('switchToLoginBtn');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdownMenu = document.getElementById('userDropdownMenu');
  const logoutBtn = document.getElementById('logoutBtn');
  const navSignInPromptBtn = document.getElementById('navSignInPromptBtn');
  const menuSettingsBtn = document.getElementById('menuSettingsBtn');
  const closeAlertBtn = document.getElementById('closeAuthAlertBtn');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  // Dynamic card heading & subtext elements
  const authCardHeadline = document.getElementById('authCardHeadline');
  const authCardSubtext = document.getElementById('authCardSubtext');

  // Tab switching
  const showLogin = () => {
    tabLogin?.classList.add('active');
    tabLogin?.setAttribute('aria-selected', 'true');
    tabSignup?.classList.remove('active');
    tabSignup?.setAttribute('aria-selected', 'false');
    loginForm?.classList.remove('hidden');
    signupForm?.classList.add('hidden');
    if (authCardHeadline) authCardHeadline.textContent = 'Welcome back!';
    if (authCardSubtext) authCardSubtext.textContent = 'Sign in to continue your learning journey.';
    hideAuthAlert();
  };

  const showSignup = () => {
    tabSignup?.classList.add('active');
    tabSignup?.setAttribute('aria-selected', 'true');
    tabLogin?.classList.remove('active');
    tabLogin?.setAttribute('aria-selected', 'false');
    signupForm?.classList.remove('hidden');
    loginForm?.classList.add('hidden');
    if (authCardHeadline) authCardHeadline.textContent = 'Create your account';
    if (authCardSubtext) authCardSubtext.textContent = 'Start your personalized AI study workspace.';
    hideAuthAlert();
  };

  tabLogin?.addEventListener('click', showLogin);
  tabSignup?.addEventListener('click', showSignup);
  switchToSignupBtn?.addEventListener('click', showSignup);
  switchToLoginBtn?.addEventListener('click', showLogin);

  // Forgot password interaction
  forgotPasswordLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const emailInput = document.getElementById('loginEmail');
    let email = emailInput?.value.trim() || '';

    // 2. Ask for the user's email if the email field is empty
    if (!email) {
      const promptedEmail = window.prompt('Please enter your email address:');
      if (promptedEmail !== null && promptedEmail.trim() !== '') {
        email = promptedEmail.trim();
        if (emailInput) {
          emailInput.value = email;
        }
      }
    }

    if (!email) {
      showAuthAlert('Please enter your email address to reset your password.');
      emailInput?.focus();
      return;
    }

    // 3. Validate that the email is not empty and has a valid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAuthAlert('Please enter a valid email address (e.g. name@university.edu).');
      emailInput?.focus();
      return;
    }

    console.log('[Auth] Sending password reset email to:', email);

    const originalText = forgotPasswordLink.textContent;
    forgotPasswordLink.textContent = 'Sending...';
    forgotPasswordLink.style.pointerEvents = 'none';

    try {
      if (typeof StudyMateAuth === 'undefined') {
        throw new Error('Firebase Authentication is not configured.');
      }

      // 4. Call the actual Firebase Authentication password reset method
      // 5. Wait for the Promise to resolve successfully
      await StudyMateAuth.resetPassword(email);

      console.log('[Auth] Password reset email request completed successfully');

      // 6. ONLY after Firebase successfully resolves, show:
      //    "Password reset email sent. Please check your inbox and spam folder."
      const successMessage = 'Password reset email sent. Please check your inbox and spam folder.';
      showAuthAlert(successMessage, 'success');
      showToast(successMessage, 'success');
    } catch (error) {
      // 7. If Firebase throws an error, DO NOT show a fake success message.
      // 8. Display a useful error message based on the Firebase error code.
      console.error('[Auth] Password reset failed:', error);
      const errorMessage = getPasswordResetErrorMessage(error);
      showAuthAlert(errorMessage, 'error');
      showToast(errorMessage, 'error');
    } finally {
      forgotPasswordLink.textContent = originalText;
      forgotPasswordLink.style.pointerEvents = '';
    }
  });

  // Show/Hide password toggle buttons
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🔒';
        btn.setAttribute('aria-label', 'Hide password');
      } else {
        input.type = 'password';
        btn.textContent = '👁';
        btn.setAttribute('aria-label', 'Show password');
      }
    });
  });

  // Login Form Submission
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (!email || !password) {
      showAuthAlert('Please enter both your email address and password.');
      return;
    }

    setAuthButtonLoading(submitBtn, true);

    try {
      if (typeof StudyMateAuth !== 'undefined') {
        await StudyMateAuth.loginWithEmail(email, password);
      }
    } catch (err) {
      console.error('Login error:', err);
      const msg = typeof StudyMateAuth !== 'undefined' ? StudyMateAuth.formatAuthError(err) : err.message;
      showAuthAlert(msg);
    } finally {
      setAuthButtonLoading(submitBtn, false);
    }
  });

  // Signup Form Submission
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const name = document.getElementById('signupName')?.value;
    const email = document.getElementById('signupEmail')?.value;
    const password = document.getElementById('signupPassword')?.value;
    const confirmPassword = document.getElementById('signupConfirmPassword')?.value;
    const submitBtn = document.getElementById('signupSubmitBtn');

    if (!name || !email || !password || !confirmPassword) {
      showAuthAlert('Please fill out all required registration fields.');
      return;
    }

    if (password.length < 6) {
      showAuthAlert('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      showAuthAlert('Passwords do not match. Please verify your confirm password.');
      return;
    }

    setAuthButtonLoading(submitBtn, true);

    try {
      if (typeof StudyMateAuth !== 'undefined') {
        await StudyMateAuth.registerWithEmail(name, email, password);
      }
    } catch (err) {
      console.error('Registration error:', err);
      const msg = typeof StudyMateAuth !== 'undefined' ? StudyMateAuth.formatAuthError(err) : err.message;
      showAuthAlert(msg);
    } finally {
      setAuthButtonLoading(submitBtn, false);
    }
  });

  // Google Sign-In
  googleSignInBtn?.addEventListener('click', async () => {
    hideAuthAlert();
    try {
      if (typeof StudyMateAuth !== 'undefined') {
        await StudyMateAuth.loginWithGoogle();
      }
    } catch (err) {
      console.error('Google sign-in error:', err);
      const msg = typeof StudyMateAuth !== 'undefined' ? StudyMateAuth.formatAuthError(err) : err.message;
      showAuthAlert(msg);
    }
  });

  // User Dropdown Menu Toggle
  userMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !userDropdownMenu?.classList.contains('hidden');
    if (isOpen) {
      userDropdownMenu?.classList.add('hidden');
      userMenuBtn?.setAttribute('aria-expanded', 'false');
    } else {
      userDropdownMenu?.classList.remove('hidden');
      userMenuBtn?.setAttribute('aria-expanded', 'true');
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#userProfileArea')) {
      userDropdownMenu?.classList.add('hidden');
      userMenuBtn?.setAttribute('aria-expanded', 'false');
    }
  });

  // Sign out
  logoutBtn?.addEventListener('click', async () => {
    try {
      if (typeof StudyMateAuth !== 'undefined') {
        await StudyMateAuth.logout();
        showToast('You have signed out of StudyMate AI.', 'info');
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  });

  // Nav Sign In Prompt button (if scrolled down or in view)
  navSignInPromptBtn?.addEventListener('click', () => {
    document.getElementById('authSection')?.scrollIntoView({ behavior: 'smooth' });
    showLogin();
  });

  // Menu Settings Shortcut
  menuSettingsBtn?.addEventListener('click', () => {
    userDropdownMenu?.classList.add('hidden');
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) settingsModal.classList.remove('hidden');
  });

  // Dismiss Auth Alert
  closeAlertBtn?.addEventListener('click', hideAuthAlert);

  // Subscribe to Auth state changes
  if (typeof StudyMateAuth !== 'undefined') {
    StudyMateAuth.onAuthStateChanged((user) => {
      handleAuthStateChange(user);
    });
  }
}

function handleAuthStateChange(user) {
  const authSection = document.getElementById('authSection');
  const appWorkspace = document.getElementById('appWorkspace');
  const userProfileArea = document.getElementById('userProfileArea');
  const navSignInPromptBtn = document.getElementById('navSignInPromptBtn');

  if (user) {
    // User is authenticated
    document.body.classList.remove('auth-mode');
    authSection?.classList.add('hidden');
    appWorkspace?.classList.remove('hidden');
    userProfileArea?.classList.remove('hidden');
    navSignInPromptBtn?.classList.add('hidden');

    const displayName = user.displayName || user.email?.split('@')[0] || 'Student';
    const email = user.email || 'student@example.com';
    const firstLetter = (displayName[0] || email[0] || 'S').toUpperCase();

    // Update Nav
    const userAvatar = document.getElementById('userAvatar');
    const userNavName = document.getElementById('userNavName');
    const dropdownAvatar = document.getElementById('dropdownAvatar');
    const dropdownUserName = document.getElementById('dropdownUserName');
    const dropdownUserEmail = document.getElementById('dropdownUserEmail');

    if (userAvatar) {
      if (user.photoURL) {
        userAvatar.innerHTML = `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(displayName)}">`;
      } else {
        userAvatar.textContent = firstLetter;
      }
    }

    if (dropdownAvatar) {
      if (user.photoURL) {
        dropdownAvatar.innerHTML = `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(displayName)}">`;
      } else {
        dropdownAvatar.textContent = firstLetter;
      }
    }

    if (userNavName) userNavName.textContent = displayName;
    if (dropdownUserName) dropdownUserName.textContent = displayName;
    if (dropdownUserEmail) dropdownUserEmail.textContent = email;

    // Toast on fresh login
    if (lastAuthedUid !== user.uid) {
      showToast(`Welcome back, ${displayName}! 👋`, 'success');
      lastAuthedUid = user.uid;
    }
  } else {
    // User is signed out
    document.body.classList.add('auth-mode');
    lastAuthedUid = null;
    authSection?.classList.remove('hidden');
    appWorkspace?.classList.add('hidden');
    userProfileArea?.classList.add('hidden');
    navSignInPromptBtn?.classList.remove('hidden');
  }
}

function getPasswordResetErrorMessage(error) {
  if (!error) return 'An unknown error occurred while requesting password reset.';
  const code = error.code || '';
  const msg = error.message || '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address (e.g. name@university.edu).';
    case 'auth/user-not-found':
      return 'No account found with this email address. Please check your email or sign up.';
    case 'auth/too-many-requests':
      return 'Too many password reset requests. Please wait a moment and try again later.';
    case 'auth/network-request-failed':
      return 'Network connection issue. Please check your internet connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Password reset is not enabled for this project. Please contact support.';
    case 'auth/missing-email':
      return 'Please enter your email address.';
    default:
      if (typeof StudyMateAuth !== 'undefined' && StudyMateAuth.formatAuthError) {
        return StudyMateAuth.formatAuthError(error);
      }
      return msg.replace(/^Firebase:\s*/i, '').trim() || 'Password reset failed. Please try again.';
  }
}

function showAuthAlert(message, type = 'error') {
  const banner = document.getElementById('authAlertBanner');
  const text = document.getElementById('authAlertText');
  const icon = document.getElementById('authAlertIcon');
  if (text) text.textContent = message;
  if (banner) {
    if (type === 'success') {
      banner.classList.add('alert-success');
      if (icon) icon.textContent = '✅';
    } else {
      banner.classList.remove('alert-success');
      if (icon) icon.textContent = '⚠️';
    }
    banner.classList.remove('hidden');
  }
}

function hideAuthAlert() {
  const banner = document.getElementById('authAlertBanner');
  if (banner) {
    banner.classList.add('hidden');
    banner.classList.remove('alert-success');
  }
}

function setAuthButtonLoading(button, isLoading) {
  if (!button) return;
  const textSpan = button.querySelector('.btn-text');
  const spinnerSpan = button.querySelector('.btn-spinner-icon');

  button.disabled = isLoading;
  if (isLoading) {
    textSpan?.classList.add('hidden');
    spinnerSpan?.classList.remove('hidden');
  } else {
    textSpan?.classList.remove('hidden');
    spinnerSpan?.classList.add('hidden');
  }
}

