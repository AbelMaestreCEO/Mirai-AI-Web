/* ============================================
   MIRAI EDUCATION - courses.js
   Maneja courses.html Y course_details.html
   ============================================ */

// --- DETECCIÓN DE PÁGINA ---
const currentPage = window.location.href.includes('course_details')
    ? 'details'
    : 'courses';

console.log(`📄 Página detectada: ${currentPage}`);

// --- ESTADO COMPARTIDO ---
const courseState = {
    activeCategory: 'todos',
    searchQuery: '',
    courses: []
};

// --- TEMA (COMPARTIDO) ---
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

// --- MENÚ MÓVIL (COMPARTIDO) ---
function setupMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const closeMenu = document.querySelector('.close-menu');
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.mobile-overlay');

    if (!menuToggle || !closeMenu || !sidebar || !overlay) {
        console.warn('⚠️ Elementos del menú móvil no encontrados');
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

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            toggleMenu();
        }
    });

    console.log('✅ Menú móvil configurado');
}

// --- UTILIDADES (COMPARTIDO) ---
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
// COURSES.HTML - Catálogo de Cursos
// ============================================

function initCoursesPage() {
    console.log('📚 Inicializando página de cursos...');

    const courseElements = {
        grid: document.getElementById('courses-grid'),
        search: document.getElementById('course-search'),
        filterPills: document.getElementById('filter-pills'),
        countDisplay: document.getElementById('courses-count'),
        noResults: document.getElementById('no-results')
    };

    // Verificar elementos críticos
    if (!courseElements.grid) {
        console.error('❌ No se encontró #courses-grid');
        return;
    }

    // --- CARGAR CURSOS DESDE D1 ---
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
                courseElements.grid.innerHTML = `
                    <div class="no-results" style="display: block; grid-column: 1 / -1;">
                        <div class="no-results-icon">📚</div>
                        <p>No hay cursos disponibles todavía.</p>
                        <small>Verifica que los datos estén en D1</small>
                    </div>`;
                return;
            }

            renderCourses(courses);
            updateCourseCount(courses.length);

        } catch (error) {
            console.error('❌ Error cargando cursos:', error);
            courseElements.grid.innerHTML = `
                <div class="no-results" style="display: block; grid-column: 1 / -1;">
                    <div class="no-results-icon">⚠️</div>
                    <p>Error cargando cursos</p>
                    <small>${escapeHtml(error.message)}</small>
                </div>`;
        }
    }

    // --- RENDERIZAR CURSOS ---
    function renderCourses(courses) {
        courseElements.grid.innerHTML = '';

        const gradients = {
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
            card.dataset.category = course.category;
            card.dataset.level = course.level;
            card.dataset.courseId = course.id;
            card.style.setProperty('--card-accent', gradients[course.category] || 'var(--accent-gradient)');
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

            courseElements.grid.appendChild(card);
        });
    }

    // --- CONTAR CURSOS ---
    function updateCourseCount(count) {
        if (courseElements.countDisplay) {
            courseElements.countDisplay.textContent = `Mostrando ${count} curso${count !== 1 ? 's' : ''}`;
        }
    }

    // --- FILTRADO POR CATEGORÍA ---
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

    // --- BÚSQUEDA ---
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

    // --- APLICAR FILTROS ---
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

        if (courseElements.countDisplay) {
            courseElements.countDisplay.textContent = `Mostrando ${visibleCount} curso${visibleCount !== 1 ? 's' : ''}`;
        }

        if (courseElements.noResults) {
            courseElements.noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        }
    }

    // --- BOTONES "COMENZAR" (Delegación) ---
    function setupCourseButtons() {
        courseElements.grid.addEventListener('click', (e) => {
            const btn = e.target.closest('.course-start-btn');
            if (btn) {
                e.stopPropagation();
                const courseId = btn.dataset.course;
                console.log('🖱️ Click en curso:', courseId);

                if (courseId) {
                    btn.textContent = 'Redirigiendo...';
                    btn.disabled = true;
                    setTimeout(() => {
                        window.location.href = `index.html?course=${courseId}&mode=education`;
                    }, 300);
                }
                return;
            }

            const card = e.target.closest('.course-card');
            if (card) {
                const btn = card.querySelector('.course-start-btn');
                if (btn) btn.click();
            }
        });

        console.log('✅ Botones de cursos configurados');
    }

    // --- EJECUTAR ---
    loadCoursesFromAPI();
    setupCourseFilters();
    setupCourseSearch();
    setupCourseButtons();
}


// ============================================
// COURSE_DETAILS.HTML - Detalle y Lecciones
// ============================================

