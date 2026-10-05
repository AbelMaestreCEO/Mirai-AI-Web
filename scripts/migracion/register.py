"""Da de alta una página migrada.

Uso: python scripts/migracion/register.py <slug> <Componente> "<título>" [recurso.js ...]

Los recursos van sin "/" inicial (Git Bash convierte "/x" en una ruta de Windows).

- añade la ruta a frontend/src/router/routes.ts (dentro de MainLayout);
- añade el slug a MIGRATED (legacy.ts) y MIGRATED_PAGES (worker.ts y sw.js);
- quita '/<slug>' y los recursos indicados de la precarga de sw.js y sube su
  CACHE_NAME.

Los archivos antiguos de public/ se borran aparte (git rm).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def edit(rel: str, fn) -> None:
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    new = fn(s)
    if new == s:
        sys.exit(f'{rel}: sin cambios (¿ya registrada?)')
    p.write_text(new, encoding='utf-8')


def add_to_set(s: str, slug: str) -> str:
    # Último elemento del Set de páginas migradas: "  'a', 'b',\n]);"
    m = re.search(r"(MIGRATED(?:_PAGES)? = new Set(?:<string>)?\(\[\n(?:.*\n)*?)(\]\);)", s)
    if not m:
        sys.exit('no encuentro el Set de páginas migradas')
    body = m.group(1)
    if f"'{slug}'" in body:
        return s
    lines = body.rstrip('\n').split('\n')
    last = lines[-1]
    if len(last) + len(slug) + 4 <= 80:
        lines[-1] = f"{last} '{slug}',"
    else:
        lines.append(f"  '{slug}',")
    return s[: m.start()] + '\n'.join(lines) + '\n' + m.group(2) + s[m.end():]


def main() -> None:
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    slug, component, title, *assets = sys.argv[1:]

    route = (
        f"      {{ path: '{slug}', name: '{slug}', component: () => import('@/pages/{component}.vue'), "
        f"meta: {{ title: '{title}' }} }},\n"
    )

    def add_route(s: str) -> str:
        anchor = "      { path: 'settings', name: 'settings',"
        if f"name: '{slug}'" in s:
            return s
        return s.replace(anchor, route + anchor, 1)

    edit('frontend/src/router/routes.ts', add_route)
    edit('frontend/src/lib/legacy.ts', lambda s: add_to_set(s, slug))
    edit('workers/worker.ts', lambda s: add_to_set(s, slug))

    def sw(s: str) -> str:
        s = add_to_set(s, slug)
        for entry in [f'/{slug}', *[f"/{a.lstrip('/')}" for a in assets]]:
            s = re.sub(rf"^  '{re.escape(entry)}',\n", '', s, flags=re.M)
        return re.sub(
            r"mirai-ai-v(\d+)",
            lambda m: f"mirai-ai-v{int(m.group(1)) + 1}",
            s,
            count=1,
        )

    edit('public/sw.js', sw)
    print(f'{slug} registrada')


if __name__ == '__main__':
    main()
