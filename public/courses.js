/**
 * ============================================
 * MIRAI EDUCATION - courses.js
 * Versión Dinámica: Carga Categorías y Cursos desde D1
 * Maneja: courses, course_details, course_category
 * ============================================
 */

(function () {
    'use strict';

    // ============================================
    // ESTADO GLOBAL
    // ============================================
    const courseState = {
        activeCategory: 'todos',
        searchQuery: '',
        courses: [],
        categories: [],
        subcategories: [],
        isLoading: false
    };

    // ============================================
    // DETECCIÓN DE PÁGINA
    // ============================================
    const currentPage = window.location.pathname.includes('course_category')
        ? 'categories'
        : window.location.pathname.includes('course_details')
            ? 'details'
            : 'courses';

    console.log(`📄 Página detectada: ${currentPage}`);

    // ============================================
    // UTILIDADES (Se mantienen, no duplican app.js)
    // ============================================

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
    // TEMA - Usa MiraiApp si está disponible
    // ============================================

    function initTheme() {
        if (typeof MiraiApp !== 'undefined') {
            // MiraiApp ya maneja el tema, solo sincronizamos el toggle si existe
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle && !themeToggle.dataset.initialized) {
                themeToggle.addEventListener('click', () => {
                    const current = MiraiApp.getTheme();
                    const newTheme = current === 'light' ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', newTheme);
                    localStorage.setItem('mirai-ai-theme', newTheme);
                    
                    // Actualizar iconos
                    const sun = document.querySelector('.sun-icon');
                    const moon = document.querySelector('.moon-icon');
                    if (sun && moon) {
                        if (newTheme === 'dark') {
                            sun.classList.add('hidden');
                            moon.classList.remove('hidden');
                        } else {
                            sun.classList.remove('hidden');
                            moon.classList.add('hidden');
                        }
                    }
                    themeToggle.dataset.initialized = 'true';
                });
            }
        } else {
            // Fallback si MiraiApp no carga
            const savedTheme = localStorage.getItem('mirai-ai-theme') || 
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            document.documentElement.setAttribute('data-theme', savedTheme);
            
            const sun = document.querySelector('.sun-icon');
            const moon = document.querySelector('.moon-icon');
            if (sun && moon) {
                if (savedTheme === 'dark') {
                    sun.classList.add('hidden');
                    moon.classList.remove('hidden');
                } else {
                    sun.classList.remove('hidden');
                    moon.classList.add('hidden');
                }
            }
        }
    }

    // ============================================
    // MENÚ MÓVIL - Usa MiraiApp si está disponible
    // ============================================

    function initMobileMenu() {
        if (typeof MiraiApp !== 'undefined') {
            // MiraiApp ya maneja el menú móvil, no hacemos nada
            console.log('✅ Menú móvil manejado por MiraiApp');
        } else {
            // Fallback si MiraiApp no carga
            console.warn('⚠️ MiraiApp no disponible, inicializando menú local');
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
        }
    }

    // ============================================
    // API: Cargar Categorías desde D1
    // ============================================

    async function loadCategoriesFromAPI() {
        try {
            const response = await fetch('/api/categories-with-count');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            courseState.categories = data;
            console.log(`✅ ${data.length} categorías cargadas desde D1`);
            return data;
        } catch (error) {
            console.error('❌ Error cargando categorías:', error);
            return [];
        }
    }

    // ============================================
    // API: Cargar Cursos desde D1
    // ============================================

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
    // API: Cargar Subcategorías desde D1
    // ============================================

    async function loadSubcategoriesFromAPI(category = null) {
        try {
            const url = category
                ? `/api/subcategories?category=${encodeURIComponent(category)}`
                : '/api/subcategories';

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            courseState.subcategories = data;
            console.log(`✅ ${data.length} subcategorías cargadas${category ? ` para ${category}` : ''}`);
            return data;
        } catch (error) {
            console.error('❌ Error cargando subcategorías:', error);
            return [];
        }
    }

    // ============================================
    // PÁGINA: course_category (Categorías)
    // ============================================

    async function initCategoriesPage() {
        console.log('🗂️ Inicializando página de categorías...');

        const grid = document.getElementById('categories-grid');
        if (!grid) return;

        try {
            // 1. Cargar categorías desde D1
            const categories = await loadCategoriesFromAPI();

            // 2. Cargar cursos para contar (sin renderizar)
            const courses = await loadCoursesFromAPI();

            // 3. Renderizar con conteo real
            renderCategories(categories, courses);

            // 4. Configurar búsqueda
            const searchInput = document.getElementById('category-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase().trim();
                    const filtered = categories.filter(cat =>
                        cat.title.toLowerCase().includes(query) ||
                        cat.description.toLowerCase().includes(query)
                    );
                    renderCategories(filtered, courses);
                });
            }
        } catch (error) {
            console.error('Error en initCategoriesPage:', error);
            grid.innerHTML = `
                <div class="no-categories" style="grid-column: 1/-1; text-align: center;">
                    <span class="no-categories-icon">⚠️</span>
                    <p>Error cargando categorías. Verifica la conexión con D1.</p>
                </div>`;
        }
    }

    function renderCategories(categories, courses = []) {
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
            const color = category.color || 'linear-gradient(135deg, #667eea, #764ba2)';
            card.style.setProperty('--card-accent', color);
            card.dataset.id = category.id;

            // Usar el conteo que viene de la DB
            const courseCount = category.course_count || 0;

            card.innerHTML = `
                <div class="category-icon">${category.icon || '📚'}</div>
                <h3 class="category-title">${escapeHtml(category.title)}</h3>
                <p class="category-desc">${escapeHtml(category.description)}</p>
                <div class="category-stats">
                    <span class="category-stat-item">
                        <span>📚</span> ${courseCount} curso${courseCount !== 1 ? 's' : ''}
                    </span>
                    <span class="category-stat-item">
                        <span>👥</span> -- alumnos
                    </span>
                </div>
            `;

            card.addEventListener('click', () => {
                window.location.href = `courses?category=${category.id}`;
            });

            grid.appendChild(card);
        });
    }

    // ============================================
    // PÁGINA: courses (Lista de Cursos)
    // ============================================

    async function initCoursesPage() {
        console.log('📚 Inicializando página de cursos...');

        const elements = {
            grid: document.getElementById('courses-grid'),
            search: document.getElementById('course-search'),
            filterPills: document.getElementById('filter-pills'),
            countDisplay: document.getElementById('courses-count'),
            noResults: document.getElementById('no-results')
        };

        if (!elements.grid) return;

        // Detectar categoría principal desde la URL
        const urlParams = new URLSearchParams(window.location.search);
        const mainCategory = urlParams.get('category') || null;

        try {
            // Cargar todo en paralelo
            const [courses, subcategories, categories] = await Promise.all([
                loadCoursesFromAPI(),
                loadSubcategoriesFromAPI(),
                loadCategoriesFromAPI()
            ]);

            // 1. Actualizar título del hero dinámicamente
            updateHeroTitle(mainCategory, categories);

            // 2. Filtrar cursos por categoría principal si aplica
            const filteredCourses = mainCategory
                ? courses.filter(c => c.category === mainCategory)
                : courses;

            // 3. Renderizar pills con subcategorías de la DB
            renderFilterPills(subcategories);

            // 4. Renderizar cursos
            renderCourses(filteredCourses);
            updateCourseCount(filteredCourses.length);

            // 5. Guardar filtro principal en estado
            courseState.mainCategoryFilter = mainCategory;

            console.log(`📂 Categoría: ${mainCategory || 'Todas'} | Cursos: ${filteredCourses.length} | Subcategorías: ${subcategories.length}`);

            // 6. Configurar búsqueda
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

            // 7. Click en "Comenzar"
            elements.grid.addEventListener('click', (e) => {
                const btn = e.target.closest('.course-start-btn');
                if (btn) {
                    e.stopPropagation();
                    const courseId = btn.dataset.course;
                    if (courseId) {
                        btn.textContent = 'Redirigiendo...';
                        btn.disabled = true;
                        setTimeout(() => {
                            window.location.href = `chat?course=${courseId}&mode=education`;
                        }, 300);
                    }
                }
            });

        } catch (error) {
            console.error('Error en initCoursesPage:', error);
            elements.grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; text-align: center;">
                    <span style="font-size: 3rem;">⚠️</span>
                    <h3>Error cargando cursos</h3>
                    <p>Verifica la conexión con la base de datos.</p>
                </div>`;
        }
    }

    function renderFilterPills(subcategories) {
        const container = document.getElementById('filter-pills');
        if (!container) return;

        container.innerHTML = '';

        // 1. Botón "Todos"
        const todosBtn = document.createElement('button');
        todosBtn.className = 'filter-pill active';
        todosBtn.dataset.category = 'todos';
        todosBtn.textContent = 'Todos';
        container.appendChild(todosBtn);

        // 2. Crear pills dinámicamente desde la DB
        subcategories.forEach(sub => {
            const btn = document.createElement('button');
            btn.className = 'filter-pill';
            btn.dataset.category = sub.id;

            const icon = sub.icon || '📚';
            btn.textContent = `${icon} ${sub.title}`;

            container.appendChild(btn);
        });

        // 3. Asignar eventos
        container.querySelectorAll('.filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');

                courseState.activeCategory = pill.dataset.category;

                applyFilters({
                    grid: document.getElementById('courses-grid'),
                    countDisplay: document.getElementById('courses-count'),
                    noResults: document.getElementById('no-results')
                });
            });
        });
    }

    function renderCourses(courses) {
        const grid = document.getElementById('courses-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const subGradients = {
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
            matematicas: 'linear-gradient(135deg, #4facfe, #00f2fe)'
        };

        courses.forEach((course, index) => {
            const card = document.createElement('div');
            card.className = 'course-card';

            card.dataset.category = course.subcategory || 'general';
            card.dataset.mainCategory = course.category || 'general';
            card.dataset.level = course.level;
            card.dataset.courseId = course.id;

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

    function applyFilters(elements) {
        if (!elements || !elements.grid) return;

        const cards = elements.grid.querySelectorAll('.course-card');
        let visibleCount = 0;

        const selectedSub = String(courseState.activeCategory || 'todos');
        const searchQuery = String(courseState.searchQuery || '').toLowerCase();

        cards.forEach(card => {
            const courseSub = String(card.dataset.category || '');
            const courseMain = String(card.dataset.mainCategory || '');

            const matchesSub = (selectedSub === 'todos') || (courseSub === selectedSub);

            const title = (card.querySelector('.course-title')?.textContent || '').toLowerCase();
            const description = (card.querySelector('.course-description')?.textContent || '').toLowerCase();
            const matchesSearch = !searchQuery || title.includes(searchQuery) || description.includes(searchQuery);

            if (matchesSub && matchesSearch) {
                card.style.display = '';
                card.style.visibility = 'visible';
                visibleCount++;
            } else {
                card.style.display = 'none';
                card.style.visibility = 'hidden';
            }
        });

        if (elements.countDisplay) {
            elements.countDisplay.textContent = `Mostrando ${visibleCount} curso${visibleCount !== 1 ? 's' : ''}`;
        }

        if (elements.noResults) {
            elements.noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        }
    }

    function updateCourseCount(count) {
        const el = document.getElementById('courses-count');
        if (el) el.textContent = `Mostrando ${count} curso${count !== 1 ? 's' : ''}`;
    }

    // ============================================
    // PÁGINA: course_details (Detalles)
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
            showError(els, 'No se especificó un curso. <a href="courses">Volver</a>');
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

                        els.grid.addEventListener('click', (e) => {
                            const btn = e.target.closest('.lesson-start-btn');
                            if (btn) {
                                e.stopPropagation();
                                const cid = btn.dataset.course;
                                const lid = btn.dataset.lesson;
                                if (cid && lid) {
                                    btn.textContent = 'Redirigiendo...';
                                    setTimeout(() => {
                                        window.location.href = `chat?course=${cid}&lesson=${lid}&mode=education`;
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
    // ACTUALIZAR TÍTULO HERO DINÁMICAMENTE
    // ============================================

    function updateHeroTitle(mainCategory, categories) {
        const heroTitle = document.querySelector('.courses-hero h1');
        const heroDescription = document.querySelector('.courses-hero p');
        const headerTitle = document.querySelector('.header-title');
        const pageTitle = document.querySelector('title');

        if (mainCategory) {
            const categoryData = categories.find(c => c.id === mainCategory);

            if (categoryData) {
                const title = `Cursos de ${categoryData.title}`;
                const icon = categoryData.icon || '📚';

                if (heroTitle) heroTitle.textContent = `${icon} ${title}`;
                if (headerTitle) headerTitle.textContent = title;
                if (pageTitle) pageTitle.textContent = `${title} - Mirai AI`;

                const descriptions = {
                    programacion: 'Aprende a programar con Mirai AI como tu tutor personal. Clases interactivas, ejercicios prácticos y feedback en tiempo real.',
                    ofimatica: 'Domina las herramientas de oficina más utilizadas. Excel, Word, PowerPoint y Google Workspace desde cero hasta avanzado.',
                    negocios: 'Desarrolla habilidades empresariales. Marketing digital, emprendimiento, gestión de proyectos y administración.',
                    historia: 'Explora los eventos que marcaron el mundo. Civilizaciones antiguas, guerras mundiales y personajes históricos.',
                    humanidades: 'Sumérgete en el pensamiento humano. Literatura, filosofía, arte y cultura a través de los siglos.',
                    ciencias: 'Comprende el mundo natural. Biología, química, física y matemáticas con explicaciones claras y prácticas.'
                };

                if (heroDescription) {
                    heroDescription.textContent = descriptions[mainCategory] || categoryData.description || 'Explora nuestros cursos disponibles.';
                }

                console.log(`✅ Título actualizado: ${title}`);
            } else {
                const fallbackTitle = `Cursos de ${capitalizeFirst(mainCategory)}`;
                if (heroTitle) heroTitle.textContent = fallbackTitle;
                if (headerTitle) headerTitle.textContent = fallbackTitle;
            }
        } else {
            if (heroTitle) heroTitle.textContent = 'Todos los Cursos';
            if (headerTitle) headerTitle.textContent = 'Cursos';
            if (pageTitle) pageTitle.textContent = 'Cursos - Mirai AI';
            if (heroDescription) heroDescription.textContent = 'Explora nuestro catálogo completo de cursos. Aprende a tu ritmo con Mirai AI como tu tutor personal.';
        }
    }

    // ============================================
    // LOGOUT
    // ============================================

    function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                try {
                    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
                } catch (e) {}
                localStorage.removeItem('mirai_user_dni');
                localStorage.removeItem('mirai_user_name');
                localStorage.getItem('mirai_user_role');
                localStorage.removeItem('mirai-ai-conversation-id');
                localStorage.removeItem('mirai-ai-course-id');
                localStorage.removeItem('mirai-ai-lesson-id');
                window.location.href = 'login';
            }
        });
    }
}

    // ============================================
    // INICIALIZACIÓN PRINCIPAL
    // ============================================

    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 courses.js iniciado');
 
        // Tema y Sidebar → manejados por mirai-boot.js + app.js. No tocar aquí.
 
        // 1. Configurar Logout
        setupLogout();
 
        // 2. Cargar página específica
        if (currentPage === 'categories') {
            initCategoriesPage();
        } else if (currentPage === 'courses') {
            initCoursesPage();
        } else if (currentPage === 'details') {
            initCourseDetailsPage();
        }
    });

    // ============================================
    // FUNCIONES GLOBALES PARA COMPATIBILIDAD
    // ============================================

    window.startLesson = (courseId, lessonId) => {
        window.location.href = `chat?course=${courseId}&lesson=${lessonId}&mode=education`;
    };

    window.selectCourse = (courseId) => {
        window.location.href = `course_details?id=${courseId}`;
    };

})();