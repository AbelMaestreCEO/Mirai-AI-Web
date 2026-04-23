/* ============================================
   MIRAI AI - Frontend Logic
   Conexión con Cloudflare Worker + DeepSeek API
   ============================================ */

// --- CONSTANTES Y CONFIGURACIÓN ---
const CONFIG = {
  API_ENDPOINT: '/api/chat',
  STORAGE_KEY_THEME: 'mirai-ai-theme',
  STORAGE_KEY_CONVERSATION: 'mirai-ai-conversation-id',
  TYPING_DELAY: 300,
  MAX_INPUT_HEIGHT: 120,
  DEBOUNCE_DELAY: 300,
  VOICE_LANG: 'es-ES',
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_FORMATS: ['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv']
};

// --- ELEMENTOS DEL DOM ---
const elements = {
  chatMessages: document.getElementById('chat-messages'),
  messageInput: document.getElementById('message-input'),
  sendButton: document.getElementById('send-button'),
  attachBtn: document.getElementById('attach-btn'),
  fileInput: document.getElementById('file-input'),
  attachmentsArea: document.getElementById('attachments-area'),
  themeToggle: document.getElementById('theme-toggle'),
  clearButton: document.getElementById('clear-conversation'),
  typingIndicator: document.getElementById('typing-indicator'),
  sunIcon: document.querySelector('.sun-icon'),
  moonIcon: document.querySelector('.moon-icon'),
  voiceBtn: document.getElementById('voice-btn'),
  conversationsList: document.getElementById('conversations-list'),
  newConversationBtn: document.getElementById('new-conversation-btn'),
};

// --- ESTADO DE LA APLICACIÓN ---
let state = {
  isSending: false,
  currentConversationId: null,
  theme: 'light',
  isListening: false,  // ← AGREGAR ESTA LÍNEA
  recognition: null,
  attachments: []
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  initializeVoiceRecognition();
  initializeChat();
  loadOrCreateConversation();
  setupEventListeners();
  setupMobileMenu();
  initializeFileUpload();
  loadConversations();
});

// --- GESTIÓN DE TEMA ---
function initializeTheme() {
  const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEY_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  state.theme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(state.theme);
}

// --- INICIALIZACIÓN DE SUBIDA DE ARCHIVOS ---
function initializeFileUpload() {
  if (!elements.attachBtn || !elements.fileInput) return;

  // Configurar pdf.js worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // Click en botón de adjuntar
  elements.attachBtn.addEventListener('click', () => {
    elements.fileInput.click();
  });

  // Selección de archivo
  elements.fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (const file of files) {
      await processFile(file);
    }

    // Limpiar input para permitir seleccionar el mismo archivo nuevamente
    elements.fileInput.value = '';
  });

  // Drag & Drop en toda la página
  setupDragAndDrop();
}

// --- CONFIGURACIÓN DRAG & DROP ---
function setupDragAndDrop() {
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      showDropZone();
    }
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      hideDropZone();
    }
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    hideDropZone();

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await processFile(file);
    }
  });
}

