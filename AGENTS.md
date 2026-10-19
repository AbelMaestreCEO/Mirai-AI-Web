## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Exception: if the user names the exact file to change, go straight to that file; skip graphify queries for that task.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After finishing a set of code changes (not after every small edit), run `graphify update .` once to keep the graph current (AST-only, no API cost).
- Never open graphify-out/graph.json directly; always go through `graphify query/path/explain`.
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## Contexto del proyecto
- Cloudflare Worker en `workers/` + frontend en `frontend/` (build con `scripts/build-frontend.mjs`). TypeScript. Esquemas SQL en `db/`; `android/` solo si la tarea es de la app móvil.
- Comandos: `npm run dev` (puerto 8787), `npm run dev:frontend`, `npm run typecheck`, `npm run deploy`.
- No leer ni editar: `node_modules/`, `package-lock.json`, `frontend/node_modules/`, `frontend/dist/`, `.wrangler/`.
