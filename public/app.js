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
  SUPPORTED_FORMATS: ['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'],
  TTS_AUTO_PLAY: false,           // No autoplay por defecto (mejor UX)
  TTS_MODE_KEY: 'mirai-ai-audio-mode',
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
  audioModeToggle: document.getElementById('audio-mode-toggle'),
};

const educationContext = {
  courseId: null,
  lessonId: null,
  isActive: false
};

const ICONS_POOL = ['💡', '🤔', '🎯', '🧪', '📝', '🚀', '🔍', '✨'];

// --- ESTADO DE LA APLICACIÓN ---
let state = {
  isSending: false,
  currentConversationId: null,
  theme: 'light',
  isListening: false,  // ← AGREGAR ESTA LÍNEA
  recognition: null,
  attachments: [],
  currentAudio: null,              // Audio actualmente reproduciéndose
  audioMode: 'auto',              // 'auto' | 'always' | 'never'
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {

  initializeTheme();
  initializeVoiceRecognition();
  setupMobileMenu();
  // ✨ Solo inicializar chat si existe el contenedor
  const isChatPage = !!document.getElementById('chat-messages');
  if (isChatPage) {
    initializeChat();
    loadOrCreateConversation();
    setupEventListeners();
    initializeFileUpload();
    loadConversations();
    initializeAudioMode();
  }
  const headers = document.querySelectorAll('.collapsible-header');
  // Configurar estado inicial (opcional: cerrar todos excepto uno)
  // headers.forEach(h => h.parentElement.classList.remove('active'));

  headers.forEach(header => {
    header.addEventListener('click', () => {
      const section = header.parentElement;

      // Opcional: Cerrar otros abiertos (comportamiento de acordeón estricto)
      // document.querySelectorAll('.collapsible-section').forEach(s => {
      //     if (s !== section) s.classList.remove('active');
      // });

      section.classList.toggle('active');
    });

    // Soporte para teclado (accesibilidad)
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        section.classList.toggle('active');
      }
    });
  });
});

function detectEducationContext() {
  const urlParams = new URLSearchParams(window.location.search);
  const courseId = urlParams.get('course');
  const lessonId = urlParams.get('lesson');

  if (courseId && lessonId) {
    educationContext.courseId = courseId;
    educationContext.lessonId = lessonId;
    educationContext.isActive = true;
    console.log('🎓 Modo educativo detectado:', courseId, lessonId);
    return true;
  }

  return false;
}

function renderSuggestions(suggestions) {
  const bar = document.getElementById('suggestions-bar');
  if (!bar) return;

  // 1. Ocultar la barra momentáneamente para evitar parpadeo
  bar.style.opacity = '0';
  bar.style.transition = 'opacity 0.1s ease';

  setTimeout(() => {
    // 2. Limpiar completamente el contenido
    bar.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
      bar.style.display = 'none';
      bar.style.opacity = '1';
      return;
    }

    bar.style.display = 'flex';

    // 3. Crear nuevos elementos
    suggestions.forEach((text, index) => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      // Reiniciar animación forzando reflow
      chip.style.animation = 'none';
      chip.offsetHeight; /* trigger reflow */
      chip.style.animation = `chipSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`;
      chip.style.animationDelay = `${index * 0.05}s`;

      const icon = ICONS_POOL[index % ICONS_POOL.length];

      chip.innerHTML = `
        <span class="suggestion-icon">${icon}</span>
        <span class="suggestion-text">${escapeHtml(text)}</span>
      `;

      chip.addEventListener('click', (e) => {
        e.preventDefault(); // Evitar comportamientos extraños
        handleSuggestionClick(text, chip);
      });

      bar.appendChild(chip);
    });

    // 4. Scroll al inicio y mostrar
    bar.scrollLeft = 0;
    bar.style.opacity = '1';

    console.log('✨ Sugerencias actualizadas:', suggestions.length);
  }, 100); // Pequeño delay para asegurar el cambio visual
}

function handleSuggestionClick(text, chip) {
  // Efecto visual de click
  chip.style.transform = 'scale(0.95)';
  chip.style.opacity = '0.6';

  // Poner el texto en el input y enviar
  if (elements.messageInput) {
    elements.messageInput.value = text;
    autoResizeTextarea();
    handleSendMessage();
  }
}

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