function initCourseDetailsPage() {
    console.log('📖 Inicializando página de detalles...');

    const detailElements = {
        loadingState: document.getElementById('loading-state'),
        courseContent: document.getElementById('course-content'),
        errorState: document.getElementById('error-state'),
        errorMessage: document.getElementById('error-message'),
        icon: document.getElementById('detail-icon'),
        title: document.getElementById('detail-title'),
        description: document.getElementById('detail-description'),
        level: document.getElementById('detail-level'),
        lessonsCount: document.getElementById('detail-lessons-count'),
        duration: document.getElementById('detail-duration'),
        lessonsLabel: document.getElementById('lessons-count-label'),
        lessonsGrid: document.getElementById('lessons-grid')
    };

    // --- CARGAR DATOS DEL CURSO ---
    async function loadCourseDetails() {
        const urlParams = new URLSearchParams(window.location.search);
        const courseId = urlParams.get('id') || urlParams.get('course'); // ✅ CORREGIDO: leer 'id' primero

        console.log('🔍 Course ID detectado:', courseId);

        if (!courseId) {
            showError('No se especificó un curso. <a href="courses.html">Volver a Cursos</a>');
            return;
        }

        try {
            const response = await fetch(`/api/course-details?id=${encodeURIComponent(courseId)}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Curso no encontrado`);
            }

            const data = await response.json();
            renderCourse(data);

        } catch (error) {
            console.error('❌ Error cargando curso:', error);
            showError(error.message);
        }
    }

    // --- RENDERIZAR CURSO Y LECCIONES ---
    function renderCourse(data) {
        if (detailElements.loadingState) detailElements.loadingState.style.display = 'none';
        if (detailElements.courseContent) detailElements.courseContent.style.display = 'block';

        if (detailElements.icon) detailElements.icon.textContent = data.icon || '📚';
        if (detailElements.title) detailElements.title.textContent = data.title;
        if (detailElements.description) detailElements.description.textContent = data.description;
        if (detailElements.duration) detailElements.duration.textContent = data.duration;
        if (detailElements.lessonsCount) {
            detailElements.lessonsCount.textContent = data.lessons || (data.lessons_list ? data.lessons_list.length : 0);
        }

        if (detailElements.level) {
            detailElements.level.textContent = capitalizeFirst(data.level);
            detailElements.level.className = `course-detail-level ${data.level}`;
        }

        document.title = `${data.title} - Mirai AI`;

        const lessons = data.lessons_list || [];

        if (detailElements.lessonsLabel) {
            detailElements.lessonsLabel.textContent = `(${lessons.length})`;
        }

        if (!detailElements.lessonsGrid) return;

        if (lessons.length === 0) {
            detailElements.lessonsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-tertiary);">
                    <div style="font-size: 3rem; margin-bottom: 12px;">📭</div>
                    <p>No hay lecciones disponibles aún</p>
                </div>`;
            return;
        }

        detailElements.lessonsGrid.innerHTML = '';

        lessons.forEach((lesson, index) => {
            const card = document.createElement('div');
            card.className = 'lesson-card';
            card.dataset.lessonId = lesson.id;
            card.dataset.courseId = data.id;
            card.style.animationDelay = `${index * 0.06}s`;

            card.innerHTML = `
                <div class="lesson-number">${index + 1}</div>
                <h3 class="lesson-title">${escapeHtml(lesson.title)}</h3>
                <p class="lesson-description">${escapeHtml(lesson.content || 'Sin descripción disponible.')}</p>
                <button class="lesson-start-btn" data-course="${data.id}" data-lesson="${lesson.id}">Comenzar</button>
            `;

            detailElements.lessonsGrid.appendChild(card);
        });

        setupLessonButtons();
    }

    // --- BOTONES DE LECCIONES (Delegación) ---
    function setupLessonButtons() {
        if (!detailElements.lessonsGrid) return;

        detailElements.lessonsGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.lesson-start-btn');
            if (btn) {
                e.stopPropagation();
                const courseId = btn.dataset.course;
                const lessonId = btn.dataset.lesson;
                console.log('🖱️ Click en lección:', lessonId, 'del curso:', courseId);

                if (courseId && lessonId) {
                    btn.textContent = 'Redirigiendo...';
                    btn.disabled = true;
                    setTimeout(() => {
                        // ✅ CORREGIDO: Incluir mode=education
                        window.location.href = `index.html?course=${courseId}&lesson=${lessonId}&mode=education`;
                    }, 300);
                }
                return;
            }

            const card = e.target.closest('.lesson-card');
            if (card) {
                const btn = card.querySelector('.lesson-start-btn');
                if (btn) btn.click();
            }
        });

        console.log('✅ Botones de lecciones configurados');
    }

    // --- ERROR ---
    function showError(message) {
        if (detailElements.loadingState) detailElements.loadingState.style.display = 'none';
        if (detailElements.errorState) detailElements.errorState.style.display = 'block';
        if (detailElements.errorMessage) detailElements.errorMessage.textContent = message;
    }

    // --- EJECUTAR ---
    loadCourseDetails();
}

const urlParams = new URLSearchParams(window.location.search);
const courseId = urlParams.get('id');

// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 courses.js DOMContentLoaded');
    console.log('🚀 URL completa:', window.location.href);
    console.log('🚀 pathname:', window.location.pathname);
    console.log('🚀 Página detectada:', currentPage);

    initializeTheme();
    setupThemeToggle();
    setupMobileMenu();

    if (currentPage === 'courses') {
        console.log('📚 Iniciando página de cursos...');
        initCoursesPage();
    } else if (currentPage === 'details') {
        console.log('📖 Iniciando página de detalles...');
        initCourseDetailsPage();
    } else {
        console.error('❌ Página no reconocida:', currentPage);
    }
});

// En course_details.html, cuando se selecciona una lección
function startLesson(courseId, lessonId) {
  // ✅ INCLUIR TODOS LOS PARÁMETROS
  window.location.href = `index.html?course=${courseId}&lesson=${lessonId}&mode=education`;
}

// En courses.js o course.html
function selectCourse(courseId) {
    // ✅ INCLUIR el id del curso en la URL
    window.location.href = `course_details.html?id=${courseId}`;
}