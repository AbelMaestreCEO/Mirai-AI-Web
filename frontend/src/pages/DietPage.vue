<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Dieta & Nutrición</div>
  </header>

  <div class="courses-container">
    <!-- Hero -->
    <div class="courses-hero">
      <h1>🥗 Dieta & Nutrición</h1>
      <p>Planifica tu alimentación, descubre recetas con IA y alcanza tus metas nutricionales.</p>
    </div>

    <!-- ══ PANEL 1 – RECETAS ══ -->
    <div id="panel-recetas" class="diet-panel" :class="{ active: panel === 'recetas' }">
      <div class="courses-toolbar">
        <div class="courses-search">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input id="recipe-search" v-model="recipeSearch" type="text" placeholder="Buscar por nombre o ingrediente..." autocomplete="off">
        </div>
      </div>
      <div id="recipe-count" class="courses-count">Mostrando {{ visibleCards.length }} receta{{ visibleCards.length !== 1 ? 's' : '' }}</div>
      <div id="recipes-grid" class="courses-grid">
        <div
          v-for="c in RECIPE_CARDS"
          v-show="visibleCards.includes(c)"
          :key="c.id"
          class="course-card"
          :data-category="c.cat"
          :data-level="c.level"
          :style="{ '--card-accent': c.accent }"
        >
          <span class="course-level" :class="c.level">{{ c.levelLabel }}</span>
          <div class="course-icon">{{ c.icon }}</div>
          <h3 class="course-title">{{ c.title }}</h3>
          <p class="course-description">{{ c.desc }}</p>
          <div class="course-meta">
            <span class="course-meta-item"><span>⏱️</span> {{ c.time }}</span>
            <span class="course-meta-item"><span>🔥</span> {{ c.kcal }}</span>
            <span class="course-meta-item"><span>👥</span> {{ c.servings }}</span>
          </div>
          <button class="course-start-btn" :data-recipe="c.id" @click="openRecipe(c.id)">Ver Receta</button>
        </div>
        <div v-show="!visibleCards.length" id="no-results-recipe" class="no-results">
          <div class="no-results-icon">🔍</div>
          <p>No se encontraron recetas con ese filtro</p>
        </div>
      </div>
    </div>

    <!-- ══ PANEL 2 – PLANIFICADOR SEMANAL ══ -->
    <div id="panel-planificador" class="diet-panel" :class="{ active: panel === 'planificador' }">
      <h2 class="diet-section-title">📅 Planificador Semanal</h2>
      <p class="diet-section-sub">Asigna desayuno, almuerzo y cena para cada día. Haz clic en una celda para elegir receta.</p>
      <div class="planner-wrapper">
        <div id="planner-grid" class="planner-grid">
          <template v-if="loaded">
            <div class="planner-corner"></div>
            <div v-for="d in DAYS" :key="d" class="planner-day-header">{{ d }}</div>
            <template v-for="(meal, mi) in MEALS" :key="meal">
              <div class="planner-meal-label">{{ meal }}</div>
              <div
                v-for="day in DAYS"
                :key="day"
                class="planner-cell"
                :class="{ filled: plannedRecipe(day, mi) }"
                :data-key="plannerKey(day, mi)"
                :data-day="day"
                :data-meal="MEALS_KEY[mi]"
                @click="openPlanSelector(day, mi)"
              >
                <template v-if="plannedRecipe(day, mi)">
                  <div class="planner-cell-name">{{ plannedRecipe(day, mi)!.emoji }} {{ plannedRecipe(day, mi)!.name }}</div>
                  <div class="planner-cell-kcal">{{ plannedRecipe(day, mi)!.kcal }} kcal</div>
                </template>
                <div class="planner-cell-add">+</div>
              </div>
            </template>
          </template>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px;">
        <button id="btn-clear-plan" class="btn-secondary" @click="clearPlan">🗑️ Limpiar plan</button>
        <button id="btn-gen-shopping" class="btn-secondary" @click="generateShoppingList">🛒 Generar lista de compras</button>
        <button id="btn-ai-plan" class="btn-secondary" @click="goToAiPlan">🤖 Planificar con IA</button>
      </div>
      <div id="planner-summary" class="planner-summary">
        <template v-if="loaded">
          <div class="planner-sum-card"><div class="val">{{ plannerSummary.meals }}</div><div class="lbl">Comidas planificadas</div></div>
          <div class="planner-sum-card"><div class="val">{{ plannerSummary.totalKcal.toLocaleString() }}</div><div class="lbl">kcal totales sem.</div></div>
          <div class="planner-sum-card"><div class="val">{{ Math.round(plannerSummary.totalKcal / 7) }}</div><div class="lbl">kcal promedio/día</div></div>
          <div class="planner-sum-card"><div class="val">{{ plannerSummary.slots }}</div><div class="lbl">de 21 slots llenos</div></div>
        </template>
      </div>
    </div>

    <!-- ══ PANEL 3 – CONTADOR CALÓRICO ══ -->
    <div id="panel-contador" class="diet-panel" :class="{ active: panel === 'contador' }">
      <h2 class="diet-section-title">📊 Contador Calórico Diario</h2>
      <p class="diet-section-sub">Registro en tiempo real de kcal, proteínas, carbohidratos y grasas.</p>
      <div class="profile-grid">
        <div v-for="g in GOAL_FIELDS" :key="g.key" class="profile-field">
          <label>{{ g.label }}</label>
          <input :id="`goal-${g.key}`" type="number" :value="state.goals[g.key]" :min="g.min" :max="g.max" @change="setGoal(g.key, $event)">
        </div>
        <div class="profile-field">
          <label>🥗 Tipo de dieta preferida</label>
          <select id="pref-diet">
            <option value="todos">Sin restricción</option>
            <option value="vegano">Vegano/Vegetariano</option>
            <option value="keto">Keto / Low-carb</option>
            <option value="proteina">Alto en proteína</option>
            <option value="mediterraneo">Mediterráneo</option>
            <option value="paleo">Paleo</option>
            <option value="singluten">Sin Gluten</option>
          </select>
        </div>
        <div class="profile-field">
          <label>⚠️ Alergias / Intolerancias</label>
          <input id="allergies" type="text" placeholder="ej: gluten, lácteos, nueces">
        </div>
      </div>

      <!-- Barras de macros -->
      <div id="macro-cards" class="macro-profile">
        <template v-if="loaded">
          <div v-for="m in macroCards" :key="m.key" class="macro-card">
            <div class="macro-card-top">
              <span class="macro-lbl">{{ m.label }}</span>
              <span class="macro-val"><b>{{ m.cur }}</b> / {{ m.goal }}{{ m.unit }}</span>
            </div>
            <div class="macro-track">
              <div class="macro-fill" :class="m.cls" :style="{ width: `${m.pct}%`, ...(m.over ? { background: 'linear-gradient(90deg,#ff5252,#ff1744)' } : {}) }"></div>
            </div>
            <div style="font-size:0.72rem;margin-top:5px;text-align:right;" :style="{ color: m.over ? '#ff5252' : 'var(--text-secondary)' }">
              {{ m.over ? `⚠️ ${m.cur - m.goal}${m.unit} sobre el objetivo` : `${m.goal - m.cur}${m.unit} restantes` }}
            </div>
          </div>
        </template>
      </div>

      <!-- Log de alimentos del día -->
      <div id="food-log" class="food-log">
        <div class="food-log-head">
          <h3>🍽️ Alimentos de hoy</h3>
          <button id="btn-clear-log" class="btn-secondary" style="font-size:0.78rem;padding:5px 12px;" @click="clearLog">Limpiar día</button>
        </div>
        <div id="food-log-items">
          <template v-if="loaded">
            <div v-if="!state.log.length" style="padding:20px;text-align:center;color:var(--text-secondary);font-size:0.85rem;">No has registrado alimentos hoy 🍽️</div>
            <div v-for="(item, i) in state.log" :key="i" class="food-log-item">
              <span class="fli-emoji">{{ item.emoji || '🍽️' }}</span>
              <div class="fli-name">{{ item.name }} <span style="font-size:0.72rem;color:var(--text-secondary);">({{ item.portion || '1 porción' }})</span></div>
              <div class="fli-macros">P:{{ item.prot || 0 }}g C:{{ item.carb || 0 }}g G:{{ item.fat || 0 }}g</div>
              <span class="fli-kcal">{{ item.kcal }} kcal</span>
              <button class="fli-del" :data-index="i" title="Eliminar" @click="removeLogItem(i)">×</button>
            </div>
          </template>
        </div>
      </div>

      <!-- Formulario añadir alimento -->
      <div class="add-food-form">
        <div class="aff-group">
          <label>Alimento</label>
          <input id="aff-name" ref="foodNameEl" v-model="food.name" type="text" placeholder="ej: Pollo a la plancha">
        </div>
        <div class="aff-group">
          <label>Kcal</label>
          <input id="aff-kcal" v-model="food.kcal" type="number" placeholder="0" min="0">
        </div>
        <div class="aff-group">
          <label>Porción</label>
          <input id="aff-portion" v-model="food.portion" type="text" placeholder="100g">
        </div>
        <div class="aff-group aff-btn">
          <label>&nbsp;</label>
          <button id="btn-add-food" class="course-start-btn" style="width:100%;border-radius:8px;" @click="addFood">+ Añadir</button>
        </div>
      </div>
    </div>

    <!-- ══ PANEL 4 – LISTA DE COMPRAS ══ -->
    <div id="panel-compras" class="diet-panel" :class="{ active: panel === 'compras' }">
      <div class="shopping-head">
        <div>
          <h2 class="diet-section-title">🛒 Lista de Compras</h2>
          <p class="diet-section-sub" style="margin-bottom:0;">Generada automáticamente desde tu plan semanal.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="btn-print-list" class="btn-secondary" @click="printList">🖨️ Imprimir</button>
          <button id="btn-uncheck-all" class="btn-secondary" @click="uncheckAll">↺ Desmarcar todo</button>
        </div>
      </div>
      <div id="shopping-content">
        <template v-if="loaded">
          <div v-if="!shoppingGroups.length" style="text-align:center;padding:40px;color:var(--text-secondary);">
            <div style="font-size:2.5rem;margin-bottom:12px;">🛒</div>
            <p>La lista está vacía. Planifica tu semana y haz clic en "Generar lista de compras".</p>
            <button class="btn-secondary" style="margin-top:12px;" @click="panel = 'planificador'">Ir al planificador</button>
          </div>
          <div v-for="group in shoppingGroups" :key="group.name" class="shopping-category">
            <div class="shopping-cat-title">{{ group.name }}</div>
            <div v-for="[key, val] in group.items" :key="key" class="shopping-item" :class="{ checked: val.checked }" :data-key="key">
              <input type="checkbox" :checked="val.checked" @change="toggleShoppingItem(key, ($event.target as HTMLInputElement).checked)">
              <span class="si-name">{{ val.display }}</span>
              <span v-if="val.count > 1" class="si-qty">×{{ val.count }} recetas</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ══ PANEL 5 – HISTORIAL ══ -->
    <div id="panel-historial" class="diet-panel" :class="{ active: panel === 'historial' }">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 class="diet-section-title">📋 Historial de Comidas</h2>
        <button id="btn-log-today" class="btn-secondary" style="font-size:0.8rem;" :disabled="savingDay" @click="logToday">+ Registrar hoy</button>
      </div>
      <p class="diet-section-sub">Registro diario consultable por el usuario o un profesional de salud.</p>
      <div id="history-content">
        <div v-if="history === 'loading'" style="text-align:center;padding:40px;color:var(--text-secondary);font-size:0.85rem;">Cargando historial…</div>
        <template v-else-if="history">
          <template v-if="!history.length">
            <div v-if="state.log.length" class="history-day">
              <div class="history-day-head">
                <span class="hd-date">📅 Hoy — {{ todayLabel() }}</span>
                <span class="hd-total">{{ totals.kcal }} kcal · P:{{ totals.prot }}g · C:{{ totals.carb }}g · G:{{ totals.fat }}g</span>
              </div>
              <div v-for="(item, i) in state.log" :key="i" class="history-meal">
                <span class="hm-icon">{{ item.emoji || '🍽️' }}</span>
                <div class="hm-info">
                  <div class="hm-name">{{ item.name }}</div>
                  <div class="hm-time">{{ item.ts || '' }}</div>
                </div>
                <span class="hm-kcal">{{ item.kcal }} kcal</span>
              </div>
            </div>
            <div v-else style="text-align:center;padding:40px;color:var(--text-secondary);">
              <div style="font-size:2.5rem;margin-bottom:12px;">📋</div>
              <p>El historial está vacío. Empieza registrando alimentos en el Contador.</p>
            </div>
          </template>
          <div v-for="(day, i) in history" :key="i" class="history-day">
            <div class="history-day-head">
              <span class="hd-date">📅 {{ day.date }}</span>
              <span class="hd-total">{{ day.totalKcal }} kcal · P:{{ day.prot }}g · C:{{ day.carb }}g · G:{{ day.fat }}g</span>
            </div>
            <div v-for="(m, j) in day.meals || []" :key="j" class="history-meal">
              <span class="hm-icon">{{ m.emoji || '🍽️' }}</span>
              <div class="hm-info"><div class="hm-name">{{ m.name }}</div><div class="hm-time">{{ m.time || '' }}</div></div>
              <span class="hm-kcal">{{ m.kcal }} kcal</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ══ PANEL 6 – IA NUTRICIONAL ══ -->
    <div id="panel-ia" class="diet-panel" :class="{ active: panel === 'ia' }">
      <h2 class="diet-section-title">🤖 IA Nutricional</h2>
      <p class="diet-section-sub">Tres modos de asistencia inteligente integrados con el Chat AI de Mirai.</p>
      <div id="ai-modes" class="ai-modes">
        <button v-for="m in AI_MODES" :key="m.id" class="ai-mode-btn" :class="{ active: aiMode === m.id }" :data-mode="m.id" @click="aiMode = m.id">{{ m.label }}</button>
      </div>

      <!-- Modo 1: Ingredientes → receta -->
      <div id="mode-ingredientes" class="ai-mode-panel" :class="{ active: aiMode === 'ingredientes' }">
        <p style="font-size:0.84rem;color:var(--text-secondary);margin-bottom:12px;">Escribe los ingredientes que tienes en casa y la IA te sugerirá recetas posibles.</p>
        <div class="ai-chat-box">
          <div id="msgs-ingredientes" :ref="(el) => (msgsEls.ingredientes = el as HTMLElement | null)" class="ai-messages">
            <div v-for="(msg, i) in chats.ingredientes.messages" :key="i" class="ai-msg" :class="msg.type">{{ msg.text }}</div>
          </div>
          <div class="ai-input-row">
            <textarea
              id="input-ingredientes"
              v-model="chats.ingredientes.input"
              class="ai-input"
              rows="2"
              placeholder="ej: tengo pollo, arroz, tomate y limón..."
              @keydown.enter="onChatKey($event, 'ingredientes')"
            ></textarea>
            <button id="send-ingredientes" class="ai-send" :disabled="chats.ingredientes.busy" @click="sendChat('ingredientes')">Preguntar</button>
          </div>
        </div>
      </div>

      <!-- Modo 2: Análisis de foto -->
      <div id="mode-foto" class="ai-mode-panel" :class="{ active: aiMode === 'foto' }">
        <p style="font-size:0.84rem;color:var(--text-secondary);margin-bottom:12px;">Sube una foto de tu plato y la IA estimará las calorías y macronutrientes.</p>
        <div class="ai-chat-box">
          <div id="msgs-foto" :ref="(el) => (msgsEls.foto = el as HTMLElement | null)" class="ai-messages">
            <div v-for="(msg, i) in chats.foto.messages" :key="i" class="ai-msg" :class="msg.type">{{ msg.text }}</div>
          </div>
          <div style="margin-bottom:10px;">
            <label style="display:inline-block;cursor:pointer;">
              <input id="photo-upload" type="file" accept="image/*" style="display:none;" @change="onPhoto">
              <span class="btn-secondary">📎 Seleccionar imagen</span>
            </label>
            <span id="photo-name" style="margin-left:10px;font-size:0.8rem;color:var(--text-secondary);">{{ photoName }}</span>
          </div>
          <div class="ai-input-row">
            <textarea
              id="input-foto"
              v-model="chats.foto.input"
              class="ai-input"
              rows="2"
              placeholder="Descripción adicional (opcional)..."
              @keydown.enter="onChatKey($event, 'foto')"
            ></textarea>
            <button id="send-foto" class="ai-send" :disabled="chats.foto.busy" @click="sendChat('foto')">Analizar</button>
          </div>
        </div>
      </div>

      <!-- Modo 3: Planificación automática -->
      <div id="mode-plan" class="ai-mode-panel" :class="{ active: aiMode === 'plan' }">
        <p style="font-size:0.84rem;color:var(--text-secondary);margin-bottom:12px;">La IA generará un menú semanal personalizado según tu objetivo, presupuesto y preferencias.</p>
        <div class="profile-grid" style="margin-bottom:14px;">
          <div class="profile-field">
            <label>🎯 Objetivo</label>
            <select id="ai-objetivo" v-model="planForm.objetivo">
              <option value="bajar">Bajar de peso</option>
              <option value="muscular">Ganar músculo</option>
              <option value="mantener">Mantenerse</option>
              <option value="rendimiento">Rendimiento deportivo</option>
            </select>
          </div>
          <div class="profile-field">
            <label>💰 Presupuesto semanal</label>
            <select id="ai-presupuesto" v-model="planForm.presupuesto">
              <option value="bajo">Bajo (&lt; $30)</option>
              <option value="medio">Medio ($30–$70)</option>
              <option value="alto">Alto (&gt; $70)</option>
            </select>
          </div>
          <div class="profile-field">
            <label>🥗 Dieta</label>
            <select id="ai-dieta" v-model="planForm.dieta">
              <option value="todos">Sin restricción</option>
              <option value="vegano">Vegano</option>
              <option value="keto">Keto</option>
              <option value="mediterraneo">Mediterráneo</option>
              <option value="paleo">Paleo</option>
              <option value="singluten">Sin gluten</option>
            </select>
          </div>
          <div class="profile-field">
            <label>⚠️ Restricciones</label>
            <input id="ai-restricciones" v-model="planForm.restricciones" type="text" placeholder="gluten, lactosa...">
          </div>
        </div>
        <div class="ai-chat-box">
          <div id="msgs-plan" :ref="(el) => (msgsEls.plan = el as HTMLElement | null)" class="ai-messages">
            <div v-for="(msg, i) in chats.plan.messages" :key="i" class="ai-msg" :class="msg.type">{{ msg.text }}</div>
          </div>
          <div class="ai-input-row">
            <textarea id="input-plan" v-model="chats.plan.input" class="ai-input" rows="2" placeholder="Notas adicionales (alergias, horarios, preferencias)..."></textarea>
            <button id="send-plan" class="ai-send" :disabled="chats.plan.busy" @click="sendPlan">Generar plan</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ MODAL – DETALLE DE RECETA ══ -->
  <div id="recipe-overlay" class="recipe-overlay" :class="{ open: modal === 'recipe' }" @click.self="modal = null">
    <div id="recipe-modal" class="recipe-modal">
      <template v-if="recipe">
        <div class="rm-header">
          <div>
            <h2 id="rm-title" style="margin:0;font-size:1.2rem;">{{ recipe.name }}</h2>
            <div id="rm-badges" class="rm-badges">
              <span class="rm-badge">{{ catLabel(recipe.cat) }}</span>
              <span class="rm-badge">{{ LEVEL_LABELS[recipe.level] || recipe.level }}</span>
              <span class="rm-badge">⏱️ {{ recipe.time }} min</span>
            </div>
          </div>
          <button id="rm-close" class="rm-close" @click="modal = null">&times;</button>
        </div>
        <div id="rm-icon" class="rm-icon">{{ recipe.emoji }}</div>
        <p id="rm-desc" class="rm-desc">{{ recipe.desc }}</p>
        <div class="portion-bar">
          <label>👥 Porciones</label>
          <button id="pbtn-minus" class="pbtn" @click="portions > 1 && portions--">−</button>
          <span id="pcount" class="pcount">{{ portions }}</span>
          <button id="pbtn-plus" class="pbtn" @click="portions++">+</button>
          <span id="portion-kcal" style="font-size:0.78rem;color:var(--text-secondary);margin-left:6px;">{{ scaled.kcal }} kcal totales</span>
        </div>
        <div class="rm-section">🧂 Ingredientes</div>
        <div id="rm-ingredients" class="ingredient-tags">
          <span v-for="(ing, i) in recipe.ingredients" :key="i" class="itag">{{ scaleIngredient(ing, portions / recipe.servings) }}</span>
        </div>
        <div class="rm-section">📋 Pasos</div>
        <ol id="rm-steps" class="recipe-steps">
          <li v-for="(s, i) in recipe.steps" :key="i">{{ s }}</li>
        </ol>
        <div class="rm-section">📊 Macros por porción</div>
        <div id="rm-macros" class="rm-macro-row">
          <div class="rm-macro"><div class="mv">{{ scaled.kcal }}</div><div class="ml">kcal</div></div>
          <div class="rm-macro"><div class="mv">{{ scaled.prot }}g</div><div class="ml">Proteína</div></div>
          <div class="rm-macro"><div class="mv">{{ scaled.carb }}g</div><div class="ml">Carbohidratos</div></div>
          <div class="rm-macro"><div class="mv">{{ scaled.fat }}g</div><div class="ml">Grasas</div></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap;">
          <button id="rm-add-log" class="course-start-btn" style="flex:1;" @click="addRecipeToLog">+ Añadir al contador</button>
          <button id="rm-add-plan" class="btn-secondary" style="flex:1;" @click="addRecipeToPlan">📅 Añadir al plan</button>
        </div>
      </template>
    </div>
  </div>

  <!-- ══ MODAL – SELECTOR DE RECETA (PLANIFICADOR) ══ -->
  <div id="plan-selector-overlay" class="recipe-overlay" :class="{ open: modal === 'plan' }" @click.self="modal = null">
    <div class="recipe-modal" style="max-width:420px;">
      <div class="rm-header" style="margin-bottom:12px;">
        <h3 id="plan-selector-title" style="margin:0;font-size:1rem;">{{ planTarget ? `${planTarget.day} – ${capitalize(MEALS_KEY[planTarget.meal]!)}` : '' }}</h3>
        <button id="plan-selector-close" class="rm-close" @click="modal = null">&times;</button>
      </div>
      <div class="courses-search" style="margin-bottom:10px;">
        <svg viewBox="0 0 24 24">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input id="plan-recipe-search" v-model="planSearch" type="text" placeholder="Buscar receta..." autocomplete="off">
      </div>
      <div id="plan-recipe-list" class="plan-recipe-list">
        <div v-for="r in planRecipes" :key="r.id" class="plan-recipe-item" :data-rid="r.id" @click="assignRecipe(r.id)">
          <div class="pri-emoji">{{ r.emoji }}</div>
          <div class="pri-info">
            <div class="pri-name">{{ r.name }}</div>
            <div class="pri-meta">{{ catLabel(r.cat) }} · {{ r.kcal }} kcal · {{ r.time }} min</div>
          </div>
        </div>
      </div>
      <button id="plan-remove-meal" class="btn-secondary" style="width:100%;margin-top:10px;border-color:#ff5252;color:#ff5252;" @click="removeMeal">🗑️ Quitar comida</button>
    </div>
  </div>

  <!-- Aviso flotante -->
  <div
    v-if="toast"
    :key="toast.id"
    :style="{ opacity: toast.visible ? '1' : '0' }"
    style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent-gradient);color:#fff;padding:10px 20px;border-radius:20px;font-size:0.85rem;font-weight:600;z-index:9999;transition:opacity 0.3s;pointer-events:none;"
  >
    {{ toast.text }}
  </div>

  <!-- Módulos y tipo de dieta, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Dieta</h4>
    <div class="sidebar-panel-section">
      <p class="sidebar-panel-label">Módulos</p>
      <div id="diet-tabs" class="sidebar-diet-tabs">
        <button v-for="p in PANELS" :key="p.id" class="diet-tab" :class="{ active: panel === p.id }" :data-panel="p.id" @click="panel = p.id">{{ p.label }}</button>
      </div>

      <p class="sidebar-panel-label">Tipo de dieta</p>
      <div id="filter-pills-diet" class="filter-pills sidebar-filter-list">
        <button v-for="c in CATEGORY_FILTERS" :key="c.id" class="filter-pill" :class="{ active: category === c.id }" :data-category="c.id" @click="category = c.id">
          {{ c.label }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/diet.html (todo su JS iba dentro de la página):
// recetas, planificador semanal, contador calórico, lista de compras,
// historial e IA nutricional. El estado de cada usuario vive en D1
// (/api/diet/...).
//
// Como antes, la IA nutricional llama a /api/chat sin los campos que esa ruta
// exige y, al fallar, responde con las sugerencias locales.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { apiFetch } from '@/lib/api';
import { RECIPES, RECIPE_CARDS, type Recipe } from '@/lib/diet-recipes';

interface LogItem {
  name: string;
  emoji?: string;
  kcal: number;
  prot?: number;
  carb?: number;
  fat?: number;
  portion?: string;
  ts?: string;
}

interface ShoppingItem {
  display: string;
  count: number;
  checked: boolean;
}

interface HistoryDay {
  date: string;
  totalKcal: number;
  prot: number;
  carb: number;
  fat: number;
  meals?: { name: string; emoji?: string; kcal: number; time?: string }[];
}

type Goals = { kcal: number; prot: number; carb: number; fat: number };
type Panel = 'recetas' | 'planificador' | 'contador' | 'compras' | 'historial' | 'ia';
type AiMode = 'ingredientes' | 'foto' | 'plan';

const PANELS: { id: Panel; label: string }[] = [
  { id: 'recetas', label: '🍽️ Recetas' },
  { id: 'planificador', label: '📅 Planificador' },
  { id: 'contador', label: '📊 Contador' },
  { id: 'compras', label: '🛒 Compras' },
  { id: 'historial', label: '📋 Historial' },
  { id: 'ia', label: '🤖 IA Nutricional' },
];
const CATEGORY_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'vegano', label: '🌿 Vegano' },
  { id: 'keto', label: '🥑 Keto' },
  { id: 'proteina', label: '💪 Proteína' },
  { id: 'mediterraneo', label: '🫒 Mediterráneo' },
  { id: 'paleo', label: '🍖 Paleo' },
  { id: 'singluten', label: '🌾 Sin Gluten' },
];
const AI_MODES: { id: AiMode; label: string }[] = [
  { id: 'ingredientes', label: '🧑‍🍳 ¿Qué cocino?' },
  { id: 'foto', label: '📸 Análisis de foto' },
  { id: 'plan', label: '📅 Planificación automática' },
];
const GOAL_FIELDS: { key: keyof Goals; label: string; min: number; max: number }[] = [
  { key: 'kcal', label: '🎯 Objetivo calórico (kcal/día)', min: 1000, max: 5000 },
  { key: 'prot', label: '🥩 Proteínas objetivo (g/día)', min: 50, max: 400 },
  { key: 'carb', label: '🍞 Carbohidratos objetivo (g/día)', min: 20, max: 600 },
  { key: 'fat', label: '🧈 Grasas objetivo (g/día)', min: 20, max: 300 },
];
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MEALS = ['🌅 Desayuno', '🌞 Almuerzo', '🌙 Cena'];
const MEALS_KEY = ['desayuno', 'almuerzo', 'cena'];
const CAT_LABELS: Record<string, string> = {
  vegano: '🌿 Vegano',
  keto: '🥑 Keto',
  proteina: '💪 Proteína',
  mediterraneo: '🫒 Mediterráneo',
  paleo: '🍖 Paleo',
  singluten: '🌾 Sin Gluten',
};
const LEVEL_LABELS: Record<string, string> = { principiante: '🟢 Fácil', intermedio: '🟡 Medio', avanzado: '🔴 Avanzado' };