async function handleSendMessage() {
  const userInput = elements.messageInput.value.trim();
  if (!userInput && state.attachments.length === 0) return;

  // 2. Construir mensaje
  let fullMessage = userInput;
  let attachmentIds = [];

  if (state.attachments.length > 0) {
    const attachmentsSection = state.attachments.map(att => {
      attachmentIds.push(att.id);
      return `[Archivo: ${att.name}]\n${att.text}`;
    }).join('\n\n---\n\n');
    fullMessage = fullMessage ? `${fullMessage}\n\n---\n\n${attachmentsSection}` : attachmentsSection;
  }

  // Limpiar UI
  elements.messageInput.value = '';
  state.attachments = [];
  elements.attachmentsArea.innerHTML = '';
  autoResizeTextarea();

  // Mostrar mensaje del usuario
  appendMessage('user', fullMessage);

  state.isSending = true;
  updateSendButtonState();
  showTypingIndicator();

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: fullMessage,
        conversation_id: state.currentConversationId,
        audio_mode: state.audioMode || 'auto',
        force_type: null  // ← NULL para dejar que DeepSeek decida
      })
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const responseData = await response.json();

    // ✨ MANEJAR SEGÚN TIPO DE RESPUESTA
    if (responseData.type === 'image' && responseData.image_url) {
      const imageMarkdown = `![Imagen generada](${responseData.image_url})\n\n_${userInput}_`;
      appendMessage('assistant', imageMarkdown, true, null);
    } else if (responseData.type === 'video' || responseData.type === 'music') {
      appendMessage('assistant', responseData.response || responseData.response_text || 'Contenido en desarrollo 🚧', true, null);
    } else if (responseData.response) {
      appendMessage('assistant', responseData.response, true, responseData.audio_url || null);
    } else {
      throw new Error('No se recibió respuesta válida');
    }


    loadConversations();
    const textToSave = responseData.response || responseData.response_text || '';
    if (textToSave) saveToLocalHistory(textToSave);

  } catch (error) {
    console.error('Error enviando mensaje:', error);
    appendMessage('system', `⚠️ Error: ${error.message}`);
  } finally {
    hideTypingIndicator();
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
  if (elements.chatMessages) {
    elements.chatMessages.scrollTop = 0;
  }
  if (elements.messageInput) {
    elements.messageInput.focus();
    autoResizeTextarea();
  }
  console.log('✨ Mirai AI inicializado correctamente');
}

// En app.js, dentro de la función loadOrCreateConversation()

async function loadOrCreateConversation() {
  const urlParams = new URLSearchParams(window.location.search);
  const courseId = urlParams.get('course');
  const lessonId = urlParams.get('lesson');
  const mode = urlParams.get('mode');

  if (mode === 'education' && courseId) {
    // ✅ Detectar contexto educativo
    educationContext.courseId = courseId;
    educationContext.lessonId = lessonId;  
    educationContext.isActive = true;

    console.log('🎓 Modo educativo:', { courseId, lessonId });

    // ✨ NUEVO: Forzar modo "solo texto" en clases
    state.audioMode = 'never'; 
    localStorage.setItem(CONFIG.TTS_MODE_KEY, 'never');
    updateAudioModeUI(); // Actualizar la interfaz visual inmediatamente

    // Si NO hay lesson_id, redirigir a course_details.html para seleccionarla
    if (!lessonId) {
      console.warn('⚠️ No hay lesson_id. Redirigiendo a course_details.html');
      window.location.href = `course_details.html?id=${courseId}`;
      return;  
    }

    const convId = await getEducationConversation(courseId);
    state.currentConversationId = convId;
    state.currentCourseId = courseId;

    localStorage.setItem(CONFIG.STORAGE_KEY_CONVERSATION, convId);
    localStorage.setItem('mirai-ai-course-id', courseId);
    localStorage.setItem('mirai-ai-lesson-id', lessonId);  

    await loadConversationHistory(convId);

    // Actualizar título
    const courseName = await getCourseName(courseId);
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) {
      headerTitle.textContent = `Mirai AI - ${courseName}`;
    }

    // Enviar mensaje de bienvenida
    if (educationContext.isActive) {
      await sendEducationWelcome();
    }

  } else {
    // Conversación normal (mantener comportamiento anterior)
    const savedId = localStorage.getItem(CONFIG.STORAGE_KEY_CONVERSATION);
    if (savedId) {
      state.currentConversationId = savedId;
      await loadConversationHistory(savedId);
    } else {
      state.currentConversationId = crypto.randomUUID();
      localStorage.setItem(CONFIG.STORAGE_KEY_CONVERSATION, state.currentConversationId);
    }
  }
}

// Función auxiliar para obtener o crear conversación de curso
async function getEducationConversation(courseId) {
  const response = await fetch(`/api/education-conversation?course=${courseId}`);
  const data = await response.json();
  return data.conversation_id;
}

