/* ============================================
   MIRAI EDUCATION - courses.js
   Versión Dinámica: Carga Categorías y Cursos desde D1
   Maneja: courses.html, course_details.html, course_category.html
   ============================================ */

// --- DETECCIÓN DE PÁGINA ---
const currentPage = window.location.pathname.includes('course_category')
    ? 'categories'
    : window.location.pathname.includes('course_details')
        ? 'details'
        : 'courses';

console.log(`📄 Página detectada: ${currentPage}`);

// --- ESTADO GLOBAL ---
const courseState = {
    activeCategory: 'todos',
    searchQuery: '',
    courses: [],
    categories: [], // Aquí cargaremos las categorías desde D1
    isLoading: false
};

// ============================================
// Mapeo de Subcategorías Visuales a Categorías Principales
// ============================================
const SUBCATEGORY_MAP = {
    // Categoría: Programación
    'web': 'programacion',
    'backend': 'programacion',
    'datos': 'programacion',
    'movil': 'programacion',
    'devops': 'programacion',
    'cloudflare': 'programacion',

    // Categoría: Ofimática (Ejemplo futuro)
    'office': 'ofimatica',
    'excel': 'ofimatica',

    // Categoría: Negocios
    'marketing': 'negocios',
    'emprendimiento': 'negocios',

    // Categoría: Historia
    'universal': 'historia',
    'antigua': 'historia',

    // Categoría: Humanidades
    'literatura': 'humanidades',
    'filosofia': 'humanidades',

    // Categoría: Ciencias
    'biologia': 'ciencias',
    'fisica': 'ciencias'
};

// ============================================
// FUNCIONES COMPARTIDAS (Utilidades)
// ============================================

function initializeTheme() {
    const savedTheme = localStorage.getItem('mirai-ai-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');

    if (theme === 'dark') {
        sunIcon?.classList.add('hidden');
        moonIcon?.classList.remove('hidden');
    } else {
        sunIcon?.classList.remove('hidden');
        moonIcon?.classList.add('hidden');
    }
    localStorage.setItem('mirai-ai-theme', theme);
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
        });
    }
}

function setupMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const closeMenu = document.querySelector('.close-menu');
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.mobile-overlay');

    if (!menuToggle || !closeMenu || !sidebar || !overlay) return;

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
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) toggleMenu();
    });
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// LÓGICA PARA CARGAR DATOS DE D1
// ============================================

/**
 * Carga categorías desde la API /api/categories
 */
async function loadCategoriesFromAPI() {
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        courseState.categories = data;
        console.log(`✅ ${data.length} categorías cargadas desde D1`);
        return data;
    } catch (error) {
        console.error('❌ Error cargando categorías:', error);
        // Fallback: Mostrar error en UI si estamos en la página de categorías
        if (currentPage === 'categories') {
            const grid = document.getElementById('categories-grid');
            if (grid) {
                grid.innerHTML = `
                    <div class="no-categories" style="grid-column: 1/-1; text-align: center;">
                        <span class="no-categories-icon">⚠️</span>
                        <p>Error cargando categorías. Verifica la conexión con D1.</p>
                    </div>`;
            }
        }
        return [];
    }
}

/**
 * Carga cursos desde la API /api/courses
 */
async function loadCoursesFromAPI() {
    try {
        const response = await fetch('/api/courses');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        courseState.courses = data;
        console.log(`✅ ${data.length} cursos cargados desde D1`);
        return data;
    } catch (error) {
        console.error('❌ Error cargando cursos:', error);
        return [];
    }
}

// ============================================
// PÁGINA: course_category.html (Categorías)
// ============================================

async function initCategoriesPage() {
    console.log('🗂️ Inicializando página de categorías...');

    // 1. Cargar categorías desde D1
    const categories = await loadCategoriesFromAPI();

    // 2. Renderizar
    renderCategories(categories);

    // 3. Configurar búsqueda
    const searchInput = document.getElementById('category-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = categories.filter(cat =>
                cat.title.toLowerCase().includes(query) ||
                cat.description.toLowerCase().includes(query)
            );
            renderCategories(filtered);
        });
    }
}