function catLabel(cat: string): string {
  return CAT_LABELS[cat.split(' ')[0]!] || cat;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function recipeById(id: number | undefined): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

function nowTime(): string {
  return new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function todayLabel(): string {
  return new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Estado (D1, por usuario) ──────────────────────────────────────────────
const state = reactive({
  planner: {} as Record<string, number>,
  log: [] as LogItem[],
  shopping: {} as Record<string, ShoppingItem>,
  goals: { kcal: 2000, prot: 150, carb: 220, fat: 65 } as Goals,
});
const loaded = ref(false);

// Guardados "dispara y olvida", como antes.
function put(endpoint: string, data: unknown) {
  apiFetch(`/api/diet/${endpoint}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch((e) =>
    console.warn('[Diet DB] save error:', e),
  );
}

function del(endpoint: string) {
  apiFetch(`/api/diet/${endpoint}`, { method: 'DELETE' }).catch((e) => console.warn('[Diet DB] delete error:', e));
}

async function loadState() {
  try {
    const r = await apiFetch('/api/diet/state');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const s = (await r.json()) as Partial<typeof state>;
    state.goals = s.goals || state.goals;
    state.planner = s.planner || {};
    state.log = s.log || [];
    state.shopping = s.shopping || {};
  } catch (e) {
    console.warn('[Diet DB] load error (usando estado vacío):', e);
  } finally {
    loaded.value = true;
  }
}

// ── Navegación entre módulos ──────────────────────────────────────────────
const panel = ref<Panel>('recetas');
const aiMode = ref<AiMode>('ingredientes');

// El historial se recarga cada vez que se abre su módulo.
watch(panel, (p) => p === 'historial' && void loadHistory());

// ── Toast ─────────────────────────────────────────────────────────────────
const toast = ref<{ id: number; text: string; visible: boolean } | null>(null);
let toastSeq = 0;
const toastTimers: number[] = [];
onBeforeUnmount(() => toastTimers.forEach(clearTimeout));

function showToast(text: string) {
  const id = ++toastSeq;
  toast.value = { id, text, visible: false };
  toastTimers.push(
    window.setTimeout(() => toast.value?.id === id && (toast.value.visible = true), 10),
    window.setTimeout(() => toast.value?.id === id && (toast.value.visible = false), 2800),
    window.setTimeout(() => toast.value?.id === id && (toast.value = null), 3100),
  );
}

// ── Recetas ───────────────────────────────────────────────────────────────
const recipeSearch = ref('');
const category = ref('todos');

const visibleCards = computed(() => {
  const q = recipeSearch.value.toLowerCase().trim();
  return RECIPE_CARDS.filter(
    (c) => (category.value === 'todos' || c.cat.includes(category.value)) && (!q || c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)),
  );
});

const modal = ref<'recipe' | 'plan' | null>(null);
const recipe = ref<Recipe | null>(null);
const portions = ref(2);

const scaled = computed(() => {
  const r = recipe.value;
  if (!r) return { kcal: 0, prot: 0, carb: 0, fat: 0 };
  const scale = portions.value / r.servings;
  return { kcal: Math.round(r.kcal * scale), prot: Math.round(r.prot * scale), carb: Math.round(r.carb * scale), fat: Math.round(r.fat * scale) };
});

function openRecipe(id: number) {
  const r = recipeById(id);
  if (!r) return;
  recipe.value = r;
  portions.value = r.servings;
  modal.value = 'recipe';
}

/** Escala las cantidades de un ingrediente ("200g quinoa" × 1.5 → "300g quinoa"). */
function scaleIngredient(ing: string, scale: number): string {
  if (scale === 1) return ing;
  return ing.replace(/(\d+(?:\.\d+)?)/g, (_, n: string) => {
    const v = Math.round(parseFloat(n) * scale * 10) / 10;
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  });
}

function addRecipeToLog() {
  const r = recipe.value;
  if (!r) return;
  const n = portions.value;
  state.log.push({ name: r.name, emoji: r.emoji, ...scaled.value, portion: `${n} porción${n > 1 ? 'es' : ''}`, ts: nowTime() });
  put('log', state.log);
  modal.value = null;
  panel.value = 'contador';
}

function addRecipeToPlan() {
  modal.value = null;
  panel.value = 'planificador';
  showToast(`"${recipe.value?.name}" — elige una celda del planificador`);
}

// ── Planificador ──────────────────────────────────────────────────────────
function plannerKey(day: string, meal: number): string {
  return `${day.toLowerCase()}-${MEALS_KEY[meal]}`;
}

function plannedRecipe(day: string, meal: number): Recipe | undefined {
  return recipeById(state.planner[plannerKey(day, meal)]);
}

const plannerSummary = computed(() => {
  const ids = Object.values(state.planner);
  return {
    meals: ids.filter(Boolean).length,
    totalKcal: ids.reduce((sum, rid) => sum + (recipeById(rid)?.kcal ?? 0), 0),
    slots: ids.length,
  };
});

const planTarget = ref<{ key: string; day: string; meal: number } | null>(null);
const planSearch = ref('');

const planRecipes = computed(() => {
  const q = planSearch.value.toLowerCase();
  return RECIPES.filter((r) => !q || r.name.toLowerCase().includes(q) || r.cat.includes(q));
});

function openPlanSelector(day: string, meal: number) {
  planTarget.value = { key: plannerKey(day, meal), day, meal };
  planSearch.value = '';
  modal.value = 'plan';
}

function assignRecipe(id: number) {
  if (!planTarget.value) return;
  state.planner[planTarget.value.key] = id;
  put('planner', state.planner);
  modal.value = null;
}

function removeMeal() {
  if (!planTarget.value) return;
  delete state.planner[planTarget.value.key];
  put('planner', state.planner);
  modal.value = null;
}

function clearPlan() {
  if (!confirm('¿Limpiar el plan completo?')) return;
  state.planner = {};
  del('planner');
}

function goToAiPlan() {
  panel.value = 'ia';
  aiMode.value = 'plan';
}

// ── Contador calórico ─────────────────────────────────────────────────────
function setGoal(key: keyof Goals, e: Event) {
  state.goals = { ...state.goals, [key]: +(e.target as HTMLInputElement).value };
  put('goals', state.goals);
}

const totals = computed(() =>
  state.log.reduce(
    (acc, item) => ({ kcal: acc.kcal + (item.kcal || 0), prot: acc.prot + (item.prot || 0), carb: acc.carb + (item.carb || 0), fat: acc.fat + (item.fat || 0) }),
    { kcal: 0, prot: 0, carb: 0, fat: 0 },
  ),
);

const macroCards = computed(() => {
  const t = totals.value;
  const g = state.goals;
  return [
    { key: 'kcal', label: 'Calorías', unit: 'kcal', cur: t.kcal, goal: g.kcal, cls: '' },
    { key: 'prot', label: 'Proteínas', unit: 'g', cur: t.prot, goal: g.prot, cls: 'prot' },
    { key: 'carb', label: 'Carbohidratos', unit: 'g', cur: t.carb, goal: g.carb, cls: 'carb' },
    { key: 'fat', label: 'Grasas', unit: 'g', cur: t.fat, goal: g.fat, cls: 'fat' },
  ].map((m) => ({ ...m, pct: Math.min(100, Math.round((m.cur / m.goal) * 100)), over: m.cur > m.goal }));
});

function removeLogItem(i: number) {
  state.log.splice(i, 1);
  put('log', state.log);
}

function clearLog() {
  if (!confirm('¿Limpiar el registro de hoy?')) return;
  state.log = [];
  del('log');
}

const foodNameEl = ref<HTMLInputElement | null>(null);
const food = reactive({ name: '', kcal: '' as string | number, portion: '' });

function addFood() {
  const name = food.name.trim();
  if (!name) {
    foodNameEl.value?.focus();
    return;
  }
  state.log.push({
    name,
    kcal: parseInt(String(food.kcal), 10) || 0,
    prot: 0,
    carb: 0,
    fat: 0,
    portion: food.portion.trim() || '1 porción',
    emoji: '🍽️',
    ts: nowTime(),
  });
  put('log', state.log);
  Object.assign(food, { name: '', kcal: '', portion: '' });
}

// ── Lista de compras ──────────────────────────────────────────────────────
function generateShoppingList() {
  const ingredients: Record<string, { raw: string; count: number }> = {};
  for (const rid of new Set(Object.values(state.planner).filter(Boolean))) {
    for (const ing of recipeById(rid)?.ingredients ?? []) {
      const key = ing.replace(/\d+[a-z]*/gi, '').trim().toLowerCase();
      ingredients[key] ??= { raw: ing, count: 0 };
      ingredients[key].count++;
    }
  }
  state.shopping = Object.fromEntries(Object.entries(ingredients).map(([key, val]) => [key, { display: val.raw, count: val.count, checked: false }]));
  put('shopping', state.shopping);
  panel.value = 'compras';
}

const SHOPPING_GROUPS: [string, string[]][] = [
  ['Proteínas 🥩', ['pollo', 'pechuga', 'salmón', 'atún', 'huevo', 'carne', 'cerdo', 'bacon', 'gambas', 'camarón', 'mejillón', 'calamar', 'lubina']],
  [
    'Vegetales 🥦',
    ['tomate', 'pepino', 'pimiento', 'espinaca', 'brócoli', 'cebolla', 'ajo', 'zanahoria', 'champiñón', 'aguacate', 'cherry', 'boniato', 'coliflor', 'mango', 'espárrago', 'jackfruit'],
  ],
  ['Lácteos 🧀', ['queso', 'parmesano', 'feta', 'gruyère', 'mantequilla', 'leche', 'crema', 'pecorino']],
  ['Legumbres 🫘', ['garbanzo', 'quinoa', 'lentejas', 'arroz', 'pasta']],
  ['Carbohidratos 🍞', ['arroz', 'pasta', 'pan', 'avena', 'tortilla', 'harina']],
];

const shoppingGroups = computed(() => {
  const groups = new Map<string, [string, ShoppingItem][]>([...SHOPPING_GROUPS.map(([name]) => [name, []] as [string, [string, ShoppingItem][]]), ['Otros 🛒', []]]);
  for (const entry of Object.entries(state.shopping)) {
    const name = SHOPPING_GROUPS.find(([, words]) => words.some((w) => entry[0].includes(w)))?.[0] ?? 'Otros 🛒';
    groups.get(name)!.push(entry);
  }
  return [...groups].filter(([, items]) => items.length).map(([name, items]) => ({ name, items }));
});

function toggleShoppingItem(key: string, checked: boolean) {
  const item = state.shopping[key];
  if (!item) return;
  item.checked = checked;
  put('shopping', state.shopping);
}

function uncheckAll() {
  Object.values(state.shopping).forEach((v) => (v.checked = false));
  put('shopping', state.shopping);
}

function printList() {
  window.print();
}

// ── Historial ─────────────────────────────────────────────────────────────
const history = ref<HistoryDay[] | 'loading' | null>(null);
const savingDay = ref(false);

async function loadHistory() {
  history.value = 'loading';
  try {
    const r = await apiFetch('/api/diet/history');
    history.value = r.ok ? ((await r.json()) as HistoryDay[]) : [];
  } catch {
    history.value = [];
  }
}

async function logToday() {
  if (!state.log.length) {
    showToast('No hay alimentos en el contador de hoy');
    return;
  }
  const t = totals.value;
  savingDay.value = true;
  await apiFetch('/api/diet/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: todayLabel(),
      totalKcal: t.kcal,
      prot: t.prot,
      carb: t.carb,
      fat: t.fat,
      meals: state.log.map((item) => ({ name: item.name, emoji: item.emoji, kcal: item.kcal, time: item.ts })),
    }),
  }).catch((e) => console.warn('[Diet DB] history error:', e));
  state.log = [];
  del('log');
  savingDay.value = false;
  void loadHistory();
  showToast('✅ Día registrado en el historial');
}

// ── IA nutricional ────────────────────────────────────────────────────────
type ChatMsg = { text: string; type: 'user' | 'bot' | 'thinking' };

const chats = reactive<Record<AiMode, { messages: ChatMsg[]; input: string; busy: boolean }>>({
  ingredientes: { messages: [{ text: '¡Hola! Dime qué ingredientes tienes disponibles y te diré qué puedes preparar 🍳', type: 'bot' }], input: '', busy: false },
  foto: { messages: [{ text: '📸 Sube una foto de tu plato y analizaré su contenido nutricional estimado.', type: 'bot' }], input: '', busy: false },
  plan: {
    messages: [{ text: 'Configura tus preferencias arriba y luego haz clic en "Generar plan" para recibir tu menú semanal personalizado 📅', type: 'bot' }],
    input: '',
    busy: false,
  },
});
const msgsEls: Partial<Record<AiMode, HTMLElement | null>> = {};
const planForm = reactive({ objetivo: 'muscular', presupuesto: 'medio', dieta: 'todos', restricciones: '' });
const photoName = ref('');

function onPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) photoName.value = file.name;
}

function addMsg(mode: AiMode, text: string, type: ChatMsg['type']): ChatMsg {
  const msg: ChatMsg = { text, type };
  chats[mode].messages.push(msg);
  void nextTick(() => {
    const el = msgsEls[mode];
    if (el) el.scrollTop = el.scrollHeight;
  });
  return chats[mode].messages[chats[mode].messages.length - 1]!;
}

function removeMsg(mode: AiMode, msg: ChatMsg) {
  const list = chats[mode].messages;
  const i = list.indexOf(msg);
  if (i !== -1) list.splice(i, 1);
}

async function callMiraiAI(prompt: string, systemPrompt: string): Promise<string | null> {
  try {
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemPrompt, model: 'dynamic/DeepLlamaPro' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { content?: string; reply?: string; message?: string };
    return data.content || data.reply || data.message || 'Respuesta recibida ✅';
  } catch {
    return null;
  }
}

/** Respuesta local: recetas del catálogo que usan alguno de los ingredientes. */
function fallbackIngredientes(text: string): string {
  const words = text.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 3);
  const found = RECIPES.filter((r) => r.ingredients.some((ing) => words.some((w) => ing.toLowerCase().includes(w)))).slice(0, 3);
  if (!found.length) return 'No encontré recetas exactas con esos ingredientes, pero puedo ayudarte con el Chat AI 💬';
  return `Con esos ingredientes puedes preparar:\n\n${found.map((r) => `**${r.emoji} ${r.name}** (${r.time} min, ${r.kcal} kcal)\n${r.desc}`).join('\n\n')}\n\n¿Quieres ver la receta completa de alguna?`;
}

const CHAT_PROMPTS: Record<'ingredientes' | 'foto', (text: string) => string> = {
  ingredientes: (text) => `Tengo estos ingredientes disponibles: ${text}. ¿Qué recetas saludables puedo preparar? Dame 2-3 opciones con pasos básicos y estimación de calorías.`,
  foto: (text) =>
    `Analiza este plato de comida${text ? `: ${text}` : ''}. Estima las calorías totales y el desglose de macronutrientes (proteínas, carbohidratos, grasas) aproximado para una porción normal.`,
};

async function sendChat(mode: 'ingredientes' | 'foto') {
  const chat = chats[mode];
  const text = chat.input.trim();
  if (!text || chat.busy) return;
  addMsg(mode, text, 'user');
  chat.input = '';
  chat.busy = true;
  const thinking = addMsg(mode, 'Pensando...', 'thinking');
  const response =
    (await callMiraiAI(
      CHAT_PROMPTS[mode](text),
      'Eres Mirai, asistente nutricional experto. Responde en español, de forma clara, concisa y útil. Cuando listes recetas, usa formato legible.',
    )) ?? fallbackIngredientes(text);
  removeMsg(mode, thinking);
  addMsg(mode, response, 'bot');
  chat.busy = false;
}

// Enter envía; Mayús+Enter, salto de línea.
function onChatKey(e: KeyboardEvent, mode: 'ingredientes' | 'foto') {
  if (e.shiftKey) return;
  e.preventDefault();
  void sendChat(mode);
}

async function sendPlan() {
  const { objetivo, presupuesto, dieta, restricciones } = planForm;
  const notas = chats.plan.input.trim();
  const prompt = `Genera un menú semanal completo (7 días × desayuno, almuerzo, cena) para alguien con estos parámetros:
   - Objetivo: ${objetivo}
   - Presupuesto semanal: ${presupuesto}
   - Tipo de dieta: ${dieta}
   - Alergias/Restricciones: ${restricciones || 'ninguna'}
   - Notas adicionales: ${notas || 'ninguna'}

   Para cada comida indica: nombre del plato, kcal aproximadas y tiempo de preparación. Incluye variedad y equilibrio nutricional.`;

  addMsg('plan', `Generar plan: objetivo ${objetivo}, dieta ${dieta}`, 'user');
  chats.plan.busy = true;
  const thinking = addMsg('plan', 'Generando tu plan personalizado...', 'thinking');
  let response = await callMiraiAI(prompt, 'Eres un nutricionista experto. Genera menús equilibrados, variados y específicos. Responde en español con formato claro.');
  if (!response) {
    const dietLabel =
      ({ todos: 'variada', vegano: 'vegana', keto: 'keto', mediterraneo: 'mediterránea', paleo: 'paleo', singluten: 'sin gluten' } as Record<string, string>)[dieta] || dieta;
    response = `**📅 Plan semanal personalizado — Dieta ${dietLabel}**\n\nTu plan ha sido generado considerando tu objetivo de ${objetivo}. Para una planificación completamente personalizada con macros exactos, usa el Chat AI de Mirai con tu perfil completo.\n\n*Tip: Ve al planificador y asigna las recetas de nuestro catálogo manualmente.*`;
  }
  removeMsg('plan', thinking);
  addMsg('plan', response, 'bot');
  chats.plan.busy = false;
}

onMounted(loadState);
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* =====================================================
 DIETA – Estilos nuevos mínimos (lo que no existe en
 styles.css ni puede resolverse con clases existentes)
===================================================== */

/* ── Tabs principales ── */
:where(body[data-page="diet"]) .diet-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 0 0 18px;
  scrollbar-width: none;
}
:where(body[data-page="diet"]) .diet-tabs::-webkit-scrollbar { display: none; }
:where(body[data-page="diet"]) .diet-tab {
  flex-shrink: 0;
  padding: 8px 18px;
  border: 1.5px solid var(--glass-border);
  border-radius: 22px;
  background: var(--glass-bg);
  color: var(--text-secondary);
  font-size: 0.84rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-family: var(--font-family);
}
:where(body[data-page="diet"]) .diet-tab:hover { border-color: var(--accent-color); color: var(--accent-color); }
:where(body[data-page="diet"]) .diet-tab.active {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #fff;
  font-weight: 700;
}

/* ── Paneles ── */
:where(body[data-page="diet"]) .diet-panel { display: none; }
:where(body[data-page="diet"]) .diet-panel.active { display: block; }

/* ── Encabezados de sección ── */
:where(body[data-page="diet"]) .diet-section-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
:where(body[data-page="diet"]) .diet-section-sub {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin: 0 0 20px;
}

/* ─────────────────────────────────────────────────────
 PLANIFICADOR SEMANAL
───────────────────────────────────────────────────── */
:where(body[data-page="diet"]) .planner-wrapper { overflow-x: auto; border-radius: 16px; margin-bottom: 20px; }
:where(body[data-page="diet"]) .planner-grid {
  display: grid;
  grid-template-columns: 86px repeat(7, 1fr);
  gap: 6px;
  min-width: 660px;
}
:where(body[data-page="diet"]) .planner-corner { /* vacío */ }
:where(body[data-page="diet"]) .planner-day-header {
  background: var(--accent-gradient);
  color: #fff;
  border-radius: 10px;
  padding: 8px 4px;
  text-align: center;
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.3;
}
:where(body[data-page="diet"]) .planner-meal-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: right;
  line-height: 1.3;
}
:where(body[data-page="diet"]) .planner-cell {
  background: var(--glass-bg);
  border: 1.5px dashed var(--glass-border);
  border-radius: 10px;
  padding: 7px;
  min-height: 66px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
:where(body[data-page="diet"]) .planner-cell:hover { border-color: var(--accent-color); border-style: solid; }
:where(body[data-page="diet"]) .planner-cell.filled { border-style: solid; border-color: var(--accent-color); background: var(--secondary-container); }
:where(body[data-page="diet"]) .planner-cell-name { font-size: 0.71rem; font-weight: 600; color: var(--text-primary); line-height: 1.3; }
:where(body[data-page="diet"]) .planner-cell-kcal { font-size: 0.65rem; color: var(--accent-color); margin-top: 2px; font-weight: 600; }
:where(body[data-page="diet"]) .planner-cell-add {
  position: absolute; bottom: 5px; right: 5px;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent-gradient); color: #fff;
  font-size: 13px; line-height: 18px; text-align: center;
  opacity: 0.55; pointer-events: none;
}
:where(body[data-page="diet"]) .planner-cell:hover .planner-cell-add { opacity: 1; }

:where(body[data-page="diet"]) .planner-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
:where(body[data-page="diet"]) .planner-sum-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}
:where(body[data-page="diet"]) .planner-sum-card .val { font-size: 1.3rem; font-weight: 800; color: var(--accent-color); }
:where(body[data-page="diet"]) .planner-sum-card .lbl { font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px; }

/* ─────────────────────────────────────────────────────
 CONTADOR CALÓRICO
───────────────────────────────────────────────────── */
:where(body[data-page="diet"]) .macro-profile {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
:where(body[data-page="diet"]) .macro-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  padding: 15px 18px;
}
:where(body[data-page="diet"]) .macro-card-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 9px; }
:where(body[data-page="diet"]) .macro-lbl { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); }
:where(body[data-page="diet"]) .macro-val { font-size: 0.78rem; color: var(--text-secondary); }
:where(body[data-page="diet"]) .macro-val b { font-size: 1.15rem; color: var(--text-primary); font-weight: 800; }
:where(body[data-page="diet"]) .macro-track { height: 8px; background: var(--secondary-container); border-radius: 4px; overflow: hidden; }
:where(body[data-page="diet"]) .macro-fill {
  height: 100%; border-radius: 4px;
  background: var(--accent-gradient);
  transition: width 0.5s cubic-bezier(.4,0,.2,1);
}
:where(body[data-page="diet"]) .macro-fill.prot { background: linear-gradient(90deg,#ef5350,#ff8a80); }
:where(body[data-page="diet"]) .macro-fill.carb { background: linear-gradient(90deg,#ffa726,#ffcc02); }
:where(body[data-page="diet"]) .macro-fill.fat { background: linear-gradient(90deg,#42a5f5,#80d8ff); }

:where(body[data-page="diet"]) .food-log {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  overflow: hidden;
}
:where(body[data-page="diet"]) .food-log-head {
  padding: 14px 18px;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
:where(body[data-page="diet"]) .food-log-head h3 { margin: 0; font-size: 0.92rem; }
:where(body[data-page="diet"]) .food-log-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 18px;
  border-bottom: 1px solid var(--glass-border);
  transition: background 0.15s;
}
:where(body[data-page="diet"]) .food-log-item:last-child { border-bottom: none; }
:where(body[data-page="diet"]) .food-log-item:hover { background: var(--secondary-container); }
:where(body[data-page="diet"]) .fli-emoji { font-size: 1.3rem; }
:where(body[data-page="diet"]) .fli-name { flex: 1; font-size: 0.85rem; font-weight: 500; }
:where(body[data-page="diet"]) .fli-macros { font-size: 0.73rem; color: var(--text-secondary); }
:where(body[data-page="diet"]) .fli-kcal { font-size: 0.82rem; color: var(--accent-color); font-weight: 700; min-width: 54px; text-align: right; }
:where(body[data-page="diet"]) .fli-del {
  width: 24px; height: 24px; border-radius: 50%; border: none;
  background: transparent; color: var(--text-secondary);
  cursor: pointer; font-size: 15px; line-height: 1; transition: all 0.15s;
}
:where(body[data-page="diet"]) .fli-del:hover { background: rgba(255,82,82,0.12); color: #ff5252; }

:where(body[data-page="diet"]) .add-food-form {
  display: grid;
  grid-template-columns: 2fr 1fr 80px auto;
  gap: 8px;
  padding: 14px;
  background: var(--secondary-container);
  border-radius: 12px;
  margin-top: 14px;
  align-items: end;
}
:where(body[data-page="diet"]) .aff-group { display: flex; flex-direction: column; gap: 4px; }
:where(body[data-page="diet"]) .aff-group label { font-size: 0.73rem; color: var(--text-secondary); }
:where(body[data-page="diet"]) .aff-group input, :where(body[data-page="diet"]) .aff-group select {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 0.83rem;
  color: var(--text-primary);
  font-family: var(--font-family);
}
:where(body[data-page="diet"]) .aff-group input:focus, :where(body[data-page="diet"]) .aff-group select:focus { outline: none; border-color: var(--accent-color); }

/* ─────────────────────────────────────────────────────
 LISTA DE COMPRAS
───────────────────────────────────────────────────── */
:where(body[data-page="diet"]) .shopping-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
:where(body[data-page="diet"]) .shopping-category {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 12px;
}
:where(body[data-page="diet"]) .shopping-cat-title {
  padding: 11px 16px;
  font-weight: 700;
  font-size: 0.82rem;
  background: var(--secondary-container);
  border-bottom: 1px solid var(--glass-border);
}
:where(body[data-page="diet"]) .shopping-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--glass-border);
  cursor: pointer;
  transition: background 0.15s;
}
:where(body[data-page="diet"]) .shopping-item:last-child { border-bottom: none; }
:where(body[data-page="diet"]) .shopping-item:hover { background: var(--secondary-container); }
:where(body[data-page="diet"]) .shopping-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent-color); flex-shrink: 0; }
:where(body[data-page="diet"]) .si-name { flex: 1; font-size: 0.85rem; }
:where(body[data-page="diet"]) .si-qty { font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; }
:where(body[data-page="diet"]) .shopping-item.checked .si-name { text-decoration: line-through; color: var(--text-secondary); }

/* ─────────────────────────────────────────────────────
 HISTORIAL
───────────────────────────────────────────────────── */
:where(body[data-page="diet"]) .history-day {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 14px;
}
:where(body[data-page="diet"]) .history-day-head {
  padding: 11px 16px;
  background: var(--secondary-container);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
:where(body[data-page="diet"]) .hd-date { font-weight: 700; font-size: 0.88rem; }
:where(body[data-page="diet"]) .hd-total { font-size: 0.8rem; color: var(--accent-color); font-weight: 700; }
:where(body[data-page="diet"]) .history-meal {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--glass-border);
}
:where(body[data-page="diet"]) .history-meal:last-child { border-bottom: none; }
:where(body[data-page="diet"]) .hm-icon { font-size: 1.25rem; }
:where(body[data-page="diet"]) .hm-info { flex: 1; }
:where(body[data-page="diet"]) .hm-name { font-size: 0.85rem; font-weight: 500; }
:where(body[data-page="diet"]) .hm-time { font-size: 0.72rem; color: var(--text-secondary); }
:where(body[data-page="diet"]) .hm-kcal { font-size: 0.82rem; color: var(--accent-color); font-weight: 700; }

/* ─────────────────────────────────────────────────────
 IA NUTRICIONAL
───────────────────────────────────────────────────── */
:where(body[data-page="diet"]) .ai-modes {
  display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px;
}
:where(body[data-page="diet"]) .ai-mode-btn {
  padding: 8px 16px;
  border-radius: 20px;
  border: 1.5px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-family);
}
:where(body[data-page="diet"]) .ai-mode-btn:hover:not(.active) { border-color: var(--accent-color); color: var(--accent-color); }
:where(body[data-page="diet"]) .ai-mode-btn.active { background: var(--accent-gradient); border-color: transparent; color: #fff; font-weight: 700; }
:where(body[data-page="diet"]) .ai-mode-panel { display: none; }
:where(body[data-page="diet"]) .ai-mode-panel.active { display: block; }

:where(body[data-page="diet"]) .ai-chat-box {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 18px;
}
:where(body[data-page="diet"]) .ai-messages {
  min-height: 160px;
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
:where(body[data-page="diet"]) .ai-msg {
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 0.85rem;
  line-height: 1.55;
  max-width: 88%;
}
:where(body[data-page="diet"]) .ai-msg.user { align-self: flex-end; background: var(--accent-gradient); color: #fff; border-bottom-right-radius: 3px; }
:where(body[data-page="diet"]) .ai-msg.bot { align-self: flex-start; background: var(--secondary-container); color: var(--text-primary); border-bottom-left-radius: 3px; }
:where(body[data-page="diet"]) .ai-msg.thinking { align-self: flex-start; background: var(--secondary-container); color: var(--text-secondary); font-style: italic; }
:where(body[data-page="diet"]) .ai-input-row { display: flex; gap: 8px; }
:where(body[data-page="diet"]) .ai-input {
  flex: 1;
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 0.85rem;
  color: var(--text-primary);
  font-family: var(--font-family);
  resize: none;
}
:where(body[data-page="diet"]) .ai-input:focus { outline: none; border-color: var(--accent-color); }
:where(body[data-page="diet"]) .ai-send { padding: 9px 18px; background: var(--accent-gradient); color: #fff; border: none; border-radius: 10px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: opacity 0.2s; font-family: var(--font-family); }
:where(body[data-page="diet"]) .ai-send:hover { opacity: 0.88; }
:where(body[data-page="diet"]) .ai-send:disabled { opacity: 0.45; cursor: not-allowed; }

/* Perfil nutricional */
:where(body[data-page="diet"]) .profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
:where(body[data-page="diet"]) .profile-field {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 12px 14px;
}
:where(body[data-page="diet"]) .profile-field label { display: block; font-size: 0.73rem; color: var(--text-secondary); margin-bottom: 5px; font-weight: 600; }
:where(body[data-page="diet"]) .profile-field input, :where(body[data-page="diet"]) .profile-field select {
  width: 100%; box-sizing: border-box;
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 0.83rem;
  color: var(--text-primary);
  font-family: var(--font-family);
}
:where(body[data-page="diet"]) .profile-field input:focus, :where(body[data-page="diet"]) .profile-field select:focus { outline: none; border-color: var(--accent-color); }

/* ─────────────────────────────────────────────────────
 MODAL DE RECETA
───────────────────────────────────────────────────── */
:where(body[data-page="diet"]) .recipe-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.52);
  backdrop-filter: blur(5px);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  opacity: 0; pointer-events: none;
  transition: opacity 0.25s;
}
:where(body[data-page="diet"]) .recipe-overlay.open { opacity: 1; pointer-events: all; }
:where(body[data-page="diet"]) .recipe-modal {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  max-width: 540px; width: 100%;
  max-height: 88vh; overflow-y: auto;
  padding: 24px;
  transform: translateY(18px);
  transition: transform 0.25s;
}
:where(body[data-page="diet"]) .recipe-overlay.open .recipe-modal { transform: translateY(0); }
:where(body[data-page="diet"]) .rm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
:where(body[data-page="diet"]) .rm-close { background: none; border: none; font-size: 22px; cursor: pointer; color: var(--text-secondary); line-height: 1; transition: color 0.15s; }
:where(body[data-page="diet"]) .rm-close:hover { color: var(--text-primary); }
:where(body[data-page="diet"]) .rm-icon { font-size: 3rem; text-align: center; margin: 6px 0 14px; }
:where(body[data-page="diet"]) .rm-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
:where(body[data-page="diet"]) .rm-badge { background: var(--secondary-container); border: 1px solid var(--glass-border); border-radius: 20px; padding: 3px 10px; font-size: 0.74rem; font-weight: 600; }
:where(body[data-page="diet"]) .rm-desc { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 14px; }

:where(body[data-page="diet"]) .portion-bar {
  display: flex; align-items: center; gap: 10px;
  background: var(--secondary-container); border-radius: 10px;
  padding: 10px 14px; margin-bottom: 16px;
}
:where(body[data-page="diet"]) .portion-bar label { font-size: 0.8rem; color: var(--text-secondary); flex: 1; }
:where(body[data-page="diet"]) .pbtn {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px solid var(--accent-color); background: transparent;
  color: var(--accent-color); font-size: 16px; font-weight: 700;
  cursor: pointer; line-height: 1; transition: all 0.15s;
}
:where(body[data-page="diet"]) .pbtn:hover { background: var(--accent-color); color: #fff; }
:where(body[data-page="diet"]) .pcount { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); min-width: 22px; text-align: center; }

:where(body[data-page="diet"]) .rm-section { font-size: 0.85rem; font-weight: 700; margin: 14px 0 8px; color: var(--text-primary); }
:where(body[data-page="diet"]) .ingredient-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 14px; }
:where(body[data-page="diet"]) .itag { background: var(--secondary-container); border: 1px solid var(--glass-border); border-radius: 20px; padding: 3px 10px; font-size: 0.77rem; }
:where(body[data-page="diet"]) .recipe-steps { list-style: none; padding: 0; margin: 0; counter-reset: steps; }
:where(body[data-page="diet"]) .recipe-steps li {
  counter-increment: steps; padding: 9px 0 9px 38px;
  position: relative; border-bottom: 1px solid var(--glass-border);
  font-size: 0.84rem; line-height: 1.55; color: var(--text-primary);
}
:where(body[data-page="diet"]) .recipe-steps li:last-child { border-bottom: none; }
:where(body[data-page="diet"]) .recipe-steps li::before {
  content: counter(steps); position: absolute; left: 0; top: 10px;
  width: 25px; height: 25px; border-radius: 50%;
  background: var(--accent-gradient); color: #fff;
  font-size: 0.73rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
:where(body[data-page="diet"]) .rm-macro-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
:where(body[data-page="diet"]) .rm-macro { background: var(--secondary-container); border: 1px solid var(--glass-border); border-radius: 10px; padding: 7px 12px; text-align: center; flex: 1; min-width: 70px; }
:where(body[data-page="diet"]) .rm-macro .mv { font-size: 1rem; font-weight: 800; color: var(--accent-color); }
:where(body[data-page="diet"]) .rm-macro .ml { font-size: 0.68rem; color: var(--text-secondary); }

/* Modal selector receta para planificador */
:where(body[data-page="diet"]) .plan-recipe-list { max-height: 340px; overflow-y: auto; }
:where(body[data-page="diet"]) .plan-recipe-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px; cursor: pointer;
  transition: background 0.15s;
}
:where(body[data-page="diet"]) .plan-recipe-item:hover { background: var(--secondary-container); }
:where(body[data-page="diet"]) .pri-emoji { font-size: 1.4rem; }
:where(body[data-page="diet"]) .pri-info { flex: 1; }
:where(body[data-page="diet"]) .pri-name { font-size: 0.87rem; font-weight: 600; }
:where(body[data-page="diet"]) .pri-meta { font-size: 0.73rem; color: var(--text-secondary); }

/* Chips de integración */
:where(body[data-page="diet"]) .integrations-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
:where(body[data-page="diet"]) .int-chip {
  display: flex; align-items: center; gap: 5px;
  background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 20px;
  padding: 5px 12px; font-size: 0.76rem; text-decoration: none;
  color: var(--text-secondary); transition: all 0.15s;
}
:where(body[data-page="diet"]) .int-chip:hover { border-color: var(--accent-color); color: var(--accent-color); }

/* Botón genérico secundario */
:where(body[data-page="diet"]) .btn-secondary {
  padding: 8px 16px; border-radius: 10px;
  border: 1.5px solid var(--accent-color); background: transparent;
  color: var(--accent-color); font-size: 0.83rem; font-weight: 600;
  cursor: pointer; transition: all 0.2s; font-family: var(--font-family);
}
:where(body[data-page="diet"]) .btn-secondary:hover { background: var(--accent-color); color: #fff; }

@media (max-width: 580px) {
  :where(body[data-page="diet"]) .add-food-form { grid-template-columns: 1fr 1fr; }
  :where(body[data-page="diet"]) .add-food-form .aff-btn { grid-column: 1 / -1; }
}

/* ── Módulos y filtros en el panel lateral ── */
:where(body[data-page="diet"]) .sidebar-panel-section {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

:where(body[data-page="diet"]) .sidebar-panel-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin: 4px 0 8px;
}

:where(body[data-page="diet"]) .sidebar-diet-tabs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}

:where(body[data-page="diet"]) .sidebar-diet-tabs .diet-tab {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  white-space: normal;
}

:where(body[data-page="diet"]) .sidebar-filter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:where(body[data-page="diet"]) .sidebar-filter-list .filter-pill {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  justify-content: flex-start;
}
</style>
