/* ============================================
   MIRAI AI - Frontend Logic
   Conexión con Cloudflare Worker + DeepSeek API
   ============================================ */

// --- CONSTANTES Y CONFIGURACIÓN ---
const CONFIG = {
  API_ENDPOINT: '/api/chat',
  STORAGE_KEY_THEME: 'mirai-ai-theme',
  STORAGE_KEY_CONVERSATION: 'mirai-ai-conversation-id',
  TYPING_DELAY: 300, // ms para mostrar indicador de escritura
  MAX_INPUT_HEIGHT: 120, // px
  DEBOUNCE_DELAY: 300 // ms para auto-resize
};

// --- ELEMENTOS DEL DOM ---
const elements = {
  chatMessages: document.getElementById('chat-messages'),
  messageInput: document.getElementById('message-input'),
  sendButton: document.getElementById('send-button'),
  themeToggle: document.getElementById('theme-toggle'),
  typingIndicator: document.getElementById('typing-indicator'),
  sunIcon: document.querySelector('.sun-icon'),
  moonIcon: document.querySelector('.moon-icon')
};

// --- ESTADO DE LA APLICACIÓN ---
let state = {
  isSending: false,
  currentConversationId: null,
  theme: 'light'
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  initializeChat();
  loadOrCreateConversation();
  setupEventListeners();
});

// --- GESTIÓN DE TEMA ---
function initializeTheme() {
  const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEY_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  state.theme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(state.theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  
  // Actualizar iconos
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
    
    // Limpiar mensaje de bienvenida
    elements.chatMessages.innerHTML = '';
    
    // Agregar mensajes históricos
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
  // Enviar mensaje con botón
  elements.sendButton.addEventListener('click', handleSendMessage);
  
  // Enviar mensaje con Enter (Shift+Enter para nueva línea)
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
  
  // Auto-resize del textarea
  elements.messageInput.addEventListener('input', debounce(autoResizeTextarea, CONFIG.DEBOUNCE_DELAY));
  
  // Cambio de tema
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Mantener foco en el input
  elements.messageInput.focus();
}

// --- LÓGICA DE MENSAJES ---
async function handleSendMessage() {
  const content = elements.messageInput.value.trim();
  
  if (!content || state.isSending) return;
  
  // Resetear input
  elements.messageInput.value = '';
  autoResizeTextarea();
  
  // Deshabilitar botón durante envío
  state.isSending = true;
  updateSendButtonState();
  showTypingIndicator();
  
  try {
    // Agregar mensaje del usuario inmediatamente
    appendMessage('user', content);
    
    // Enviar al Worker
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: content,
        conversation_id: state.currentConversationId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Ocultar indicador de escritura
    hideTypingIndicator();
    
    // Agregar respuesta de la IA
    if (data.response) {
      appendMessage('assistant', data.response);
      
      // Guardar en historial local (opcional, para respaldo)
      saveToLocalHistory(data.response);
    } else {
      throw new Error('No se recibió respuesta válida');
    }
    
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    hideTypingIndicator();
    
    // Mostrar mensaje de error
    appendMessage('system', '⚠️ Hubo un error al procesar tu mensaje. Por favor, inténtalo de nuevo.');
    
    // Restaurar mensaje en el input
    elements.messageInput.value = content;
  } finally {
    state.isSending = false;
    updateSendButtonState();
    elements.messageInput.focus();
  }
}

// --- INTERFAZ DE USUARIO ---
function appendMessage(role, content, animate = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  // Escapar HTML para prevenir XSS
  const escapedContent = escapeHtml(content);
  
  // Formatear markdown básico (negritas, código, etc.)
  const formattedContent = formatMessageContent(escapedContent);
  
  // Avatar según rol
  const avatar = role === 'user' ? 'U' : 'M';
  
  // Tiempo actual
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
  
  // Resetear altura para calcular el correcto
  textarea.style.height = 'auto';
  
  // Calcular nueva altura
  const newHeight = Math.min(
    textarea.scrollHeight,
    CONFIG.MAX_INPUT_HEIGHT
  );
  
  textarea.style.height = `${newHeight}px`;
}

// --- UTILIDADES ---
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessageContent(content) {
  // Formatear negritas (**texto**)
  let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Formatear código inline (`texto`)
  formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Formatear bloques de código (```idioma\ncódigo```)
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
  });
  
  // Convertir saltos de línea en <br>
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

function saveToLocalHistory(response) {
  // Opcional: guardar historial en localStorage como respaldo
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

// --- DEBUGGING (Solo en desarrollo) ---
if (import.meta?.env?.DEV) {
  console.log('🤖 Mirai AI - Modo Desarrollo activado');
}