# Herramientas de la migración a Quasar

Ayudan a portar `public/<slug>.html` a `frontend/src/pages/`. Se borran cuando
termine la migración.

- `mkpage.py <slug> <Componente>`: genera el esqueleto de la página Vue (plantilla
  con `MenuToggle`/`AppLink`, rutas de recursos absolutas y el CSS propio de la
  página limitado a ella). El JS de la página se porta a mano.
- `scope_css.py <slug>` (stdin → stdout): prefija cada selector con
  `:where(body[data-page="<slug>"])`. `:where()` no suma especificidad, así que
  las reglas pesan lo mismo que en la página antigua pero no afectan a otras.
- `page_parts.py <archivo> [style|body|scripts|src]`: muestra las partes de una
  página antigua sin la barra lateral.

Al migrar una página: añadir su ruta en `frontend/src/router/routes.ts`, su slug
en `MIGRATED` (`frontend/src/lib/legacy.ts`), `MIGRATED_PAGES`
(`workers/worker.ts` y `public/sw.js`), quitarla de la precarga de `public/sw.js`
y borrar sus archivos de `public/`.
