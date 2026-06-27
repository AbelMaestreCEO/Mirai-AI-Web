(function () {
    var PLANS = [
        {
            id: 'basic',
            icon: '🌱',
            name: 'Basic',
            price: '?$',
            period: '/mes',
            desc: 'Ideal para explorar las capacidades de Mirai AI con uso moderado.',
            features: [
                '10 imágenes por día',
                '2 pistas de música por día',
                '1 video por día',
                'Chat con IA ilimitado',
                'Acceso a DeepSeek V4-Flash'
            ]
        },
        {
            id: 'students',
            icon: '🎓',
            name: 'Students',
            price: '?$',
            period: '/mes',
            desc: 'Pensado para estudiantes que necesitan generar contenido académico y creativo.',
            features: [
                '25 imágenes por día',
                '5 pistas de música por día',
                '3 videos por día',
                'Chat con IA ilimitado',
                'Acceso a DeepSeek V4-Flash',
                'Edición de imágenes con IA'
            ]
        },
        {
            id: 'development',
            icon: '💻',
            name: 'Development',
            price: '?$',
            period: '/mes',
            desc: 'Para desarrolladores y profesionales que integran IA en su flujo de trabajo.',
            features: [
                '50 imágenes por día',
                '12 pistas de música por día',
                '8 videos por día',
                'Chat con IA ilimitado',
                'Acceso a DeepSeek V4-Flash y V4-Pro',
                'Edición y upscale de imágenes',
                'Video Replace y Animate'
            ]
        },
        {
            id: 'designer',
            icon: '🎨',
            name: 'Designer',
            price: '?$',
            period: '/mes',
            desc: 'Orientado a diseñadores y creativos con alta demanda de generación visual.',
            features: [
                '120 imágenes por día',
                '25 pistas de música por día',
                '15 videos por día',
                'Chat con IA ilimitado',
                'Acceso a todos los modelos de IA',
                'LoRA personalizado',
                'Try-On virtual',
                'Video Avatar'
            ]
        },
        {
            id: 'max',
            icon: '👑',
            name: 'Max',
            price: '?$',
            period: '/mes',
            desc: 'Sin límites. Generación ilimitada de imágenes, videos, música y texto.',
            features: [
                'Imágenes ilimitadas',
                'Música ilimitada',
                'Videos ilimitados',
                'Chat con IA ilimitado',
                'Acceso a todos los modelos de IA',
                'LoRA y entrenamiento personalizado',
                'Try-On virtual ilimitado',
                'Video Avatar ilimitado',
                'Soporte prioritario'
            ]
        }
    ];

    var userPlan = 'basic';

    function renderPlans() {
        var grid = document.getElementById('plans-grid');
        if (!grid) return;
        grid.innerHTML = PLANS.map(function (p) {
            var isCurrent = p.id === userPlan;
            return '<div class="plan-card' + (isCurrent ? ' current' : '') + '" data-plan="' + p.id + '">' +
                '<div class="plan-icon">' + p.icon + '</div>' +
                '<div class="plan-name">' + p.name + '</div>' +
                '<div class="plan-price">' + p.price + ' <span>' + p.period + '</span></div>' +
                '<p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 .5rem;">' + p.desc + '</p>' +
                '<ul class="plan-features">' +
                p.features.map(function (f) {
                    return '<li><span class="plan-check">✓</span> ' + f + '</li>';
                }).join('') +
                '</ul>' +
                '<button class="plan-btn">' + (isCurrent ? 'Plan actual' : 'Próximamente') + '</button>' +
                '</div>';
        }).join('');
    }

    function updateBanner() {
        var banner = document.getElementById('current-plan-banner');
        if (!banner) return;
        var planName = userPlan.charAt(0).toUpperCase() + userPlan.slice(1);
        banner.innerHTML = 'Tu plan actual es <strong>' + planName + '</strong>';
    }

    function loadUserPlan() {
        fetch('/api/user/tokens', { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.plan) userPlan = data.plan;
                renderPlans();
                updateBanner();
            })
            .catch(function () {
                renderPlans();
                updateBanner();
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUserPlan);
    } else {
        loadUserPlan();
    }
})();
