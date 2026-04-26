/* ============================================
   COURSES PAGE - Carga desde D1 + Filtros
   ============================================ */

// --- ESTADO ---
const courseState = {
    activeCategory: 'todos',
    searchQuery: '',
    courses: []
};

// --- ELEMENTOS DEL DOM ---
const courseElements = {
    grid: document.getElementById('courses-grid'),
    search: document.getElementById('course-search'),
    filterPills: document.getElementById('filter-pills'),
    countDisplay: document.getElementById('courses-count'),
    noResults: document.getElementById('no-results'),
    themeToggle: document.getElementById('theme-toggle'),
    sunIcon: document.querySelector('.sun-icon'),
    moonIcon: document.querySelector('.moon-icon')
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    loadCoursesFromAPI();
    setupCourseFilters();
    setupCourseSearch();
    setupMobileMenu();
    setupCourseButtons();
    updateCourseCount();
});

// --- CARGAR CURSOS DESDE D1 (VIA WORKER) ---
async function loadCoursesFromAPI() {
    try {
        const response = await fetch('/api/courses');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const courses = await response.json();
        courseState.courses = courses;

        if (courses.length === 0) {
            console.warn('⚠️ No hay cursos en D1');
            showEmptyState();
            return;
        }

        renderCourses(courses);
        updateCourseCount(courses.length);

    } catch (error) {
        console.error('❌ Error cargando cursos:', error);
        showErrorState(error.message);
    }
}

// --- LÓGICA DE CARGA ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obtener ID del curso de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course');

    if (!courseId) {
        showError('No se especificó un curso. <a href="courses.html">Volver a Cursos</a>');
        return;
    }

    // 2. Cargar datos del curso y lecciones desde D1 (via Worker)
    try {
        const response = await fetch(`/api/course-details?id=${encodeURIComponent(courseId)}`);

        if (!response.ok) {
            throw new Error('Curso no encontrado');
        }

        const data = await response.json();
        renderCourse(data);

    } catch (error) {
        console.error('Error:', error);
        showError(`Error cargando el curso: ${error.message}`);
    }
});

function renderCourse(data) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('course-content').style.display = 'block';

    // Renderizar Header
    document.getElementById('detail-icon').textContent = data.icon || '📚';
    document.getElementById('detail-title').textContent = data.title;
    document.getElementById('detail-desc').textContent = data.description;
    document.getElementById('detail-level').textContent = `Nivel: ${data.level}`;
    document.getElementById('detail-lessons').textContent = `${data.lessons} lecciones`;
    document.getElementById('detail-duration').textContent = data.duration;

    // Renderizar Lecciones
    const container = document.getElementById('lessons-container');
    container.innerHTML = '';

    if (!data.lessons_list || data.lessons_list.length === 0) {
        container.innerHTML = '<div class="loading-state">No hay lecciones disponibles aún.</div>';
        return;
    }

    data.lessons_list.forEach((lesson, index) => {
        const card = document.createElement('div');
        card.className = 'lesson-card';
        card.onclick = () => startLesson(lesson.id, data.id);

        card.innerHTML = `
                    <div class="lesson-number">${index + 1}</div>
                    <div class="lesson-info">
                        <div class="lesson-title">${escapeHtml(lesson.title)}</div>
                        <div class="lesson-desc">${escapeHtml(lesson.content || 'Sin descripción')}</div>
                    </div>
                    <button class="lesson-action">Comenzar</button>
                `;
        container.appendChild(card);
    });
}

function startLesson(lessonId, courseId) {
    // Redirigir al chat con contexto específico
    // index.html?course=html5&lesson=html5-01
    window.location.href = `index.html?course=${courseId}&lesson=${lessonId}`;
}

function showError(msg) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error-msg').style.display = 'block';
    document.getElementById('error-msg').innerHTML = msg;
}

// --- RENDERIZAR CURSOS ---
function renderCourses(courses) {
    const grid = courseElements.grid;
    grid.innerHTML = '';

    courses.forEach((course, index) => {
        const card = createCourseCard(course, index);
        grid.appendChild(card);
    });
}

function createCourseCard(course, index) {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.dataset.category = course.category;
    card.dataset.level = course.level;
    card.dataset.courseId = course.id;

    // Gradiente por categoría
    const gradients = {
        web: 'linear-gradient(135deg, #e44d26, #f16529)',
        backend: 'linear-gradient(135deg, #3776ab, #ffd43b)',
        datos: 'linear-gradient(135deg, #150458, #ff6600)',
        movil: 'linear-gradient(135deg, #fa7343, #f5a623)',
        devops: 'linear-gradient(135deg, #f05032, #de4c36)',
        cloudflare: 'linear-gradient(135deg, #f48120, #fbad41)'
    };

    card.style.setProperty('--card-accent', gradients[course.category] || 'var(--accent-gradient)');

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

    // Animación escalonada
    card.style.animationDelay = `${index * 0.05}s`;

    return card;
}

