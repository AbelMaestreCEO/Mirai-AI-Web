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
};

// --- ESTADO DE LA APLICACIÓN ---
let state = {
  isSending: false,
  currentConversationId: null,
  theme: 'light',
  isListening: false,  // ← AGREGAR ESTA LÍNEA
  recognition: null ,
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

// --- PROCESAR ARCHIVO (MODIFICADO) ---
async function processFile(file) {
  // Validar tamaño
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    alert(`El archivo "${file.name}" excede el tamaño máximo de 10MB`);
    return;
  }
  
  // Validar formato
  const extension = file.name.split('.').pop().toLowerCase();
  if (!CONFIG.SUPPORTED_FORMATS.includes(extension)) {
    alert(`El formato .${extension} no es soportado`);
    return;
  }
  
  // Mostrar indicador de carga
  const loadingId = `loading-${Date.now()}`;
  addAttachmentChip(file.name, loadingId, true);
  
  try {
    // Extraer texto según formato
    const text = await extractTextFromFile(file, extension);
    
    // Remover loading chip
    removeAttachmentChip(loadingId);
    
    // Agregar archivo a estado (GUARDAMOS EL TEXTO AQUÍ, NO EN EL INPUT)
    const attachmentId = crypto.randomUUID();
    state.attachments.push({
      id: attachmentId,
      name: file.name,
      type: extension,
      text: text // El texto se guarda en memoria, listo para enviar
    });
    
    // Agregar chip visual (SIN TEXTO EN EL INPUT)
    addAttachmentChip(file.name, attachmentId, false);
    
    console.log(`✅ Archivo procesado: ${file.name} (${text.length} caracteres extraídos)`);
    
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
  
  chip.innerHTML = `
    <span class="attachment-icon">${icon}</span>
    <span class="attachment-name" title="${fileName}">${fileName}</span>
    ${isLoading ? '<span class="attachment-loading">⏳</span>' : `
      <span class="attachment-remove" onclick="removeAttachment('${id}')">×</span>
    `}
  `;
  
  elements.attachmentsArea.appendChild(chip);
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

// --- LÓGICA DE MENSAJES (MODIFICADA PARA INCLUIR ADJUNTOS) ---
async function handleSendMessage() {
  const userInput = elements.messageInput.value.trim();
  
  // Permitir enviar si hay texto O si hay adjuntos
  if (!userInput && state.attachments.length === 0) return;
  
  // 1. Construir el mensaje completo
  let fullMessage = userInput;
  
  if (state.attachments.length > 0) {
    // Separador visual para los adjuntos
    const attachmentsSection = state.attachments.map(att => {
      return `[Archivo: ${att.name}]\n${att.text}`;
    }).join('\n\n---\n\n');
    
    // Si hay texto de usuario, añadimos un separador antes de los archivos
    if (fullMessage) {
      fullMessage += `\n\n---\n\n${attachmentsSection}`;
    } else {
      fullMessage = attachmentsSection;
    }
  }
  
  // 2. Limpiar la interfaz (Input y Adjuntos) ANTES de enviar
  elements.messageInput.value = '';
  state.attachments = []; // Vaciamos el array de adjuntos
  elements.attachmentsArea.innerHTML = ''; // Limpiamos los chips visuales
  autoResizeTextarea();
  
  // 3. Estado de envío
  state.isSending = true;
  updateSendButtonState();
  showTypingIndicator();
  
  try {
    // Mostrar el mensaje completo en el chat (solo visualmente para el usuario)
    // Nota: En el chat mostramos el resumen, pero enviamos el texto completo a la IA
    appendMessage('user', fullMessage);
    
    // Enviar al Worker
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: fullMessage, // Enviamos el texto combinado
        conversation_id: state.currentConversationId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    hideTypingIndicator();
    
    if (data.response) {
      appendMessage('assistant', data.response);
      saveToLocalHistory(data.response);
    } else {
      throw new Error('No se recibió respuesta válida');
    }
    
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    hideTypingIndicator();
    
    // ERROR: Recuperar el mensaje para que el usuario no lo pierda
    // (En un caso real, quizás quieras recuperar solo el texto del input, 
    // pero aquí recuperamos todo para seguridad)
    appendMessage('system', '⚠️ Hubo un error al procesar tu mensaje. Por favor, inténtalo de nuevo.');
    
    // Opcional: Restaurar el texto en el input si falló el envío
    // elements.messageInput.value = userInput; 
    // Pero como ya limpiamos los adjuntos, es mejor dejar que el usuario reescriba
    // o implementar una lógica de "undo" más compleja.
    
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

// --- INTERFAZ DE USUARIO ---
function appendMessage(role, content, animate = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  const escapedContent = escapeHtml(content);
  const formattedContent = formatMessageContent(escapedContent);
  const avatar = role === 'user' ? 'U' : 'M';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageDiv.innerHTML = `
    ${role !== 'system' ? `<div class="message-avatar">${avatar}</div>` : ''}
    <div class="message-content">
      ${formattedContent}
      ${role !== 'system' ? `<div class="message-time">${time}</div>` : ''}
    </div>
  `;
  
  if (animate) {
    messageDiv.classList.add('fade-in');
  }
  
  elements.chatMessages.appendChild(messageDiv);
  scrollToBottom();
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

function formatMessageContent(content) {
  let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
  });
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
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