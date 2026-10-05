# Extrae de una página antigua de public/ lo que hace falta para portarla:
#   - estilos propios (<style> del <head>)
#   - cuerpo sin la barra lateral, el overlay ni los <script>
#   - scripts inline y externos
# con la sangría normalizada a 2 espacios.
# Uso: python page_parts.py public/x.html [style|body|scripts|all]
import re, sys

def reindent(text, base=None):
    lines = text.split('\n')
    while lines and not lines[0].strip(): lines.pop(0)
    while lines and not lines[-1].strip(): lines.pop()
    ind = [len(l) - len(l.lstrip(' ')) for l in lines if l.strip()]
    b = min(ind) if ind else 0
    out = []
    for l in lines:
        if not l.strip():
            out.append('')
            continue
        n = len(l) - len(l.lstrip(' ')) - b
        out.append(' ' * (n // 2 if n > 0 else 0) + l.lstrip(' '))
    return '\n'.join(out)

def parts(path):
    s = open(path, encoding='utf-8').read()
    head = s[:s.index('<body')]
    styles = re.findall(r'<style[^>]*>([\s\S]*?)</style>', head)
    body = s[s.index('<body'):]
    body = body[body.index('>') + 1:body.rindex('</body>')]
    body = re.sub(r'<nav class="mobile-sidebar"[\s\S]*?</nav>', '', body)
    body = re.sub(r'<div class="mobile-overlay"></div>', '', body)
    scripts_inline = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', body)
    scripts_src = re.findall(r'<script[^>]*\bsrc="([^"]+)"', s)
    body = re.sub(r'<script[\s\S]*?</script>', '', body)
    body = re.sub(r'\n\s*\n+', '\n', body)
    return {
        'style': '\n\n'.join(reindent(x) for x in styles),
        'body': reindent(body),
        'scripts': '\n\n/* ---- */\n\n'.join(reindent(x) for x in scripts_inline),
        'src': scripts_src,
    }

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    p = parts(sys.argv[1])
    what = sys.argv[2] if len(sys.argv) > 2 else 'all'
    if what in ('style', 'all'): print('=== STYLE ===\n' + p['style'])
    if what in ('body', 'all'): print('=== BODY ===\n' + p['body'])
    if what in ('scripts', 'all'): print('=== SCRIPTS ===\n' + p['scripts'])
    if what in ('src', 'all'): print('=== SRC ===\n' + '\n'.join(p['src']))
