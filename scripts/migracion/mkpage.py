# Genera el esqueleto de una página Vue a partir de public/<slug>.html.
# Uso: python scripts/migracion/mkpage.py <slug> <NombreComponente> [--force]
# Deja la plantilla convertida y el CSS limitado a la página; el JS se porta a
# mano. Imprime avisos de lo que necesita conversión manual.
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from page_parts import parts, reindent
from scope_css import scope_css

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SLUGS = {os.path.splitext(f)[0] for f in os.listdir(os.path.join(ROOT, 'public')) if f.endswith('.html')}

def convert(html):
    warnings = []
    # botón hamburguesa -> componente compartido
    html = re.sub(r'<button class="mobile-menu-toggle"[\s\S]*?</button>', '<MenuToggle />', html)
    # año del pie
    html = re.sub(r'<script>\s*document\.write\(new Date\(\)\.getFullYear\(\)\)\s*</script>', '{{ year }}', html)
    # rutas relativas de recursos -> absolutas
    def abs_src(m):
        attr, url = m.group(1), m.group(2)
        if re.match(r'^(/|https?:|data:|#|mailto:|tel:|blob:|\{)', url) or url == '':
            return m.group(0)
        return f'{attr}="/{url}"'
    html = re.sub(r'\b(src|poster)="([^"]*)"', abs_src, html)
    # enlaces internos -> AppLink
    def link(m):
        attrs, inner = m.group(1), m.group(2)
        hm = re.search(r'\bhref="([^"]*)"', attrs)
        if not hm:
            return m.group(0)
        href = hm.group(1)
        h = href.replace('https://ai.aberumirai.com', '')
        path, _, query = h.partition('?')
        slug = path.lstrip('/')
        if slug.endswith('.html'):
            slug = slug[:-5]
        if path in ('', '/') and href:
            slug = ''
        elif slug not in SLUGS:
            return m.group(0)
        rest = attrs.replace(hm.group(0), '').strip()
        q = f' query="{query}"' if query else ''
        return f'<AppLink to="{slug}"{q}{(" " + rest) if rest else ""}>{inner}</AppLink>'
    html = re.sub(r'<a\b([^>]*)>([\s\S]*?)</a>', link, html)
    for ev in sorted(set(re.findall(r'\bon(\w+)="', html))):
        warnings.append(f'atributo on{ev}= (convertir a @{ev})')
    if '{{' in html.replace('{{ year }}', ''):
        warnings.append('hay {{ en el HTML: Vue lo interpretará')
    return html, warnings

def main():
    slug, comp = sys.argv[1], sys.argv[2]
    force = '--force' in sys.argv
    p = parts(os.path.join(ROOT, 'public', slug + '.html'))
    template, warnings = convert(p['body'])
    uses_link = '<AppLink' in template
    uses_year = '{{ year }}' in template
    imports = ["import MenuToggle from '@/components/MenuToggle.vue';"] if '<MenuToggle' in template else []
    if uses_link:
        imports.append("import AppLink from '@/components/AppLink.vue';")
    script = '\n'.join([f'// Migración de public/{slug}.html.'] + imports)
    if uses_year:
        script += '\n\nconst year = new Date().getFullYear();'
    css = scope_css(p['style_post'], slug) if p['style_post'].strip() else ''
    # El CSS que la página antigua ponía antes de styles.css va a
    # css/before-styles/<slug>.css, que se carga antes que ella (ver
    # css/before-styles.css).
    if p['style_pre'].strip():
        pre_out = os.path.join(ROOT, 'frontend', 'src', 'css', 'before-styles', slug + '.css')
        os.makedirs(os.path.dirname(pre_out), exist_ok=True)
        header = f'/* CSS de public/{slug}.html que iba antes de styles.css, limitado a la página. */\n'
        open(pre_out, 'w', encoding='utf-8', newline='\n').write(header + scope_css(p['style_pre'], slug) + '\n')
        print(f'escrito {pre_out} (añádelo a css/before-styles.css)')
    indented = '\n'.join(('  ' + l) if l else '' for l in template.split('\n'))
    vue = f'<template>\n{indented}\n</template>\n\n<script setup lang="ts">\n{script}\n</script>\n'
    if css:
        vue += f'\n<style>\n/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */\n{css}\n</style>\n'
    out = os.path.join(ROOT, 'frontend', 'src', 'pages', comp + '.vue')
    if os.path.exists(out) and not force:
        sys.exit(f'ya existe {out} (usa --force)')
    open(out, 'w', encoding='utf-8', newline='\n').write(vue)
    print(f'escrito {out}: {len(vue.splitlines())} líneas')
    print('scripts externos:', ', '.join(p['src']))
    print('líneas de JS inline:', len(p['scripts'].splitlines()))
    for w in warnings:
        print('AVISO:', w)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
