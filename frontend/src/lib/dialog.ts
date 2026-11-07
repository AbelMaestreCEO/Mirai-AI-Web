// Diálogos propios de la app (aviso, confirmación y entrada de texto).
//
// Sustituye a alert(), confirm() y prompt() nativos: mismo API imperativo con
// Promises, pero renderizado por <AppDialog /> con el diseño de la interfaz.
// Uso:
//   await dialog.alert('Guardado');
//   if (!(await dialog.confirm('¿Eliminar?'))) return;
//   const nota = await dialog.prompt('Nueva nota:', { inputType: 'number' });

import { reactive } from 'vue';

export type DialogKind = 'alert' | 'confirm' | 'prompt';
export type DialogTone = 'default' | 'danger' | 'success' | 'error' | 'warning' | 'info';

export interface DialogOptions {
  title?: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: 'text' | 'number';
  inputSuffix?: string;
}

interface DialogState extends Required<Omit<DialogOptions, 'inputSuffix'>> {
  open: boolean;
  kind: DialogKind;
  message: string;
  inputSuffix: string;
  resolve: ((value: string | boolean | null) => void) | null;
}

export const dialogState = reactive<DialogState>({
  open: false,
  kind: 'alert',
  message: '',
  title: '',
  tone: 'default',
  confirmText: '',
  cancelText: '',
  placeholder: '',
  defaultValue: '',
  inputType: 'text',
  inputSuffix: '',
  resolve: null,
});

const DEFAULTS: Record<DialogKind, { title: string; confirmText: string; cancelText: string }> = {
  alert: { title: 'Aviso', confirmText: 'Entendido', cancelText: 'Cancelar' },
  confirm: { title: 'Confirmar', confirmText: 'Confirmar', cancelText: 'Cancelar' },
  prompt: { title: 'Introduce un valor', confirmText: 'Aceptar', cancelText: 'Cancelar' },
};

function open(kind: DialogKind, message: string, options: DialogOptions = {}): Promise<string | boolean | null> {
  if (dialogState.resolve) {
    dialogState.resolve(dialogState.kind === 'prompt' ? null : false);
  }

  const base = DEFAULTS[kind];
  dialogState.kind = kind;
  dialogState.message = String(message ?? '');
  dialogState.title = options.title ?? base.title;
  dialogState.tone = options.tone ?? 'default';
  dialogState.confirmText = options.confirmText ?? base.confirmText;
  dialogState.cancelText = options.cancelText ?? base.cancelText;
  dialogState.placeholder = options.placeholder ?? '';
  dialogState.defaultValue = options.defaultValue ?? '';
  dialogState.inputType = options.inputType ?? 'text';
  dialogState.inputSuffix = options.inputSuffix ?? '';
  dialogState.open = true;

  return new Promise((resolve) => {
    dialogState.resolve = resolve;
  });
}

function settle(value: string | boolean | null) {
  const resolve = dialogState.resolve;
  dialogState.resolve = null;
  dialogState.open = false;
  resolve?.(value);
}

export const dialog = {
  /** Aviso informativo con un único botón. */
  alert(message: string, options: DialogOptions = {}): Promise<boolean> {
    return open('alert', message, options) as Promise<boolean>;
  },
  /** Confirmación Sí/No. Resuelve true al aceptar. */
  confirm(message: string, options: DialogOptions = {}): Promise<boolean> {
    return open('confirm', message, options) as Promise<boolean>;
  },
  /** Entrada de texto. Resuelve el texto o null si se cancela. */
  prompt(message: string, options: DialogOptions = {}): Promise<string | null> {
    return open('prompt', message, options) as Promise<string | null>;
  },
  /** Cierra el diálogo actual como cancelado. */
  cancel() {
    settle(dialogState.kind === 'prompt' ? null : false);
  },
  /** Confirma el diálogo actual (usado por el componente). */
  accept(value?: string) {
    settle(dialogState.kind === 'prompt' ? (value ?? '') : true);
  },
};