// Función para obtener nombre del curso (puedes cachear esto)
async function getCourseName(courseId) {
  const response = await fetch(`/api/course-details?id=${courseId}`);
  if (!response.ok) return "Curso";
  const data = await response.json();
  return data.title || "Curso";
}
async function loadConversationHistory(conversationId) {
  try {
    const response = await fetch(`/api/history/${conversationId}`);
    if (!response.ok) return;

    const messages = await response.json();

    elements.chatMessages.innerHTML = '';

    messages.forEach(msg => {
      if (msg.role === 'user') {
        appendMessage('user', msg.content);
      } else if (msg.role === 'assistant') {
        // ✅ Si tiene audio_url, renderizar con reproductor
        if (msg.audio_url) {
          appendMessage('assistant', msg.content, true, msg.audio_url);
        } else {
          appendMessage('assistant', msg.content, true, null);
        }
      }
    });

    // Scroll al final
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

  } catch (error) {
    console.error('Error cargando historial:', error);
  }
}

// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
  if (!elements.chatMessages) return;
  elements.sendButton.addEventListener('click', handleSendMessage);

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  elements.messageInput.addEventListener('input', debounce(autoResizeTextarea, CONFIG.DEBOUNCE_DELAY));
  elements.themeToggle.addEventListener('click', toggleTheme);
  initializeAudioPlayers();
  // Inicializar lightbox y botones de descarga
  initializeLightbox();
  initializeImageDownloadButtons();
  // Observador para nuevos mensajes
  const observer = new MutationObserver(() => {
    initializeAudioPlayers();
    initializeImageDownloadButtons();
  });

  observer.observe(elements.chatMessages, {
    childList: true,
    subtree: true
  });

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

      // ✅ Resetear contexto educativo si estaba activo
      if (state.currentCourseId) {
        educationContext.courseId = null;
        educationContext.lessonId = null;
        educationContext.isActive = false;
        state.currentCourseId = null;
      }

      appendMessage('system', '✨ Conversación limpia. ¿En qué puedo ayudarte hoy?');
      loadConversations();
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

