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
  VOICE_LANG: 'es-ES'
};

// --- ELEMENTOS DEL DOM ---
const elements = {
  chatMessages: document.getElementById('chat-messages'),
  messageInput: document.getElementById('message-input'),
  sendButton: document.getElementById('send-button'),
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
  recognition: null  
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  initializeVoiceRecognition(); 
  initializeChat();
  loadOrCreateConversation();
  setupEventListeners();
  setupMobileMenu();
});

// --- GESTIÓN DE TEMA ---
function initializeTheme() {
  const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEY_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  state.theme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(state.theme);
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

// --- LÓGICA DE MENSAJES ---
async function handleSendMessage() {
  const content = elements.messageInput.value.trim();
  
  if (!content || state.isSending) return;
  
  elements.messageInput.value = '';
  autoResizeTextarea();
  
  state.isSending = true;
  updateSendButtonState();
  showTypingIndicator();
  
  try {
    appendMessage('user', content);
    
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
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
    appendMessage('system', '⚠️ Hubo un error al procesar tu mensaje. Por favor, inténtalo de nuevo.');
    elements.messageInput.value = content;
  } finally {
    state.isSending = false;
    updateSendButtonState();
    elements.messageInput.focus();
  }
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