function renderCategories(categories) {
    const grid = document.getElementById('categories-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (categories.length === 0) {
        grid.innerHTML = `
            <div class="no-categories" style="grid-column: 1/-1; text-align: center;">
                <span class="no-categories-icon">🔍</span>
                <p>No se encontraron categorías.</p>
            </div>`;
        return;
    }

    categories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'category-card';
        // Usar el color de la DB o un fallback
        const color = category.color || 'linear-gradient(135deg, #667eea, #764ba2)';
        card.style.setProperty('--card-accent', color);
        card.dataset.id = category.id;

        // Contar cursos reales para esta categoría (opcional, si tienes esa data)
        // Por ahora usamos 0 o calculamos si ya cargamos cursos
        const courseCount = courseState.courses.filter(c => c.category === category.id).length;

        card.innerHTML = `
            <div class="category-icon">${category.icon || '📚'}</div>
            <h3 class="category-title">${escapeHtml(category.title)}</h3>
            <p class="category-desc">${escapeHtml(category.description)}</p>
            <div class="category-stats">
                <span class="category-stat-item">
                    <span>📚</span> ${courseCount} cursos
                </span>
                <span class="category-stat-item">
                    <span>👥</span> -- alumnos
                </span>
            </div>
        `;

        card.addEventListener('click', () => {
            window.location.href = `courses.html?category=${category.id}`;
        });

        grid.appendChild(card);
    });
}

// ============================================
// 5. ACTUALIZAR INIT COURSES PAGE
// ============================================
function initCoursesPage() {
    console.log('📚 Inicializando página de cursos...');

    const elements = {
        grid: document.getElementById('courses-grid'),
        search: document.getElementById('course-search'),
        filterPills: document.getElementById('filter-pills'),
        countDisplay: document.getElementById('courses-count'),
        noResults: document.getElementById('no-results')
    };

    if (!elements.grid) return;

    // 1. Cargar datos
    Promise.all([loadCategoriesFromAPI(), loadCoursesFromAPI()]).then(([cats, courses]) => {
        // PASAR LAS CURSOS A renderFilterPills para obtener las subcategorías únicas
        renderFilterPills(cats, courses);
        renderCourses(courses);
        updateCourseCount(courses.length);
    });

    // ... (El resto de la configuración de búsqueda y botones se mantiene igual)
    if (elements.filterPills) {
        // Los listeners ya se asignaron dentro de renderFilterPills
    }

    if (elements.search) {
        let debounce;
        elements.search.addEventListener('input', (e) => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                courseState.searchQuery = e.target.value.trim().toLowerCase();
                applyFilters(elements);
            }, 200);
        });
    }

    elements.grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.course-start-btn');
        if (btn) {
            e.stopPropagation();
            const courseId = btn.dataset.course;
            if (courseId) {
                btn.textContent = 'Redirigiendo...';
                btn.disabled = true;
                setTimeout(() => {
                    window.location.href = `index.html?course=${courseId}&mode=education`;
                }, 300);
            }
        }
    });
}

// ============================================
// 2. RENDERIZAR PILLS DE CATEGORÍAS (CORREGIDO)
// ============================================
function renderFilterPills(categories, courses) {
  const container = document.getElementById('filter-pills');
  if (!container) return;

  // 1. Limpiar todo
  container.innerHTML = '';

  // 2. Crear botón "Todos"
  const todosBtn = document.createElement('button');
  todosBtn.className = 'filter-pill active';
  todosBtn.dataset.category = 'todos';
  todosBtn.textContent = 'Todos';
  container.appendChild(todosBtn);

  // 3. Obtener categorías ÚNICAS (NO subcategorías)
  // Extraemos el campo 'category' de cada curso
  const uniqueCategories = new Set();
  courses.forEach(course => {
    if (course.category) {
      uniqueCategories.add(course.category);
    }
  });

  // Convertir a array y ordenar
  const sortedCategories = Array.from(uniqueCategories).sort();

  // Mapeo de etiquetas bonitas para las categorías principales
  const categoryLabels = {
    'programacion': '💻 Programación',
    'historia': '📜 Historia',
    'ofimatica': '📝 Ofimática',
    'negocios': '💼 Negocios',
    'ciencias': '🔬 Ciencias',
    'humanidades': '📚 Humanidades'
  };

  // 4. Crear botones para cada categoría principal
  sortedCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-pill';
    btn.dataset.category = cat; // Guardamos la categoría principal (ej: 'historia')
    
    // Texto con emoji si existe, sino capitalizado
    const label = categoryLabels[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
    btn.textContent = label;
    
    container.appendChild(btn);
  });

  // 5. Asignar eventos de clic
  container.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      // UI: Actualizar clase active
      container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      
      // Estado: Guardar la categoría seleccionada
      courseState.activeCategory = pill.dataset.category;
      
      // Acción: Aplicar filtros
      applyFilters({
        grid: document.getElementById('courses-grid'),
        countDisplay: document.getElementById('courses-count'),
        noResults: document.getElementById('no-results')
      });
    });
  });

  // 6. Verificar URL (Si llegas con ?category=historia)
  const urlParams = new URLSearchParams(window.location.search);
  const urlCat = urlParams.get('category'); 
  if (urlCat) {
    const activePill = container.querySelector(`[data-category="${urlCat}"]`);
    if (activePill) {
      activePill.click();
    }
  }
}