function showDropZone() {
  let overlay = document.getElementById('drop-zone-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'drop-zone-overlay';
    overlay.className = 'drop-zone-overlay';
    overlay.innerHTML = `
      <div class="drop-zone-content">
        <h3>📎 Suelta los archivos aquí</h3>
        <p>PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
}

function hideDropZone() {
  const overlay = document.getElementById('drop-zone-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// --- PROCESAR ARCHIVO (MODIFICADO PARA R2) ---
async function processFile(file) {
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    alert(`El archivo "${file.name}" excede el tamaño máximo de 10MB`);
    return;
  }

  const extension = file.name.split('.').pop().toLowerCase();
  if (!CONFIG.SUPPORTED_FORMATS.includes(extension)) {
    alert(`El formato .${extension} no es soportado`);
    return;
  }

  const loadingId = `loading-${Date.now()}`;
  addAttachmentChip(file.name, loadingId, true);

  try {
    // 1. Extraer texto (lo que ya haces)
    const text = await extractTextFromFile(file, extension);

    // 2. Subir archivo a R2
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversation_id', state.currentConversationId);

    const uploadResponse = await fetch('/api/upload', {
      method: 'POST',
      body: formData // No poner Content-Type manualmente, el navegador lo pone con boundary
    });

    if (!uploadResponse.ok) {
      throw new Error(`Error subiendo archivo: ${uploadResponse.status}`);
    }

    const uploadData = await uploadResponse.json();

    // 3. Guardar referencia en estado
    const attachmentId = crypto.randomUUID();
    state.attachments.push({
      id: attachmentId,
      name: file.name,
      type: extension,
      text: text,
      r2_key: uploadData.r2_key, // Guardamos la clave de R2
      url: uploadData.url // Opcional: URL directa si es pública
    });

    removeAttachmentChip(loadingId);
    addAttachmentChip(file.name, attachmentId, false);

    console.log(`✅ Archivo procesado y guardado en R2: ${file.name}`);

  } catch (error) {
    console.error(`Error procesando archivo ${file.name}:`, error);
    removeAttachmentChip(loadingId);
    alert(`Error al procesar "${file.name}". Intenta con otro archivo.`);
  }
}

// --- EXTRAER TEXTO SEGÚN FORMATO ---
async function extractTextFromFile(file, extension) {
  const reader = new FileReader();

  switch (extension) {
    case 'txt':
    case 'csv':
      return new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

    case 'pdf':
      return extractTextFromPDF(file);

    case 'docx':
      return extractTextFromDOCX(file);

    case 'xlsx':
    case 'xls':
      return extractTextFromExcel(file);

    case 'pptx':
    case 'ppt':
      return extractTextFromPPT(file);

    default:
      throw new Error(`Formato no soportado: ${extension}`);
  }
}

// --- EXTRAER TEXTO DE PDF ---
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }

  return fullText.trim();
}

// --- EXTRAER TEXTO DE DOCX ---
async function extractTextFromDOCX(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// --- EXTRAER TEXTO DE EXCEL ---
async function extractTextFromExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  let fullText = '';

  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    fullText += `Hoja: ${sheetName}\n${csv}\n\n`;
  });

  return fullText.trim();
}

// --- EXTRAER TEXTO DE PPT ---
async function extractTextFromPPT(file) {
  // Para PPT/PPTX, necesitamos usar JSZip para extraer el XML interno
  // Esta es una implementación simplificada
  const arrayBuffer = await file.arrayBuffer();
  const zip = new JSZip();

  try {
    const content = await zip.loadAsync(arrayBuffer);
    let fullText = '';

    // Buscar archivos de texto en la estructura PPTX
    const textFiles = Object.keys(content.files).filter(name =>
      name.match(/ppt\/slides\/slide\d+\.xml$/)
    );

    for (const fileName of textFiles) {
      const xml = await content.files[fileName].async('string');
      // Extraer texto de XML (simplificado)
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      fullText += text + '\n\n';
    }

    return fullText.trim() || 'No se pudo extraer texto del PPT';
  } catch (error) {
    throw new Error('Error extrayendo texto de PPT. Intenta convertir a PDF primero.');
  }
}

// --- GESTIÓN DE CHIPS DE ADJUNTOS ---
function addAttachmentChip(fileName, id, isLoading) {
  const chip = document.createElement('div');
  chip.className = 'attachment-chip';
  chip.id = `chip-${id}`;

  const extension = fileName.split('.').pop().toUpperCase();
  const icon = getFileIcon(extension);

  // Construir el HTML SIN el onclick
  chip.innerHTML = `
    <span class="attachment-icon">${icon}</span>
    <span class="attachment-name" title="${fileName}">${fileName}</span>
    ${isLoading ? '<span class="attachment-loading">⏳</span>' : `
      <span class="attachment-remove">×</span>
    `}
  `;

  elements.attachmentsArea.appendChild(chip);

  // AGREGAR EL EVENTO LISTENER AQUÍ (si no está cargando)
  if (!isLoading) {
    const removeBtn = chip.querySelector('.attachment-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        removeAttachment(id);
      });
    }
  }
}

function removeAttachmentChip(id) {
  const chip = document.getElementById(`chip-${id}`);
  if (chip) {
    chip.remove();
  }
}

function removeAttachment(attachmentId) {
  state.attachments = state.attachments.filter(att => att.id !== attachmentId);
  removeAttachmentChip(attachmentId);
}

function getFileIcon(extension) {
  const icons = {
    'PDF': '📄',
    'DOC': '📝',
    'DOCX': '📝',
    'XLS': '📊',
    'XLSX': '📊',
    'PPT': '📽️',
    'PPTX': '📽️',
    'TXT': '📃',
    'CSV': '📋'
  };
  return icons[extension.toUpperCase()] || '📎';
}

// --- LÓGICA DE MENSAJES (ACTUALIZADA PARA EDICIÓN) ---
async function handleSendMessage() {
  const userInput = elements.messageInput.value.trim();
  if (!userInput && state.attachments.length === 0) return;

  // 1. Construir mensaje
  let fullMessage = userInput;
  let attachmentIds = [];

  if (state.attachments.length > 0) {
    const attachmentsSection = state.attachments.map(att => {
      attachmentIds.push(att.id);
      return `[Archivo: ${att.name}]\n${att.text}`;
    }).join('\n\n---\n\n');
    fullMessage = fullMessage ? `${fullMessage}\n\n---\n\n${attachmentsSection}` : attachmentsSection;
  }

  // 2. Limpiar UI
  elements.messageInput.value = '';
  state.attachments = [];
  elements.attachmentsArea.innerHTML = '';
  autoResizeTextarea();

  // 3. Estado de envío
  state.isSending = true;
  updateSendButtonState();
  showTypingIndicator();

  // 4. Mostrar mensaje del usuario
  appendMessage('user', fullMessage);

  // 5. DETECCIÓN DE EDICIÓN: 
  // Si el último mensaje de la IA existe, lo eliminamos para regenerar
  const messages = document.querySelectorAll('.message');
  const lastAiMessage = Array.from(messages).reverse().find(m => m.classList.contains('assistant'));

  if (lastAiMessage) {
    // Si hay un mensaje de IA anterior, asumimos que es una edición
    // Eliminamos el mensaje de IA y el mensaje de usuario que acabamos de poner (para reemplazarlo)
    // Nota: En este flujo simple, el usuario acaba de enviar, así que el mensaje de IA anterior es el que我们要 borrar.
    lastAiMessage.remove();
    console.log('🔄 Regenerando respuesta tras edición...');
  }

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: fullMessage,
        conversation_id: state.currentConversationId
      })
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    const data = await response.json();
    hideTypingIndicator();

    if (data.response) {
      appendMessage('assistant', data.response);
      loadConversations();
      saveToLocalHistory(data.response);
    } else {
      throw new Error('No se recibió respuesta válida');
    }

  } catch (error) {
    console.error('Error enviando mensaje:', error);
    hideTypingIndicator();
    appendMessage('system', '⚠️ Hubo un error al procesar tu mensaje.');
  } finally {
    state.isSending = false;
    updateSendButtonState();
    elements.messageInput.focus();
  }
}
// --- INICIALIZACIÓN DE VOZ (WEB SPEECH API) ---
function initializeVoiceRecognition() {
  // Detectar soporte del navegador
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('⚠️ Web Speech API no soportada en este navegador.');
    if (elements.voiceBtn) {
      elements.voiceBtn.style.display = 'none'; // Ocultar si no hay soporte
    }
    return;
  }

  // Crear instancia
  state.recognition = new SpeechRecognition();
  state.recognition.lang = CONFIG.VOICE_LANG;
  state.recognition.continuous = false;
  state.recognition.interimResults = true;

  // Evento: Inicio
  state.recognition.onstart = () => {
    state.isListening = true;
    elements.voiceBtn.classList.add('listening');
    elements.messageInput.placeholder = "Escuchando...";
  };

  // Evento: Resultados
  state.recognition.onresult = (event) => {
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    // Inyectar texto en el input
    if (finalTranscript) {
      const currentText = elements.messageInput.value;
      const separator = currentText.length > 0 ? ' ' : '';
      elements.messageInput.value = currentText + separator + finalTranscript;
      autoResizeTextarea();
    }
  };

  // Evento: Fin
  state.recognition.onend = () => {
    state.isListening = false;
    elements.voiceBtn.classList.remove('listening');
    elements.messageInput.placeholder = "Escribe tu mensaje aquí...";
  };

  // Evento: Error
  state.recognition.onerror = (event) => {
    console.error('Error de reconocimiento de voz:', event.error);
    state.isListening = false;
    elements.voiceBtn.classList.remove('listening');
    elements.messageInput.placeholder = "Error de voz. Inténtalo de nuevo.";

    setTimeout(() => {
      elements.messageInput.placeholder = "Escribe tu mensaje aquí...";
    }, 2000);
  };

  // Configurar evento click del botón
  if (elements.voiceBtn) {
    elements.voiceBtn.addEventListener('click', toggleVoiceRecognition);
  }
}

function toggleVoiceRecognition() {
  if (!state.recognition) return;

  if (state.isListening) {
    state.recognition.stop();
  } else {
    try {
      state.recognition.start();
    } catch (err) {
      console.error('Error iniciando reconocimiento:', err);
    }
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;

  if (theme === 'dark') {
    elements.sunIcon.classList.add('hidden');
    elements.moonIcon.classList.remove('hidden');
  } else {
    elements.sunIcon.classList.remove('hidden');
    elements.moonIcon.classList.add('hidden');
  }

  localStorage.setItem(CONFIG.STORAGE_KEY_THEME, theme);
}

function toggleTheme() {
  const newTheme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

// --- INICIALIZACIÓN DE CHAT ---
function initializeChat() {
  elements.chatMessages.scrollTop = 0;
  elements.messageInput.focus();
  autoResizeTextarea();
  console.log('✨ Mirai AI inicializado correctamente');
}

// --- GESTIÓN DE CONVERSACIÓN ---
async function loadOrCreateConversation() {
  const savedId = localStorage.getItem(CONFIG.STORAGE_KEY_CONVERSATION);

  if (savedId) {
    state.currentConversationId = savedId;
    await loadConversationHistory(savedId);
  } else {
    state.currentConversationId = crypto.randomUUID();
    localStorage.setItem(CONFIG.STORAGE_KEY_CONVERSATION, state.currentConversationId);
  }
}

async function loadConversationHistory(conversationId) {
  try {
    const response = await fetch(`/api/history/${conversationId}`);

    if (!response.ok) return;

    const messages = await response.json();
    elements.chatMessages.innerHTML = '';

    messages.forEach(msg => {
      appendMessage(msg.role, msg.content, false);
    });

    scrollToBottom();
  } catch (error) {
    console.error('Error cargando historial:', error);
  }
}

// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
  elements.sendButton.addEventListener('click', handleSendMessage);

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  elements.messageInput.addEventListener('input', debounce(autoResizeTextarea, CONFIG.DEBOUNCE_DELAY));
  elements.themeToggle.addEventListener('click', toggleTheme);

  // ← BOTÓN DE LIMPIAR CONVERSACIÓN
  if (elements.clearButton) {
    elements.clearButton.addEventListener('click', handleClearConversation);
  }

  if (elements.newConversationBtn) {
    elements.newConversationBtn.addEventListener('click', createNewConversation);
  }

  document.querySelectorAll('.action-menu:not(.hidden)').forEach(m => {
    m.classList.add('hidden');
  });

  elements.messageInput.focus();
}

// --- LIMPIAR CONVERSACIÓN ---
async function handleClearConversation() {
  const confirmed = confirm(
    '¿Estás seguro de que quieres limpiar esta conversación? ' +
    'Se borrará todo el historial y comenzaremos desde cero.'
  );

  if (!confirmed) return;

  try {
    const originalText = elements.clearButton.innerHTML;
    elements.clearButton.disabled = true;
    elements.clearButton.innerHTML = '⏳';

    const response = await fetch(`${CONFIG.API_ENDPOINT}/clear`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: state.currentConversationId
      })
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      elements.chatMessages.innerHTML = '';
      state.currentConversationId = crypto.randomUUID();
      localStorage.setItem(CONFIG.STORAGE_KEY_CONVERSATION, state.currentConversationId);
      appendMessage('system', '✨ Conversación limpia. ¿En qué puedo ayudarte hoy?');
      loadConversations();
      console.log('✅ Conversación limpiada correctamente');
    }

  } catch (error) {
    console.error('Error limpiando conversación:', error);
    alert('Hubo un error al limpiar la conversación. Por favor, inténtalo de nuevo.');
  } finally {
    elements.clearButton.disabled = false;
    elements.clearButton.innerHTML = '🗑️';
    elements.messageInput.focus();
  }
}

// --- APENDAR MENSAJE CON BOTÓN EDITAR (USUARIO) ---
function appendMessage(role, content, animate = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  const escapedContent = escapeHtml(content);
  const formattedContent = formatMessageContent(escapedContent);
  const avatar = role === 'user' ? 'U' : 'M';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Fila inferior: hora + botones
  let metaRow = '';

  if (role === 'assistant') {
    // Botones de IA (Copiar, Regenerar, Opciones)
    metaRow = `
      <div class="message-meta">
        <span class="message-time">${time}</span>
        <div class="message-actions">
          <button class="msg-action copy-full-btn" title="Copiar respuesta">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button class="msg-action regenerate-btn" title="Regenerar respuesta">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          <div class="options-wrapper">
            <button class="msg-action options-btn" title="Más opciones">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            </button>
            <div class="action-menu hidden">
              <button class="menu-item" data-action="summarize"><span>📝</span> Resumir</button>
              <button class="menu-item" data-action="extend"><span>📈</span> Extender</button>
              <button class="menu-item" data-action="formal"><span>👔</span> Tono Formal</button>
              <button class="menu-item" data-action="friendly"><span>😊</span> Tono Amigable</button>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (role === 'user') {
    // Botones de Usuario (Solo Editar)
    metaRow = `
      <div class="message-meta">
        <span class="message-time">${time}</span>
        <div class="message-actions">
          <button class="msg-action edit-btn" title="Editar mensaje" data-original-content="${escapedContent}">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  } else {
    // Sistema (Solo hora)
    metaRow = `
      <div class="message-meta">
        <span class="message-time">${time}</span>
      </div>
    `;
  }

  messageDiv.innerHTML = `
    ${role !== 'system' ? `<div class="message-avatar">${avatar}</div>` : ''}
    <div class="message-content">
      ${formattedContent}
      ${metaRow}
    </div>
  `;

  if (animate) {
    messageDiv.classList.add('fade-in');
  }

  elements.chatMessages.appendChild(messageDiv);
  scrollToBottom();

  addCopyButtons();
  addActionButtonsListeners(messageDiv, content);
}

// --- LISTENERS PARA BOTONES DE ACCIÓN ---
function addActionButtonsListeners(messageDiv, content) {
  const copyFullBtn = messageDiv.querySelector('.copy-full-btn');
  if (copyFullBtn) {
    copyFullBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(content);
        showActionFeedback(copyFullBtn, 'success');
      } catch (err) {
        showActionFeedback(copyFullBtn, 'error');
      }
    });
  }

  const regenerateBtn = messageDiv.querySelector('.regenerate-btn');
  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', async () => {
      await regenerateResponse(messageDiv, content);
    });
  }

  const optionsBtn = messageDiv.querySelector('.options-btn');
  const actionMenu = messageDiv.querySelector('.action-menu');

  if (optionsBtn && actionMenu) {
    optionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Cerrar otros menús abiertos
      document.querySelectorAll('.action-menu:not(.hidden)').forEach(m => {
        if (m !== actionMenu) m.classList.add('hidden');
      });
      actionMenu.classList.toggle('hidden');
    });

    const menuItems = actionMenu.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', async () => {
        const action = item.dataset.action;
        actionMenu.classList.add('hidden');
        await modifyResponse(messageDiv, content, action);
      });
    });
  }
  const editBtn = messageDiv.querySelector('.edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const originalContent = editBtn.getAttribute('data-original-content');
      const decodedContent = decodeHtml(originalContent); // Decodificar entidades HTML

      // 1. Poner el contenido en el input
      elements.messageInput.value = decodedContent;
      autoResizeTextarea();

      // 2. Eliminar el mensaje actual del chat
      messageDiv.remove();

      // 3. Enfocar el input
      elements.messageInput.focus();

      // 4. (Opcional) Mostrar un aviso visual
      console.log('✏️ Mensaje editado. Envía de nuevo para regenerar la respuesta.');
    });
  }
}

// --- UTILIDAD: Decodificar HTML Entities ---
function decodeHtml(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

// --- MODIFICAR RESPUESTA ---
async function modifyResponse(messageDiv, originalContent, action) {
  const actionPrompts = {
    summarize: 'Resume de manera concisa la siguiente respuesta:\n\n',
    extend: 'Expande y detalla más la siguiente respuesta:\n\n',
    formal: 'Reescribe con un tono formal y profesional:\n\n',
    friendly: 'Reescribe con un tono amigable y cercano:\n\n'
  };

  const prompt = actionPrompts[action] + originalContent;
  const contentEl = messageDiv.querySelector('.message-content');

  contentEl.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  messageDiv.style.opacity = '0.7';

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        conversation_id: state.currentConversationId
      })
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    const data = await response.json();

    if (data.response) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      contentEl.innerHTML = formatMessageContent(escapeHtml(data.response));

      const newMeta = document.createElement('div');
      newMeta.className = 'message-meta';
      newMeta.innerHTML = `
        <span class="message-time">${time}</span>
        <div class="message-actions">
          <button class="msg-action copy-full-btn" title="Copiar respuesta">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button class="msg-action regenerate-btn" title="Regenerar respuesta">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          <div class="options-wrapper">
            <button class="msg-action options-btn" title="Más opciones">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            </button>
            <div class="action-menu hidden">
              <button class="menu-item" data-action="summarize"><span>📝</span> Resumir</button>
              <button class="menu-item" data-action="extend"><span>📈</span> Extender</button>
              <button class="menu-item" data-action="formal"><span>👔</span> Tono Formal</button>
              <button class="menu-item" data-action="friendly"><span>😊</span> Tono Amigable</button>
            </div>
          </div>
        </div>
      `;
      contentEl.appendChild(newMeta);

      messageDiv.style.opacity = '1';
      addActionButtonsListeners(messageDiv, data.response);
      addCopyButtons();
      saveToLocalHistory(data.response);
    }

  } catch (error) {
    console.error('Error modificando:', error);
    messageDiv.style.opacity = '1';
  }
}

// --- REGENERAR RESPUESTA ---
async function regenerateResponse(messageDiv, originalContent) {
  const prevMessage = messageDiv.previousElementSibling;
  if (!prevMessage || !prevMessage.classList.contains('user')) {
    return;
  }

  const userContent = prevMessage.querySelector('.message-content').textContent;

  // Indicador de carga dentro del mensaje
  const contentEl = messageDiv.querySelector('.message-content');
  const metaEl = messageDiv.querySelector('.message-meta');
  const originalHTML = contentEl.innerHTML;

  contentEl.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  messageDiv.style.opacity = '0.7';

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userContent + '\n\n(Por favor, genera una respuesta diferente)',
        conversation_id: state.currentConversationId
      })
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    const data = await response.json();

    if (data.response) {
      // Reconstruir mensaje completo con nueva respuesta
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      contentEl.innerHTML = formatMessageContent(escapeHtml(data.response));

      // Re-agregar meta row
      const newMeta = document.createElement('div');
      newMeta.className = 'message-meta';
      newMeta.innerHTML = `
        <span class="message-time">${time}</span>
        <div class="message-actions">
          <button class="msg-action copy-full-btn" title="Copiar respuesta">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button class="msg-action regenerate-btn" title="Regenerar respuesta">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          <div class="options-wrapper">
            <button class="msg-action options-btn" title="Más opciones">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            </button>
            <div class="action-menu hidden">
              <button class="menu-item" data-action="summarize"><span>📝</span> Resumir</button>
              <button class="menu-item" data-action="extend"><span>📈</span> Extender</button>
              <button class="menu-item" data-action="formal"><span>👔</span> Tono Formal</button>
              <button class="menu-item" data-action="friendly"><span>😊</span> Tono Amigable</button>
            </div>
          </div>
        </div>
      `;
      contentEl.appendChild(newMeta);

      messageDiv.style.opacity = '1';
      addActionButtonsListeners(messageDiv, data.response);
      addCopyButtons();
      saveToLocalHistory(data.response);
    }

  } catch (error) {
    console.error('Error regenerando:', error);
    contentEl.innerHTML = originalHTML;
    messageDiv.style.opacity = '1';
  }
}

// --- FEEDBACK VISUAL EN BOTONES ---
function showActionFeedback(button, type) {
  const originalHTML = button.innerHTML;
  button.classList.add(type);
  button.innerHTML = type === 'success'
    ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.classList.remove(type);
  }, 2000);
}

function showTypingIndicator() {
  elements.typingIndicator.classList.remove('hidden');
  setTimeout(() => {
    elements.typingIndicator.scrollIntoView({ behavior: 'smooth' });
  }, CONFIG.TYPING_DELAY);
}

function hideTypingIndicator() {
  elements.typingIndicator.classList.add('hidden');
}

function updateSendButtonState() {
  elements.sendButton.disabled = state.isSending;
  elements.sendButton.style.opacity = state.isSending ? '0.5' : '1';
}

function scrollToBottom() {
  elements.chatMessages.scrollTo({
    top: elements.chatMessages.scrollHeight,
    behavior: 'smooth'
  });
}

function autoResizeTextarea() {
  const textarea = elements.messageInput;
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, CONFIG.MAX_INPUT_HEIGHT);
  textarea.style.height = `${newHeight}px`;
}

// --- UTILIDADES ---
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- FORMATEO DE MARKDOWN MEJORADO (CON SOPORTE PARA COPIAR CÓDIGO) ---
function formatMessageContent(content) {
  let formatted = content;

  // 1. Escapar HTML primero para prevenir XSS
  formatted = escapeHtml(formatted);

  // 2. Bloques de código (```idiama\ncódigo```) - PRIMERO para evitar conflictos
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    // Codificar el código para usarlo en atributo data
    const encodedCode = encodeURIComponent(code);
    return `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span class="code-lang">${lang || 'plaintext'}</span>
          <button class="copy-code-btn" data-code="${encodedCode}" title="Copiar código">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            <span>Copiar</span>
          </button>
        </div>
        <pre class="code-block"><code class="language-${lang}">${code}</code></pre>
      </div>
    `;
  });

  // 3. Código inline (`texto`)
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 4. Encabezados Markdown (#, ##, ###, ####, #####)
  formatted = formatted.replace(/^###### (.+)$/gm, '<h6 class="md-heading">$1</h6>');
  formatted = formatted.replace(/^##### (.+)$/gm, '<h5 class="md-heading">$1</h5>');
  formatted = formatted.replace(/^#### (.+)$/gm, '<h4 class="md-heading">$1</h4>');
  formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="md-heading">$1</h3>');
  formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="md-heading">$1</h2>');
  formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="md-heading">$1</h1>');

  // 5. Negritas (**texto**)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 6. Cursivas (*texto*)
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 7. Listas con guiones (- texto)
  formatted = formatted.replace(/^- (.+)$/gm, '<li class="md-list-item">$1</li>');
  formatted = formatted.replace(/(<li class="md-list-item">.*<\/li>\n?)+/g, '<ul class="md-list">$&</ul>');

  // 8. Listas numeradas (1. texto)
  formatted = formatted.replace(/^\d+\. (.+)$/gm, '<li class="md-list-item">$1</li>');
  formatted = formatted.replace(/(<li class="md-list-item">.*<\/li>\n?)+/g, '<ol class="md-list">$&</ol>');

  // 9. Blockquotes (> texto)
  formatted = formatted.replace(/^> (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

  // 10. Líneas horizontales (---)
  formatted = formatted.replace(/^---$/gm, '<hr class="md-hr">');

  // 11. Enlaces ([texto](url))
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

  // 12. Saltos de línea (convertir a <br>)
  formatted = formatted.replace(/\n/g, '<br>');

  // 13. Limpiar <br> duplicados después de elementos de bloque
  formatted = formatted.replace(/<\/(h[1-6]|ul|ol|blockquote|pre|div)>[ ]*<br>/g, '</$1>');

  return formatted;
}

// --- AGREGAR BOTONES DE COPIAR DESPUÉS DE RENDERIZAR MENSAJE ---
function addCopyButtons() {
  const codeBlocks = document.querySelectorAll('.copy-code-btn');

  codeBlocks.forEach(btn => {
    if (btn.dataset.initialized === 'true') return; // Evitar duplicados

    btn.dataset.initialized = 'true';

    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Evitar propagación

      const encodedCode = btn.dataset.code;
      const code = decodeURIComponent(encodedCode);
      const originalHTML = btn.innerHTML;

      try {
        await navigator.clipboard.writeText(code);

        // Feedback visual: cambiar texto y color
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>¡Copiado!</span>
        `;
        btn.classList.add('copied');

        // Restaurar después de 2 segundos
        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.classList.remove('copied');
        }, 2000);

      } catch (err) {
        console.error('Error al copiar:', err);
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <span>Error</span>
        `;
        btn.classList.add('error');

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.classList.remove('error');
        }, 2000);
      }
    });
  });
}



function saveToLocalHistory(response) {
  let history = JSON.parse(localStorage.getItem('mirai-ai-local-history') || '[]');
  history.push({
    role: 'assistant',
    content: response,
    timestamp: Date.now()
  });
  localStorage.setItem('mirai-ai-local-history', JSON.stringify(history));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- MENÚ LATERAL MÓVIL ---
function setupMobileMenu() {
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const closeMenu = document.querySelector('.close-menu');
  const sidebar = document.querySelector('.mobile-sidebar');
  const overlay = document.querySelector('.mobile-overlay');

  // Verificar que todos los elementos existan
  if (!menuToggle || !closeMenu || !sidebar || !overlay) {
    console.warn('⚠️ Elementos del menú móvil no encontrados. Verifica el HTML.');
    return;
  }

  function toggleMenu() {
    const isActive = sidebar.classList.contains('active');

    if (isActive) {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      menuToggle.classList.remove('active');
      document.body.style.overflow = '';
    } else {
      sidebar.classList.add('active');
      overlay.classList.add('active');
      menuToggle.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  menuToggle.addEventListener('click', toggleMenu);
  closeMenu.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', toggleMenu);

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('active')) {
      toggleMenu();
    }
  });
}

// ============================================
// GESTIÓN DE CONVERSACIONES (SIDEBAR)
// ============================================

// --- CARGAR LISTA DE CONVERSACIONES ---
async function loadConversations() {
  if (!elements.conversationsList) return;

  try {
    const response = await fetch('/api/conversations');
    if (!response.ok) return;

    const conversations = await response.json();
    renderConversationsList(conversations);

  } catch (error) {
    console.error('Error cargando conversaciones:', error);
  }
}

// --- RENDERIZAR LISTA EN SIDEBAR ---
function renderConversationsList(conversations) {
  const list = elements.conversationsList;
  list.innerHTML = '';

  if (!conversations || conversations.length === 0) {
    list.innerHTML = '<li class="conv-empty">No hay conversaciones aún</li>';
    return;
  }

  conversations.forEach(conv => {
    const li = document.createElement('li');
    li.className = 'conv-item';
    li.dataset.id = conv.id;

    // Marcar como activa si es la conversación actual
    if (conv.id === state.currentConversationId) {
      li.classList.add('active');
    }

    // Formatear fecha
    const dateStr = formatDate(conv.updated_at || conv.created_at);

    li.innerHTML = `
      <span class="conv-item-icon">💬</span>
      <div class="conv-item-info">
        <span class="conv-item-title">${escapeHtml(conv.title)}</span>
        <span class="conv-item-date">${dateStr}</span>
      </div>
      <div class="conv-item-actions">
        <button class="conv-action-btn rename-btn" title="Renombrar">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="conv-action-btn delete" title="Eliminar">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `;

    // Click para cambiar de conversación
    li.addEventListener('click', (e) => {
      // Ignorar clicks en botones de acción
      if (e.target.closest('.conv-action-btn')) return;
      switchConversation(conv.id);
    });

    // Botón renombrar
    const renameBtn = li.querySelector('.rename-btn');
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startRenameConversation(li, conv);
    });

    // Botón eliminar
    const deleteBtn = li.querySelector('.delete');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteConversation(conv.id, li);
    });

    list.appendChild(li);
  });
}

// --- CAMBIAR DE CONVERSACIÓN ---
async function switchConversation(conversationId) {
  if (conversationId === state.currentConversationId) return;

  state.currentConversationId = conversationId;
  localStorage.setItem(CONFIG.STORAGE_KEY_CONVERSATION, conversationId);

  // Cargar historial de la conversación
  elements.chatMessages.innerHTML = '';
  await loadConversationHistory(conversationId);

  // Actualizar UI
  updateActiveConversation();

  // Cerrar sidebar en móvil
  const sidebar = document.querySelector('.mobile-sidebar');
  if (sidebar && sidebar.classList.contains('active')) {
    document.querySelector('.mobile-overlay').click();
  }
}

// --- CREAR NUEVA CONVERSACIÓN ---
async function createNewConversation() {
  const newId = crypto.randomUUID();
  state.currentConversationId = newId;
  localStorage.setItem(CONFIG.STORAGE_KEY_CONVERSATION, newId);

  // Limpiar chat
  elements.chatMessages.innerHTML = '';
  appendMessage('system', '✨ Nueva conversación iniciada. ¿En qué puedo ayudarte?');

  // Actualizar lista
  await loadConversations();
  updateActiveConversation();

  // Cerrar sidebar en móvil
  const sidebar = document.querySelector('.mobile-sidebar');
  if (sidebar && sidebar.classList.contains('active')) {
    document.querySelector('.mobile-overlay').click();
  }

  elements.messageInput.focus();
}

// --- RENOMBRAR CONVERSACIÓN ---
function startRenameConversation(li, conv) {
  const infoDiv = li.querySelector('.conv-item-info');
  const originalTitle = conv.title;

  // Reemplazar título con input
  infoDiv.innerHTML = `
    <input type="text" class="conv-rename-input" value="${escapeHtml(originalTitle)}" maxlength="100">
  `;

  const input = infoDiv.querySelector('.conv-rename-input');
  input.focus();
  input.select();

  // Guardar al presionar Enter o al perder foco
  const saveRename = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== originalTitle) {
      try {
        await fetch('/api/conversations/rename', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conv.id,
            title: newTitle
          })
        });
      } catch (error) {
        console.error('Error renombrando:', error);
      }
    }
    // Recargar lista
    await loadConversations();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRename();
    } else if (e.key === 'Escape') {
      loadConversations(); // Cancelar
    }
  });

  input.addEventListener('blur', saveRename);
}

// --- ELIMINAR CONVERSACIÓN ---
async function deleteConversation(conversationId, li) {
  const confirmed = confirm('¿Eliminar esta conversación? No se puede deshacer.');
  if (!confirmed) return;

  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/clear`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId })
    });

    if (!response.ok) throw new Error('Error eliminando');

    // Si era la conversación activa, crear una nueva
    if (conversationId === state.currentConversationId) {
      await createNewConversation();
    }

    // Recargar lista
    await loadConversations();

  } catch (error) {
    console.error('Error eliminando conversación:', error);
    alert('Error al eliminar la conversación.');
  }
}

// --- ACTUALIZAR CLASE ACTIVA EN SIDEBAR ---
function updateActiveConversation() {
  const items = document.querySelectorAll('.conv-item');
  items.forEach(item => {
    if (item.dataset.id === state.currentConversationId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// --- FORMATEAR FECHA ---
function formatDate(dateStr) {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr + 'Z'); // Agregar Z para UTC
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Hoy';
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return `Hace ${diffDays} días`;
    } else {
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    }
  } catch (e) {
    return '';
  }
}