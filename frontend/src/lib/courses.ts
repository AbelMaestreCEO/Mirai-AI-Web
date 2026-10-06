// Catálogo de cursos (migración de public/courses.js): categorías, cursos,
// subcategorías y detalle de un curso. Lo usan CourseCategoryPage,
// CoursesPage y CourseDetailsPage.

import { api } from './api';

export interface Category {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  course_count?: number;
}

export interface Subcategory {
  id: string;
  title: string;
  icon?: string;
}

export interface Course {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  level?: string;
  lessons?: number;
  duration?: string;
  category?: string;
  subcategory?: string;
}

export interface Lesson {
  id: string;
  title: string;
  content?: string;
}

export interface CourseDetails extends Course {
  lessons_list?: Lesson[];
}

async function getList<T>(path: string): Promise<T[]> {
  const { ok, status, data } = await api.get<T[]>(path);
  if (!ok) throw new Error(`HTTP ${status}`);
  return Array.isArray(data) ? data : [];
}

export const loadCategories = () => getList<Category>('/api/categories-with-count');
export const loadCourses = () => getList<Course>('/api/courses');
export const loadSubcategories = () => getList<Subcategory>('/api/subcategories');

export async function loadCourseDetails(id: string): Promise<CourseDetails> {
  const { ok, data } = await api.get<CourseDetails>(`/api/course-details?id=${encodeURIComponent(id)}`);
  if (!ok) throw new Error('Curso no encontrado');
  return data;
}

export function capitalizeFirst(str?: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// Degradado de la tarjeta según la subcategoría del curso.
export const SUBCATEGORY_GRADIENTS: Record<string, string> = {
  web: 'linear-gradient(135deg, #e44d26, #f16529)',
  backend: 'linear-gradient(135deg, #3776ab, #ffd43b)',
  datos: 'linear-gradient(135deg, #150458, #ff6600)',
  movil: 'linear-gradient(135deg, #fa7343, #f5a623)',
  devops: 'linear-gradient(135deg, #f05032, #de4c36)',
  cloudflare: 'linear-gradient(135deg, #f48120, #fbad41)',
  universal: 'linear-gradient(135deg, #4facfe, #00f2fe)',
  contemporanea: 'linear-gradient(135deg, #f093fb, #f5576c)',
  antigua: 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  excel: 'linear-gradient(135deg, #217346, #2b5876)',
  word: 'linear-gradient(135deg, #2b579a, #4e4376)',
  powerpoint: 'linear-gradient(135deg, #d24726, #f5576c)',
  marketing: 'linear-gradient(135deg, #f093fb, #f5576c)',
  emprendimiento: 'linear-gradient(135deg, #f5af19, #f12711)',
  literatura: 'linear-gradient(135deg, #fa709a, #fee140)',
  filosofia: 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  biologia: 'linear-gradient(135deg, #a8edea, #fed6e3)',
  fisica: 'linear-gradient(135deg, #667eea, #764ba2)',
  matematicas: 'linear-gradient(135deg, #4facfe, #00f2fe)',
};

// Texto del hero de cada categoría principal.
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  programacion: 'Aprende a programar con Mirai AI como tu tutor personal. Clases interactivas, ejercicios prácticos y feedback en tiempo real.',
  ofimatica: 'Domina las herramientas de oficina más utilizadas. Excel, Word, PowerPoint y Google Workspace desde cero hasta avanzado.',
  negocios: 'Desarrolla habilidades empresariales. Marketing digital, emprendimiento, gestión de proyectos y administración.',
  historia: 'Explora los eventos que marcaron el mundo. Civilizaciones antiguas, guerras mundiales y personajes históricos.',
  humanidades: 'Sumérgete en el pensamiento humano. Literatura, filosofía, arte y cultura a través de los siglos.',
  ciencias: 'Comprende el mundo natural. Biología, química, física y matemáticas con explicaciones claras y prácticas.',
};