// --- APENDAR MENSAJE CON SOPORTE DE AUDIO ---
function appendMessage(role, content, animate = true, audioUrl = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  const escapedContent = escapeHtml(content);
  const formattedContent = formatMessageContent(escapedContent);
  const avatar = role === 'user' ? 'U' : 'M';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Lógica para determinar qué mostrar
  let contentDisplay = '';
  let metaRow = '';

  if (role === 'assistant' && audioUrl) {
    // CASO: Respuesta de IA con Audio
    // No mostramos el texto, solo el reproductor
    contentDisplay = `
      <div class="audio-player-container">
        <div class="audio-player-header">
          <span class="audio-icon">🎵</span>
          <span class="audio-label">Mensaje de voz</span>
        </div>
        <audio controls class="custom-audio-player" preload="metadata">
          <source src="${audioUrl}" type="audio/mpeg">
          Tu navegador no soporta el elemento de audio.
        </audio>
        <div class="audio-duration">
          <span class="audio-time-current">0:00</span>
          <span class="audio-time-total">--:--</span>
        </div>
      </div>
    `;

    // Meta row para IA (botones de acción)
    metaRow = `
      <div class="message-meta">
        <span class="message-time">${time}</span>
        <div class="message-actions">
          <button class="msg-action copy-full-btn" title="Copiar texto original" data-content="${escapedContent}">
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
  } else if (role === 'assistant') {
    // CASO: Respuesta de IA solo texto (fallback)
    contentDisplay = formattedContent;
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
    // CASO: Mensaje de usuario
    contentDisplay = formattedContent;
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
    // CASO: Sistema
    contentDisplay = formattedContent;
    metaRow = `
      <div class="message-meta">
        <span class="message-time">${time}</span>
      </div>
    `;
  }

  messageDiv.innerHTML = `
    ${role !== 'system' ? `<div class="message-avatar">${avatar}</div>` : ''}
    <div class="message-content">
      ${contentDisplay}
      ${metaRow}
    </div>
  `;

  if (animate) {
    messageDiv.classList.add('fade-in');
  }

  elements.chatMessages.appendChild(messageDiv);
  scrollToBottom();

  // Agregar listeners para botones y reproductor
  addCopyButtons();
  addActionButtonsListeners(messageDiv, content);
  setupAudioPlayer(messageDiv.querySelector('audio'));
}

// ============================================
// CONSTRUCTOR DEL REPRODUCTOR DE AUDIO
// ============================================

function buildAudioPlayer(audioUrl) {
  const playerId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return `
    <div class="audio-player-wrapper" id="${playerId}">
      <div class="audio-header">
        <span class="audio-icon">🎤</span>
        <span class="audio-label">Nota de voz</span>
        <span class="audio-status">Listo para reproducir</span>
      </div>
      <audio 
        class="audio-player" 
        src="${audioUrl}"
        preload="metadata"
        data-player-id="${playerId}"
      ></audio>
      <div class="audio-controls">
        <button class="audio-play-btn" title="Reproducir/Pausar">
          <svg class="icon-play" viewBox="0 0 24 24" width="24" height="24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <svg class="icon-pause hidden" viewBox="0 0 24 24" width="24" height="24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        </button>
        <div class="audio-progress">
          <div class="audio-progress-bar">
            <div class="audio-progress-fill"></div>
          </div>
          <span class="audio-time-current">0:00</span>
          <span class="audio-time-total">--:--</span>
        </div>
        <button class="audio-speed-btn" title="Velocidad" data-speed="1">
          1×
        </button>
      </div>
    </div>
  `;
}

// ============================================
// INICIALIZAR CONTROLES DE AUDIO
// ============================================

// Agregar esta función después de appendMessage
function initializeAudioPlayers() {
  const players = document.querySelectorAll('.audio-player');

  players.forEach(player => {
    const playerId = player.dataset.playerId;
    const wrapper = document.getElementById(playerId);

    if (!wrapper) return;

    const playBtn = wrapper.querySelector('.audio-play-btn');
    const progressFill = wrapper.querySelector('.audio-progress-fill');
    const progressBar = wrapper.querySelector('.audio-progress-bar');
    const timeCurrent = wrapper.querySelector('.audio-time-current');
    const timeTotal = wrapper.querySelector('.audio-time-total');
    const speedBtn = wrapper.querySelector('.audio-speed-btn');

    // Formatear tiempo (segundos → MM:SS)
    function formatTime(seconds) {
      if (isNaN(seconds)) return '--:--';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Botón Play/Pause
    playBtn.addEventListener('click', () => {
      if (player.paused) {
        // Detener otros audios
        document.querySelectorAll('.audio-player').forEach(p => {
          if (p !== player && !p.paused) {
            p.pause();
            const otherWrapper = document.getElementById(p.dataset.playerId);
            if (otherWrapper) {
              otherWrapper.classList.remove('playing');
              otherWrapper.querySelector('.icon-play').classList.remove('hidden');
              otherWrapper.querySelector('.icon-pause').classList.add('hidden');
            }
          }
        });

        player.play();
        wrapper.classList.add('playing');
        playBtn.querySelector('.icon-play').classList.add('hidden');
        playBtn.querySelector('.icon-pause').classList.remove('hidden');
        state.currentAudio = player;
      } else {
        player.pause();
        wrapper.classList.remove('playing');
        playBtn.querySelector('.icon-play').classList.remove('hidden');
        playBtn.querySelector('.icon-pause').classList.add('hidden');
      }
    });

    // Actualizar progreso
    player.addEventListener('timeupdate', () => {
      const percent = (player.currentTime / player.duration) * 100;
      progressFill.style.width = `${percent}%`;
      timeCurrent.textContent = formatTime(player.currentTime);
    });

    // Duración total cargada
    player.addEventListener('loadedmetadata', () => {
      timeTotal.textContent = formatTime(player.duration);
    });

    // Click en barra de progreso
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      player.currentTime = percent * player.duration;
    });

    // Fin de reproducción
    player.addEventListener('ended', () => {
      wrapper.classList.remove('playing');
      playBtn.querySelector('.icon-play').classList.remove('hidden');
      playBtn.querySelector('.icon-pause').classList.add('hidden');
      progressFill.style.width = '0%';
      timeCurrent.textContent = '0:00';

      if (state.currentAudio === player) {
        state.currentAudio = null;
      }
    });

    player.addEventListener('error', (e) => {
      console.error('Error cargando audio:', e);
      const wrapper = document.getElementById(player.dataset.playerId);
      if (wrapper) {
        wrapper.querySelector('.audio-status').textContent = 'Error al cargar';
        wrapper.querySelector('.audio-status').style.color = 'red';
      }
    });

    // Cambiar velocidad
    if (speedBtn) {
      const speeds = [0.5, 1, 1.5, 2];
      let speedIndex = 1; // Default 1x

      speedBtn.addEventListener('click', () => {
        speedIndex = (speedIndex + 1) % speeds.length;
        const newSpeed = speeds[speedIndex];
        player.playbackRate = newSpeed;
        speedBtn.textContent = `${newSpeed}×`;
      });
    }
  });
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
        conversation_id: state.currentConversationId,
        audio_mode: state.audioMode || 'auto'
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
        conversation_id: state.currentConversationId,
        audio_mode: state.audioMode || 'auto'
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

// --- MOSTRAR INDICADOR DINÁMICO (Puntos o Micrófono) ---
function showTypingIndicator() {
  if (!elements.typingIndicator) return;
  const indicator = elements.typingIndicator;
  const dotsContainer = indicator.querySelector('.typing-indicator');
  const micContainer = indicator.querySelector('.recording-indicator'); // Asegúrate de tener este div en el HTML

  indicator.classList.remove('hidden');

  // Lógica: Si el modo es 'always' (siempre audio), mostramos el micrófono
  // Si el modo es 'auto' o 'never', mostramos los puntos (y luego el reproductor si hay audio)
  if (state.audioMode === 'always') {
    // Mostrar Micrófono
    if (dotsContainer) dotsContainer.classList.add('hidden');
    if (micContainer) micContainer.classList.remove('hidden');
  } else {
    // Mostrar Puntos (Escribiendo)
    if (micContainer) micContainer.classList.add('hidden');
    if (dotsContainer) dotsContainer.classList.remove('hidden');
  }

  setTimeout(() => {
    indicator.scrollIntoView({ behavior: 'smooth' });
  }, CONFIG.TYPING_DELAY);
}

function hideTypingIndicator() {
  if (!elements.typingIndicator) return;
  elements.typingIndicator.classList.add('hidden');
}

function updateSendButtonState() {
  if (!elements.sendButton) return;
  elements.sendButton.disabled = state.isSending;
  elements.sendButton.style.opacity = state.isSending ? '0.5' : '1';
}

function scrollToBottom() {
  if (!elements.chatMessages) return;
  elements.chatMessages.scrollTo({
    top: elements.chatMessages.scrollHeight,
    behavior: 'smooth'
  });
}

function autoResizeTextarea() {
  if (!elements.messageInput) return;
  const textarea = elements.messageInput;
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, CONFIG.MAX_INPUT_HEIGHT);
  textarea.style.height = `${newHeight}px`;
}

// --- UTILIDADES ---
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- FORMATEO DE MARKDOWN MEJORADO (CORREGIDO PARA IMÁGENES) ---
function formatMessageContent(content) {
  let formatted = content;

  // 1. Escapar HTML primero para prevenir XSS en el texto normal
  // Pero NO escapas las partes que vamos a generar nosotros después
  // Estrategia: Escapamos todo, luego reemplazamos los patrones de markdown por HTML seguro

  // Primero, protegemos los bloques de código para que no se escapen mal
  const codeBlocks = [];
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `CODE_BLOCK_${codeBlocks.length}`;
    codeBlocks.push({ id, lang, code });
    return `__CODE_BLOCK_${id}__`;
  });

  // Escapar el resto del HTML
  formatted = escapeHtml(formatted);

  // Restaurar bloques de código (ahora seguros)
  codeBlocks.forEach(block => {
    const encodedCode = encodeURIComponent(block.code);
    const replacement = `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span class="code-lang">${block.lang || 'plaintext'}</span>
          <button class="copy-code-btn" data-code="${encodedCode}" title="Copiar código">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <span>Copiar</span>
          </button>
        </div>
        <pre class="code-block"><code class="language-${block.lang}">${block.code}</code></pre>
      </div>
    `;
    formatted = formatted.replace(`__CODE_BLOCK_${block.id}__`, replacement);
  });

  // ⭐ IMÁGENES CON TOOLBAR DE DESCARGA (BOTÓN FUERA DE LA IMAGEN)
  formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const imageId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Convertir URL absoluta a relativa si es necesario
    let displayUrl = url;
    if (url.startsWith('https://aiassets.aberumirai.com/')) {
      const r2Key = url.replace('https://aiassets.aberumirai.com/', '');
      displayUrl = `/api/image/${r2Key}`;
    } else if (url.startsWith('/api/image/')) {
      // Ya es relativa, no hacer nada
      displayUrl = url;
    } else if (url.startsWith('/')) {
      // Relativa sin /api/image/, asumir que es imagen
      displayUrl = url;
    }

    return `
      <div class="image-container">
        <div class="image-toolbar">
          <button class="image-download-btn" data-image-url="${displayUrl}" title="Descargar imagen">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <span class="download-label">Descargar</span>
          </button>
        </div>
        <img src="${displayUrl}" alt="${alt}" class="md-image lightbox-trigger" data-lightbox-id="${imageId}">
      </div>
    `;
  });

  // 3. Procesar otros elementos de Markdown (Negritas, Cursivas, etc.)
  // Como ya escapamos el texto, ahora reemplazamos los marcadores de texto
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Encabezados
  formatted = formatted.replace(/^###### (.+)$/gm, '<h6 class="md-heading">$1</h6>');
  formatted = formatted.replace(/^##### (.+)$/gm, '<h5 class="md-heading">$1</h5>');
  formatted = formatted.replace(/^#### (.+)$/gm, '<h4 class="md-heading">$1</h4>');
  formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="md-heading">$1</h3>');
  formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="md-heading">$1</h2>');
  formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="md-heading">$1</h1>');

  // Listas y Blockquotes (Simplificado para este ejemplo)
  formatted = formatted.replace(/^- (.+)$/gm, '<li class="md-list-item">$1</li>');
  formatted = formatted.replace(/(<li class="md-list-item">.*<\/li>\n?)+/g, '<ul class="md-list">$&</ul>');
  formatted = formatted.replace(/^> (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

  // Saltos de línea
  formatted = formatted.replace(/\n/g, '<br>');

  // Limpieza final de <br> duplicados
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

async function loadConversations() {
  if (!elements.conversationsList) return;

  try {
    // Cargar conversaciones normales
    const response = await fetch('/api/conversations');
    if (!response.ok) return;

    const conversations = await response.json();

    // Cargar cursos iniciados
    const coursesResponse = await fetch('/api/enrolled-courses');
    let enrolledCourses = [];
    if (coursesResponse.ok) {
      enrolledCourses = await coursesResponse.json();
    }

    renderConversationsList(conversations, enrolledCourses);

  } catch (error) {
    console.error('Error cargando conversaciones:', error);
  }
}

function renderConversationsList(conversationsData, enrolledCourses) {
  const list = elements.conversationsList;
  list.innerHTML = '';

  // conversationsData viene como { regular: [...], courses: [...] }
  const regularConvs = conversationsData.regular || [];
  const courseConvs = conversationsData.courses || []; // Aunque ya usas enrolledCourses, esto es por seguridad

  // SECCIÓN: Cursos Iniciados (Ya lo tenías bien con enrolledCourses)
  if (enrolledCourses.length > 0) {
    // ... (Tu código existente para cursos se mantiene igual)
    const sectionTitle = document.createElement('li');
    sectionTitle.className = 'conv-section-title';
    sectionTitle.innerHTML = `<span>📚 Cursos Iniciados</span>`;
    list.appendChild(sectionTitle);

    enrolledCourses.forEach(course => {
      // ... (Tu código existente para renderizar cursos)
      const li = document.createElement('li');
      li.className = 'conv-item conv-course-item';
      const courseId = course.course_id || course.metadata_course_id;
      li.dataset.courseId = courseId;

      if (courseId === state.currentCourseId) {
        li.classList.add('active');
      }

      li.innerHTML = `
        <span class="conv-item-icon">📖</span>
        <div class="conv-item-info">
          <span class="conv-item-title">${escapeHtml(course.title)}</span>
          <span class="conv-item-date">Curso</span>
        </div>
        <div class="conv-item-actions">
          <button class="conv-action-btn resume-btn" title="Continuar">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.closest('.conv-action-btn')) return;
        switchToCourse(course.course_id);
      });

      list.appendChild(li);
    });

    const separator = document.createElement('li');
    separator.className = 'conv-separator';
    separator.innerHTML = '<hr>';
    list.appendChild(separator);
  }

  // SECCIÓN: Conversaciones Normales (CORREGIDO)
  if (regularConvs.length > 0) { // ✅ Ahora verificamos regularConvs.length
    const sectionTitle = document.createElement('li');
    sectionTitle.className = 'conv-section-title';
    sectionTitle.innerHTML = `<span>💬 Conversaciones</span>`;
    list.appendChild(sectionTitle);

    regularConvs.forEach(conv => { // ✅ Iteramos sobre regularConvs
      const li = document.createElement('li');
      li.className = 'conv-item';
      li.dataset.id = conv.id;

      if (conv.id === state.currentConversationId) {
        li.classList.add('active');
      }

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

      li.addEventListener('click', (e) => {
        if (e.target.closest('.conv-action-btn')) return;
        switchConversation(conv.id);
      });

      const renameBtn = li.querySelector('.rename-btn');
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startRenameConversation(li, conv);
      });

      const deleteBtn = li.querySelector('.delete');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteConversation(conv.id, li);
      });

      list.appendChild(li);
    });
  } else if (enrolledCourses.length === 0) {
    // Solo mostrar mensaje vacío si no hay NADA (ni cursos ni chats)
    list.innerHTML = '<li class="conv-empty">No hay conversaciones aún</li>';
  }
}

