<template>
  <Teleport to="body">
    <Transition name="app-dialog">
      <div v-if="dialogState.open" class="app-dialog-root" @click.self="dialog.cancel">
        <div
          class="app-dialog"
          :class="[`tone-${dialogState.tone}`, { 'is-prompt': dialogState.kind === 'prompt' }]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="dialogState.message ? messageId : undefined"
          tabindex="-1"
          @keydown.esc.prevent="dialog.cancel"
          @keydown.enter.prevent="onAccept"
        >
          <div class="app-dialog-icon" aria-hidden="true">
            <svg v-if="dialogState.tone === 'danger' || dialogState.tone === 'error'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
            <svg v-else-if="dialogState.tone === 'success'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <svg v-else-if="dialogState.tone === 'warning'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" />
            </svg>
            <svg v-else-if="dialogState.kind === 'prompt'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          </div>

          <h2 :id="titleId" class="app-dialog-title">{{ dialogState.title }}</h2>
          <p v-if="dialogState.message" :id="messageId" class="app-dialog-message">{{ dialogState.message }}</p>

          <div v-if="dialogState.kind === 'prompt'" class="app-dialog-field">
            <input
              ref="inputEl"
              v-model="inputValue"
              class="app-dialog-input"
              :type="dialogState.inputType"
              :placeholder="dialogState.placeholder"
              autocomplete="off"
              spellcheck="false"
            />
            <span v-if="dialogState.inputSuffix" class="app-dialog-suffix">{{ dialogState.inputSuffix }}</span>
          </div>

          <div class="app-dialog-actions">
            <button v-if="dialogState.kind !== 'alert'" type="button" class="app-dialog-btn cancel" @click="dialog.cancel">
              {{ dialogState.cancelText }}
            </button>
            <button ref="confirmEl" type="button" class="app-dialog-btn confirm" @click="onAccept">
              {{ dialogState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { dialog, dialogState } from '@/lib/dialog';

const titleId = 'app-dialog-title';
const messageId = 'app-dialog-message';
const inputValue = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const confirmEl = ref<HTMLButtonElement | null>(null);

function onAccept() {
  if (dialogState.kind === 'prompt') {
    dialog.accept(inputValue.value);
  } else {
    dialog.accept();
  }
}

watch(
  () => dialogState.open,
  async (open) => {
    if (!open) return;
    inputValue.value = dialogState.defaultValue;
    await nextTick();
    if (dialogState.kind === 'prompt') {
      inputEl.value?.focus();
      inputEl.value?.select();
    } else {
      confirmEl.value?.focus();
    }
  },
);
</script>

<style scoped>
/* Todo sale de las variables de styles.css, que además reescribe
   applyAppearance() con la paleta de acento elegida por el usuario. */
.app-dialog-root {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: rgba(20, 16, 30, 0.42);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.app-dialog {
  --dialog-accent: var(--accent-color, #6750a4);
  --dialog-gradient: var(--accent-gradient, linear-gradient(135deg, #6750a4, #9a82db));
  --dialog-soft: var(--secondary-container, #e8def8);
  --dialog-glow: var(--accent-glow, rgba(103, 80, 164, 0.18));
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.6rem;
  border-radius: 22px;
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.16));
  background: var(--glass-bg, #ffffff);
  color: var(--text-primary, #1c1b1f);
  box-shadow:
    var(--glass-shadow, 0 6px 24px rgba(0, 0, 0, 0.12)),
    0 24px 60px rgba(0, 0, 0, 0.16);
  outline: none;
}

/* Tonos semánticos: el acento de cada uno se adapta al tema. */
.app-dialog.tone-danger,
.app-dialog.tone-error {
  --dialog-accent: #b3261e;
  --dialog-gradient: linear-gradient(135deg, #8c1d18, #b3261e 55%, #d32f2f);
  --dialog-soft: rgba(179, 38, 30, 0.1);
  --dialog-glow: rgba(179, 38, 30, 0.2);
}

.app-dialog.tone-success {
  --dialog-accent: #1b6b3a;
  --dialog-gradient: linear-gradient(135deg, #1b6b3a, #2e7d32 60%, #43a047);
  --dialog-soft: rgba(27, 107, 58, 0.1);
  --dialog-glow: rgba(27, 107, 58, 0.2);
}

.app-dialog.tone-warning {
  --dialog-accent: #8a5a00;
  --dialog-gradient: linear-gradient(135deg, #8a5a00, #b7791f 60%, #d69e2e);
  --dialog-soft: rgba(154, 103, 0, 0.12);
  --dialog-glow: rgba(154, 103, 0, 0.2);
}

.app-dialog.tone-info {
  --dialog-accent: #0b6bcb;
  --dialog-gradient: linear-gradient(135deg, #0b5cab, #1e88e5 60%, #42a5f5);
  --dialog-soft: rgba(11, 107, 203, 0.1);
  --dialog-glow: rgba(11, 107, 203, 0.2);
}

:global(html[data-theme='dark']) .app-dialog-root {
  background: rgba(4, 3, 8, 0.58);
}

:global(html[data-theme='dark']) .app-dialog {
  box-shadow:
    var(--glass-shadow, 0 6px 24px rgba(0, 0, 0, 0.3)),
    0 24px 60px rgba(0, 0, 0, 0.5);
}

:global(html[data-theme='dark']) .app-dialog.tone-danger,
:global(html[data-theme='dark']) .app-dialog.tone-error {
  --dialog-accent: #f2b8b5;
  --dialog-gradient: linear-gradient(135deg, #8c1d18, #b3261e);
  --dialog-soft: rgba(242, 184, 181, 0.12);
  --dialog-glow: rgba(242, 184, 181, 0.16);
}

:global(html[data-theme='dark']) .app-dialog.tone-success {
  --dialog-accent: #a6e3b5;
  --dialog-gradient: linear-gradient(135deg, #1b5e20, #2e7d32);
  --dialog-soft: rgba(166, 227, 181, 0.12);
  --dialog-glow: rgba(166, 227, 181, 0.16);
}

:global(html[data-theme='dark']) .app-dialog.tone-warning {
  --dialog-accent: #ffd479;
  --dialog-gradient: linear-gradient(135deg, #7a4f00, #9a6700);
  --dialog-soft: rgba(255, 212, 121, 0.12);
  --dialog-glow: rgba(255, 212, 121, 0.16);
}

:global(html[data-theme='dark']) .app-dialog.tone-info {
  --dialog-accent: #9ecbff;
  --dialog-gradient: linear-gradient(135deg, #0b4f8a, #1565c0);
  --dialog-soft: rgba(158, 203, 255, 0.12);
  --dialog-glow: rgba(158, 203, 255, 0.16);
}

.app-dialog-icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  color: var(--dialog-accent);
  background: var(--dialog-soft);
  box-shadow: inset 0 1px 0 var(--glass-highlight, rgba(255, 255, 255, 0.4));
}

.app-dialog-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary, #1c1b1f);
}

.app-dialog-message {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--text-secondary, #49454f);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.app-dialog-field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.app-dialog-input {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 12px;
  border: 1.5px solid var(--glass-border, rgba(103, 80, 164, 0.18));
  background: var(--secondary-container, #e8def8);
  color: var(--text-primary, #1c1b1f);
  font: inherit;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.app-dialog-input::placeholder {
  color: var(--text-tertiary, #79747e);
}

.app-dialog-input:focus {
  border-color: var(--dialog-accent);
  box-shadow: 0 0 0 3px var(--dialog-glow);
}

.app-dialog-suffix {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary, #49454f);
}

.app-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.35rem;
}

.app-dialog-btn {
  padding: 0.6rem 1.15rem;
  border-radius: 12px;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.14s ease, background 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
}

.app-dialog-btn:active {
  transform: translateY(1px);
}

.app-dialog-btn.cancel {
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.2));
  background: transparent;
  color: var(--text-secondary, #49454f);
}

.app-dialog-btn.cancel:hover {
  background: var(--secondary-container, #e8def8);
}

.app-dialog-btn.confirm {
  border: 1px solid transparent;
  background: var(--dialog-gradient);
  color: #fff;
  box-shadow: 0 8px 20px var(--dialog-glow);
}

.app-dialog-btn.confirm:hover {
  filter: brightness(1.06);
  box-shadow: 0 10px 24px var(--dialog-glow);
}

.app-dialog-btn:focus-visible {
  outline: 2px solid var(--dialog-accent);
  outline-offset: 2px;
}

/* Animación de entrada/salida: solo opacidad y transform (GPU, sin repaints). */
.app-dialog-enter-active,
.app-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.app-dialog-enter-active .app-dialog,
.app-dialog-leave-active .app-dialog {
  transition: opacity 0.2s ease, transform 0.24s cubic-bezier(0.2, 0.9, 0.25, 1);
}

.app-dialog-enter-from,
.app-dialog-leave-to {
  opacity: 0;
}

.app-dialog-enter-from .app-dialog,
.app-dialog-leave-to .app-dialog {
  opacity: 0;
  transform: translateY(14px) scale(0.96);
}

@media (max-width: 480px) {
  .app-dialog {
    padding: 1.35rem;
    border-radius: 18px;
  }
  .app-dialog-actions {
    flex-direction: column-reverse;
  }
  .app-dialog-btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-dialog-enter-active,
  .app-dialog-leave-active,
  .app-dialog-enter-active .app-dialog,
  .app-dialog-leave-active .app-dialog {
    transition: none;
  }
  .app-dialog-enter-from .app-dialog,
  .app-dialog-leave-to .app-dialog {
    transform: none;
  }
}
</style>
