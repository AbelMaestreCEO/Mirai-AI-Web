// Reportes (workers/routes/reports.ts): el alumno completa los reportes a los
// que tiene acceso; profesores y administradores los crean y revisan.

import { apiFetch } from './api';

export type QuestionType = 'text' | 'select' | 'time' | 'date' | 'image';

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[];
}

/** Reporte tal como lo ve el alumno (GET /api/my-reports). */
export interface StudentReport {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  deadline?: string | null;
  questions?: Question[];
  submitted: boolean;
  submittedAt?: string | null;
}

/** Reporte en la gestión (GET /api/reports). */
export interface ManagedReport {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  deadline?: string | null;
  active: boolean;
  questions?: Question[];
  /** Acceso efectivo: individual más los alumnos de la sección. */
  access?: string[];
  individualAccess?: string[];
  sectionId?: string | null;
  sectionName?: string | null;
}

export interface Submission {
  id: string;
  studentId?: string;
  studentName?: string | null;
  submittedAt?: string | null;
  answers?: Record<string, string | string[] | null>;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Texto',
  select: 'Selección',
  time: 'Hora',
  date: 'Fecha',
  image: 'Imagen',
};

/**
 * Petición JSON a la API de reportes: devuelve el cuerpo o lanza un Error con
 * el estado y el texto de la respuesta.
 */
export async function reportsApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await apiFetch(path, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

/**
 * Chip de fecha límite con color según la urgencia. `todayLabel` es el texto
 * para "vence hoy" (cada vista usaba el suyo).
 */
export function deadlineChip(deadline: string, todayLabel: string): { style: string; label: string } {
  const diff = Math.ceil((new Date(`${deadline}T00:00:00`).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { style: 'background:#FFEBEE;color:#C62828;', label: 'Vencido' };
  if (diff === 0) return { style: 'background:#FFEBEE;color:#C62828;', label: todayLabel };
  if (diff <= 2) return { style: 'background:#FFF8E1;color:#F57F17;', label: `${diff}d restantes` };
  return { style: '', label: deadline };
}