// --- UTILIDADES ---
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showEmptyState() {
    courseElements.grid.innerHTML = `
    <div class="no-results" style="display: block; grid-column: 1 / -1;">
      <div class="no-results-icon">📚</div>
      <p>No hay cursos disponibles todavía.</p>
      <small>Verifica que los datos estén en D1</small>
    </div>
  `;
}

function showErrorState(message) {
    courseElements.grid.innerHTML = `
    <div class="no-results" style="display: block; grid-column: 1 / -1;">
      <div class="no-results-icon">⚠️</div>
      <p>Error cargando cursos</p>
      <small>${escapeHtml(message)}</small>
    </div>
  `;
}

function updateCourseCount(count) {
    courseElements.countDisplay.textContent = `Mostrando ${count} curso${count !== 1 ? 's' : ''}`;
}

// --- FILTRADO ---
function setupCourseFilters() {
    if (!courseElements.filterPills) return;

    const pills = courseElements.filterPills.querySelectorAll('.filter-pill');

    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            courseState.activeCategory = pill.dataset.category;
            applyFilters();
        });
    });
}

function setupCourseSearch() {
    if (!courseElements.search) return;

    let debounceTimer;
    courseElements.search.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            courseState.searchQuery = e.target.value.trim().toLowerCase();
            applyFilters();
        }, 200);
    });
}

function applyFilters() {
    const cards = courseElements.grid.querySelectorAll('.course-card');
    let visibleCount = 0;

    cards.forEach(card => {
        const category = card.dataset.category;
        const title = card.querySelector('.course-title')?.textContent.toLowerCase() || '';
        const description = card.querySelector('.course-description')?.textContent.toLowerCase() || '';

        const matchesCategory =
            courseState.activeCategory === 'todos' ||
            category === courseState.activeCategory;

        const matchesSearch =
            !courseState.searchQuery ||
            title.includes(courseState.searchQuery) ||
            description.includes(courseState.searchQuery) ||
            category.includes(courseState.searchQuery);

        if (matchesCategory && matchesSearch) {
            card.classList.remove('hidden-by-filter');
            card.style.display = '';
            visibleCount++;
        } else {
            card.classList.add('hidden-by-filter');
            card.style.display = 'none';
        }
    });

    courseElements.countDisplay.textContent =
        `Mostrando ${visibleCount} curso${visibleCount !== 1 ? 's' : ''}`;

    courseElements.noResults.style.display = visibleCount === 0 ? 'block' : 'none';
}

// --- BOTONES "COMENZAR" (Delegación de eventos) ---
function setupCourseButtons() {
    const grid = courseElements.grid;

    if (!grid) {
        console.error('❌ No se encontró #courses-grid');
        return;
    }

    // Un solo listener en el contenedor padre
    grid.addEventListener('click', (e) => {
        // ¿Se clickeó un botón de comenzar?
        const btn = e.target.closest('.course-start-btn');
        if (btn) {
            e.stopPropagation();
            const courseId = btn.dataset.course;
            console.log('🖱️ Click en curso:', courseId);

            if (courseId) {
                btn.textContent = 'Redirigiendo...';
                btn.disabled = true;
                setTimeout(() => {
                    window.location.href = `course_details.html?course=${courseId}`;
                }, 300);
            } else {
                console.error('❌ Botón sin data-course:', btn);
            }
            return;
        }

        // ¿Se clickeó la tarjeta completa?
        const card = e.target.closest('.course-card');
        if (card) {
            const btn = card.querySelector('.course-start-btn');
            if (btn) {
                btn.click();
            }
        }
    });

    console.log('✅ Delegación de eventos configurada');
}

function startCourse(courseId, btn) {
    // Redirigir a la página de detalles primero
    window.location.href = `course_details.html?course=${courseId}`;
}

// --- TEMA ---
function initializeTheme() {
    const savedTheme = localStorage.getItem('mirai-ai-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    if (theme === 'dark') {
        courseElements.sunIcon?.classList.add('hidden');
        courseElements.moonIcon?.classList.remove('hidden');
    } else {
        courseElements.sunIcon?.classList.remove('hidden');
        courseElements.moonIcon?.classList.add('hidden');
    }

    localStorage.setItem('mirai-ai-theme', theme);
}

if (courseElements.themeToggle) {
    courseElements.themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'light' ? 'dark' : 'light');
    });
}

// --- MENÚ ---
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
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            toggleMenu();
        }
    });
}

console.log('✅ courses.js cargado');
console.log('Botones encontrados:', document.querySelectorAll('.course-start-btn').length);