async function switchToCourse(courseId) {
  // Guardar conversación actual si es normal
  if (!state.currentCourseId) {
    localStorage.setItem('mirai-ai-last-normal-conv', state.currentConversationId);
  }

  // Cambiar a conversación del curso
  const convId = await getEducationConversation(courseId);
  state.currentConversationId = convId;
  state.currentCourseId = courseId;

  localStorage.setItem(CONFIG.STORAGE_KEY_CONVERSATION, convId);
  localStorage.setItem('mirai-ai-course-id', courseId);

  // Cargar historial
  elements.chatMessages.innerHTML = '';
  await loadConversationHistory(convId);

  // Actualizar UI
  updateActiveConversation();

  // Cerrar sidebar en móvil
  const sidebar = document.querySelector('.mobile-sidebar');
  if (sidebar && sidebar.classList.contains('active')) {
    document.querySelector('.mobile-overlay').click();
  }
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
  // Limpiar todos
  document.querySelectorAll('.conv-item').forEach(item => {
    item.classList.remove('active');
  });

  // Buscar por ID en ambos tipos
  const activeItem = document.querySelector(`.conv-item[data-id="${state.currentConversationId}"]`) || document.querySelector(`.conv-item[data-course-id="${state.currentCourseId}"]`);

  if (activeItem) {
    activeItem.classList.add('active');
  }
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


// --- INICIALIZAR MODO AUDIO ---
function initializeAudioMode() {
  const savedMode = localStorage.getItem(CONFIG.TTS_MODE_KEY) || 'auto';
  state.audioMode = savedMode;
  updateAudioModeUI();

  if (elements.audioModeToggle) {
    elements.audioModeToggle.addEventListener('click', cycleAudioMode);
  }
}

function cycleAudioMode() {
  const modes = ['auto', 'always', 'never'];
  const currentIndex = modes.indexOf(state.audioMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  state.audioMode = modes[nextIndex];

  localStorage.setItem(CONFIG.TTS_MODE_KEY, state.audioMode);
  updateAudioModeUI();

  // Feedback visual
  const modeLabels = {
    auto: '🔊 Modo automático',
    always: '🎙️ Siempre audio',
    never: '🔇 Solo texto'
  };
  appendMessage('system', modeLabels[state.audioMode]);
}

function updateAudioModeUI() {
  if (!elements.audioModeToggle) return;

  const btn = elements.audioModeToggle;
  const label = btn.querySelector('.audio-mode-label');

  const configs = {
    auto: { icon: '🔊', label: 'Auto', class: '' },
    always: { icon: '🎙️', label: 'Audio', class: 'active' },
    never: { icon: '🔇', label: 'Texto', class: 'text-mode' },
  };

  const config = configs[state.audioMode];
  btn.className = `audio-mode-toggle ${config.class}`;
  if (label) label.textContent = config.label;
  btn.title = `Modo: ${config.label} (clic para cambiar)`;
}

// --- CONFIGURAR REPRODUCTOR DE AUDIO ---
function setupAudioPlayer(audioElement) {
  if (!audioElement) return;

  const container = audioElement.closest('.audio-player-container');
  const currentTimeEl = container.querySelector('.audio-time-current');
  const totalTimeEl = container.querySelector('.audio-time-total');

  // Formatear tiempo (mm:ss)
  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Cuando se carga el metadato
  audioElement.addEventListener('loadedmetadata', () => {
    totalTimeEl.textContent = formatTime(audioElement.duration);
  });

  // Actualizar tiempo actual
  audioElement.addEventListener('timeupdate', () => {
    currentTimeEl.textContent = formatTime(audioElement.currentTime);
  });

  // Click en el contenedor para pausar/reproducir
  container.addEventListener('click', (e) => {
    if (e.target.tagName !== 'AUDIO' && !e.target.closest('.audio-controls')) {
      if (audioElement.paused) {
        audioElement.play();
      } else {
        audioElement.pause();
      }
    }
  });
}

// ============================================
// LIGHTBOX / MODAL PARA IMÁGENES
// ============================================

function initializeLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.querySelector('.lightbox-close');
  const lightboxDownload = document.querySelector('.lightbox-download');

  if (!lightbox || !lightboxImg) return;

  // Abrir lightbox al hacer clic en imagen
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('lightbox-trigger')) {
      const imageUrl = e.target.src;
      lightboxImg.src = imageUrl;
      lightbox.classList.remove('hidden');
      document.body.style.overflow = 'hidden'; // Prevenir scroll
    }
  });

  // Cerrar lightbox
  function closeLightbox() {
    lightbox.classList.add('hidden');
    lightboxImg.src = '';
    document.body.style.overflow = '';
  }

  lightboxClose.addEventListener('click', closeLightbox);

  // Cerrar al hacer clic en el overlay
  document.querySelector('.lightbox-overlay').addEventListener('click', closeLightbox);

  // Cerrar con tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
      closeLightbox();
    }
  });

  // Descargar imagen desde lightbox
  lightboxDownload.addEventListener('click', async (e) => {
    e.stopPropagation();
    await downloadImage(lightboxImg.src, 'mirai-generated-image.png');
  });
}