// ============================================
// 3. RENDERIZAR CURSOS (Sin cambios mayores, solo asegurando dataset)
// ============================================
function renderCourses(courses) {
    const grid = document.getElementById('courses-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Mapeo de gradientes por subcategoría
    const subGradients = {
        web: 'linear-gradient(135deg, #e44d26, #f16529)',
        backend: 'linear-gradient(135deg, #3776ab, #ffd43b)',
        datos: 'linear-gradient(135deg, #150458, #ff6600)',
        movil: 'linear-gradient(135deg, #fa7343, #f5a623)',
        devops: 'linear-gradient(135deg, #f05032, #de4c36)',
        cloudflare: 'linear-gradient(135deg, #f48120, #fbad41)'
    };

    courses.forEach((course, index) => {
        const card = document.createElement('div');
        card.className = 'course-card';

        // IMPORTANTE: Guardamos la SUBCATEGORÍA en dataset.category para filtrar fácilmente
        card.dataset.category = course.category;
        card.dataset.level = course.level;
        card.dataset.courseId = course.id;
        const sub = course.category ? course.category.toLowerCase() : 'general';
        card.dataset.category = sub;

        const grad = subGradients[course.subcategory] || 'var(--accent-gradient)';
        card.style.setProperty('--card-accent', grad);
        card.style.animationDelay = `${index * 0.05}s`;

        card.innerHTML = `
      <span class="course-level ${course.level}">${capitalizeFirst(course.level)}</span>
      <div class="course-icon">${course.icon || '📚'}</div>
      <h3 class="course-title">${escapeHtml(course.title)}</h3>
      <p class="course-description">${escapeHtml(course.description)}</p>
      <div class="course-meta">
        <span class="course-meta-item"><span>📚</span> ${course.lessons} lecciones</span>
        <span class="course-meta-item"><span>⏱️</span> ${escapeHtml(course.duration)}</span>
      </div>
      <button class="course-start-btn" data-course="${course.id}">Comenzar</button>
    `;

        grid.appendChild(card);
    });
}

// ============================================
// 1. OBTENER ÚNICAS SUBCATEGORÍAS DISPONIBLES
// ============================================
function getUniqueSubcategories(courses) {
    const subs = new Set();
    courses.forEach(course => {
        if (course.subcategory) {
            subs.add(course.subcategory);
        }
    });
    return Array.from(subs).sort();
}

// ============================================
// 4. APLICAR FILTROS (Versión Blindada)
// ============================================
function applyFilters(elements) {
    if (!elements || !elements.grid) return;

    const cards = elements.grid.querySelectorAll('.course-card');
    let visibleCount = 0;

    // Obtener el filtro seleccionado (asegurando que sea string)
    const selectedSub = String(courseState.activeCategory || 'todos');
    const searchQuery = String(courseState.searchQuery || '').toLowerCase();

    cards.forEach(card => {
        // 1. Obtener subcategoría del curso (debe coincidir con lo que guardaste en renderCourses)
        const courseSub = String(card.dataset.category || '');

        // 2. Lógica de Filtrado por Categoría
        // Si es 'todos' O si coinciden exactamente las cadenas
        const matchesSub = (selectedSub === 'todos') || (courseSub === selectedSub);

        // 3. Lógica de Búsqueda por Texto
        const title = (card.querySelector('.course-title')?.textContent || '').toLowerCase();
        const description = (card.querySelector('.course-description')?.textContent || '').toLowerCase();
        const matchesSearch = !searchQuery || title.includes(searchQuery) || description.includes(searchQuery);

        // 4. Aplicar visibilidad
        if (matchesSub && matchesSearch) {
            card.style.display = ''; // Mostrar
            card.style.visibility = 'visible';
            visibleCount++;
        } else {
            card.style.display = 'none'; // Ocultar
            card.style.visibility = 'hidden';
        }
    });

    // Actualizar contador
    if (elements.countDisplay) {
        elements.countDisplay.textContent = `Mostrando ${visibleCount} curso${visibleCount !== 1 ? 's' : ''}`;
    }

    // Mostrar mensaje de "Sin resultados" si es necesario
    if (elements.noResults) {
        elements.noResults.style.display = visibleCount === 0 ? 'block' : 'none';
    }
}

function updateCourseCount(count) {
    const el = document.getElementById('courses-count');
    if (el) el.textContent = `Mostrando ${count} curso${count !== 1 ? 's' : ''}`;
}

// ============================================
// PÁGINA: course_details.html (Detalles)
// ============================================

function initCourseDetailsPage() {
    console.log('📖 Inicializando página de detalles...');
    const els = {
        loading: document.getElementById('loading-state'),
        content: document.getElementById('course-content'),
        error: document.getElementById('error-state'),
        msg: document.getElementById('error-message'),
        icon: document.getElementById('detail-icon'),
        title: document.getElementById('detail-title'),
        desc: document.getElementById('detail-description'),
        level: document.getElementById('detail-level'),
        lessonsCount: document.getElementById('detail-lessons-count'),
        duration: document.getElementById('detail-duration'),
        lessonsLabel: document.getElementById('lessons-count-label'),
        grid: document.getElementById('lessons-grid')
    };

    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id') || urlParams.get('course');

    if (!courseId) {
        showError(els, 'No se especificó un curso. <a href="courses.html">Volver</a>');
        return;
    }

    fetch(`/api/course-details?id=${encodeURIComponent(courseId)}`)
        .then(res => {
            if (!res.ok) throw new Error('Curso no encontrado');
            return res.json();
        })
        .then(data => {
            if (els.loading) els.loading.style.display = 'none';
            if (els.content) els.content.style.display = 'block';

            if (els.icon) els.icon.textContent = data.icon || '📚';
            if (els.title) els.title.textContent = data.title;
            if (els.desc) els.desc.textContent = data.description;
            if (els.duration) els.duration.textContent = data.duration;
            if (els.lessonsCount) els.lessonsCount.textContent = data.lessons || (data.lessons_list?.length || 0);
            if (els.level) {
                els.level.textContent = capitalizeFirst(data.level);
                els.level.className = `course-detail-level ${data.level}`;
            }

            document.title = `${data.title} - Mirai AI`;

            const lessons = data.lessons_list || [];
            if (els.lessonsLabel) els.lessonsLabel.textContent = `(${lessons.length})`;

            if (els.grid) {
                els.grid.innerHTML = '';
                if (lessons.length === 0) {
                    els.grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:60px;">📭 Sin lecciones</div>`;
                } else {
                    lessons.forEach((lesson, idx) => {
                        const card = document.createElement('div');
                        card.className = 'lesson-card';
                        card.style.animationDelay = `${idx * 0.06}s`;
                        card.innerHTML = `
                            <div class="lesson-number">${idx + 1}</div>
                            <h3 class="lesson-title">${escapeHtml(lesson.title)}</h3>
                            <p class="lesson-description">${escapeHtml(lesson.content || '')}</p>
                            <button class="lesson-start-btn" data-course="${data.id}" data-lesson="${lesson.id}">Comenzar</button>
                        `;
                        els.grid.appendChild(card);
                    });

                    // Delegación de eventos para botones
                    els.grid.addEventListener('click', (e) => {
                        const btn = e.target.closest('.lesson-start-btn');
                        if (btn) {
                            e.stopPropagation();
                            const cid = btn.dataset.course;
                            const lid = btn.dataset.lesson;
                            if (cid && lid) {
                                btn.textContent = 'Redirigiendo...';
                                setTimeout(() => {
                                    window.location.href = `index.html?course=${cid}&lesson=${lid}&mode=education`;
                                }, 300);
                            }
                        }
                    });
                }
            }
        })
        .catch(err => showError(els, err.message));
}

function showError(els, msg) {
    if (els.loading) els.loading.style.display = 'none';
    if (els.error) els.error.style.display = 'block';
    if (els.msg) els.msg.innerHTML = msg;
}

// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 courses.js iniciado');

    initializeTheme();
    setupThemeToggle();
    setupMobileMenu();

    if (currentPage === 'categories') {
        initCategoriesPage();
    } else if (currentPage === 'courses') {
        initCoursesPage();
    } else if (currentPage === 'details') {
        initCourseDetailsPage();
    }
});

// Funciones globales para compatibilidad
window.startLesson = (courseId, lessonId) => {
    window.location.href = `index.html?course=${courseId}&lesson=${lessonId}&mode=education`;
};
window.selectCourse = (courseId) => {
    window.location.href = `course_details.html?id=${courseId}`;
};

document.getElementById('logout-btn').addEventListener('click', () => {
    if(confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        // 1. Limpiar datos de autenticación
        localStorage.removeItem('mirai_auth_token');
        localStorage.removeItem('mirai_user_dni');
        
        // 2. Limpiar contexto de conversación actual
        localStorage.removeItem('mirai-ai-conversation-id');
        localStorage.removeItem('mirai-ai-course-id');
        localStorage.removeItem('mirai-ai-lesson-id');
        
        // 3. Redirigir a la página de login
        window.location.href = 'login.html';
    }
});