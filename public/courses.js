/* ============================================
           COURSES PAGE - Lógica de Filtrado y Búsqueda
           ============================================ */

        // --- ESTADO ---
        const courseState = {
            activeCategory: 'todos',
            searchQuery: ''
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
            setupCourseFilters();
            setupCourseSearch();
            setupMobileMenu();
            setupCourseButtons();
        });

        // --- GESTIÓN DE TEMA (Sincronizado con index.html) ---
        function initializeTheme() {
            const savedTheme = localStorage.getItem('mirai-ai-theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const theme = savedTheme || (prefersDark ? 'dark' : 'light');
            applyTheme(theme);
        }

        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);

            if (theme === 'dark') {
                courseElements.sunIcon.classList.add('hidden');
                courseElements.moonIcon.classList.remove('hidden');
            } else {
                courseElements.sunIcon.classList.remove('hidden');
                courseElements.moonIcon.classList.add('hidden');
            }

            localStorage.setItem('mirai-ai-theme', theme);
        }

        if (courseElements.themeToggle) {
            courseElements.themeToggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme');
                applyTheme(current === 'light' ? 'dark' : 'light');
            });
        }

        // --- FILTRADO POR CATEGORÍA ---
        function setupCourseFilters() {
            if (!courseElements.filterPills) return;

            const pills = courseElements.filterPills.querySelectorAll('.filter-pill');

            pills.forEach(pill => {
                pill.addEventListener('click', () => {
                    // Actualizar pill activa
                    pills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');

                    courseState.activeCategory = pill.dataset.category;
                    applyFilters();
                });
            });
        }

        // --- BÚSQUEDA EN TIEMPO REAL ---
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

        // --- APLICAR FILTROS COMBINADOS ---
        function applyFilters() {
            const cards = courseElements.grid.querySelectorAll('.course-card');
            let visibleCount = 0;

            cards.forEach(card => {
                const category = card.dataset.category;
                const title = card.querySelector('.course-title').textContent.toLowerCase();
                const description = card.querySelector('.course-description').textContent.toLowerCase();

                // Filtro de categoría
                const matchesCategory = courseState.activeCategory === 'todos' || category === courseState.activeCategory;

                // Filtro de búsqueda
                const matchesSearch = !courseState.searchQuery ||
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

            // Actualizar contador
            courseElements.countDisplay.textContent = `Mostrando ${visibleCount} curso${visibleCount !== 1 ? 's' : ''}`;

            // Mostrar/ocultar "sin resultados"
            courseElements.noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        }

        // --- BOTONES "COMENZAR" ---
        function setupCourseButtons() {
            const buttons = courseElements.grid.querySelectorAll('.course-start-btn');

            buttons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const courseId = btn.dataset.course;
                    startCourse(courseId, btn);
                });
            });

            // Click en tarjeta completa también inicia el curso
            const cards = courseElements.grid.querySelectorAll('.course-card');
            cards.forEach(card => {
                card.addEventListener('click', () => {
                    const btn = card.querySelector('.course-start-btn');
                    if (btn) btn.click();
                });
            });
        }

        function startCourse(courseId, btn) {
            // Feedback visual
            const originalText = btn.textContent;
            btn.textContent = 'Redirigiendo...';
            btn.disabled = true;

            // Redirigir al chat con contexto del curso
            // Se abre index.html con un parámetro que indica qué curso iniciar
            setTimeout(() => {
                window.location.href = `index.html?course=${courseId}`;
            }, 400);
        }

        // --- MENÚ LATERAL MÓVIL ---
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

// Cargar cursos desde D1
async function loadCourses() {
  const response = await fetch('/api/courses');
  const courses = await response.json();
  renderCourses(courses);
}

function renderCourses(courses) {
  const grid = document.querySelector('.courses-grid');
  grid.innerHTML = courses.map(course => `
    <div class="course-card" data-course-id="${course.id}">
      <div class="course-icon">${course.icon || '📚'}</div>
      <h3>${course.title}</h3>
      <p>${course.description}</p>
      <div class="course-meta">
        <span>📚 ${course.lessons} lecciones</span>
        <span>⏱️ ${course.duration}</span>
      </div>
      <button class="course-start-btn">Comenzar</button>
    </div>
  `).join('');
}

// En courses.js
function syncTheme() {
  const savedTheme = localStorage.getItem('mirai-ai-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

document.addEventListener('DOMContentLoaded', syncTheme);
document.addEventListener('DOMContentLoaded', loadCourses);