// --- DESCARGAR IMAGEN (USANDO WORKER COMO PROXY) ---
async function downloadImage(imageUrl, filename = 'imagen.png') {
  try {
    // Si la URL ya es relativa (/api/image/...), usar directamente
    // Si es absoluta (https://aiassets...), convertirla
    let fetchUrl = imageUrl;
    if (imageUrl.startsWith('http')) {
      const r2Key = imageUrl.replace('https://aiassets.aberumirai.com/', '');
      fetchUrl = `/api/image/${r2Key}`;
    }

    const response = await fetch(fetchUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(blobUrl);

    console.log('✅ Imagen descargada correctamente');
  } catch (error) {
    console.error('❌ Error descargando imagen:', error);
    alert('No se pudo descargar automáticamente. Haz clic derecho en la imagen y selecciona "Guardar imagen como..."');
  }
}

// Inicializar listeners para botones de descarga en el chat
function initializeImageDownloadButtons() {
  const downloadButtons = document.querySelectorAll('.image-download-btn');

  downloadButtons.forEach(btn => {
    if (btn.dataset.initialized === 'true') return;

    btn.dataset.initialized = 'true';

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      const imageUrl = btn.dataset.imageUrl;
      const filename = `mirai-image-${Date.now()}.png`;

      // Feedback visual
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:16px;height:16px;">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span class="download-label">¡Listo!</span>
      `;
      btn.style.borderColor = '#34c759';
      btn.style.color = '#34c759';

      await downloadImage(imageUrl, filename);

      // Restaurar después de 2 segundos
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 2000);
    });
  });
}

async function sendMessageToAPI(message, conversationId) {
  const requestBody = {
    message: message,
    conversation_id: conversationId,
    audio_mode: state.audioMode || 'auto'
  };

  // ✅ Incluir contexto educativo si está activo
  if (educationContext.isActive && educationContext.courseId && educationContext.lessonId) {
    requestBody.course_id = educationContext.courseId;
    requestBody.lesson_id = educationContext.lessonId;
  }

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.suggestions && data.suggestions.length > 0) {
      renderSuggestions(data.suggestions);
    } else {
      const bar = document.getElementById('suggestions-bar');
      if (bar) {
        bar.innerHTML = '';
        bar.style.display = 'none';
      }
    }

    return data.response;
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
    throw error;
  }
}

async function sendEducationWelcome() {
  if (!educationContext.isActive) return;

  // Mostrar mensaje visual de bienvenida
  if (elements.chatMessages) {
    const welcomeDiv = document.createElement('div');
    welcomeDiv.style.cssText = `
      background: linear-gradient(135deg, var(--accent-color), var(--accent-secondary));
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 12px;
      text-align: center;
      font-size: 0.95rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    `;

    welcomeDiv.innerHTML = `
      <strong>🎓 Modo Educativo Activado</strong><br>
      <small>Curso: ${educationContext.courseId} | Lección: ${educationContext.lessonId}</small>
    `;

    elements.chatMessages.appendChild(welcomeDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  // ✅ ENVIAR contexto educativo en el primer mensaje
  const firstMessage = 'Hola, estoy listo para comenzar esta lección.';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: firstMessage,
        conversation_id: state.currentConversationId,
        course_id: educationContext.courseId,  // ← AGREGAR
        lesson_id: educationContext.lessonId,  // ← AGREGAR
        audio_mode: state.audioMode || 'auto'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.response) {
      appendMessage('assistant', data.response, true, data.audio_url || null);
      if (data.suggestions) renderSuggestions(data.suggestions);
    }
  } catch (error) {
    console.error('❌ Error en welcome message:', error);
    appendMessage('system', '⚠️ Error al cargar la lección. Intenta de nuevo.');
  }
}