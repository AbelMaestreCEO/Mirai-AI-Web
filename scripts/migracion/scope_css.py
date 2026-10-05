# Limita el CSS propio de una página antigua a esa página en la app.
#
# Cada selector pasa a ir precedido de :where(body[data-page="<slug>"]).
# :where() no suma especificidad, así que la regla pesa exactamente lo mismo
# que en la página antigua (y sigue perdiendo, por ejemplo, contra las reglas
# de styles.css que apartan el contenido del menú lateral), pero ya no afecta
# a otras páginas aunque su CSS siga cargado en la SPA.
#
# Casos especiales:
#   html / :root / [data-theme=...] al principio -> el prefijo va detrás de ese
#   primer compuesto (data-theme está en <html>, data-page en <body>).
#   body al principio -> body:where([data-page="<slug>"]).
# @media / @supports se recorren; @keyframes / @font-face se dejan igual.
import re, sys

def split_selectors(sel):
    out, depth, cur = [], 0, ''
    for ch in sel:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    return out

def first_compound(s):
    depth = 0
    for i, ch in enumerate(s):
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        elif depth == 0 and ch in ' >+~':
            return s[:i], s[i:]
    return s, ''

def scope_selector(sel, slug):
    lead = re.match(r'^\s*', sel).group(0)
    s = ' '.join(sel.split())
    if not s:
        return sel
    page = f'[data-page="{slug}"]'
    where = f':where(body{page})'
    head, rest = first_compound(s)
    r = rest.lstrip()
    if re.match(r'^(html|:root)(?![\w-])', head) or head.startswith('[data-theme'):
        if not r:
            # Regla sobre <html> (variables, fondo...): solo con la página activa.
            return lead + f'{head}:where(:has(> body{page}))'
        comb = ''
        if r[0] in '>+~':
            comb, r = r[0] + ' ', r[1:].lstrip()
        if r.startswith('body'):
            h2, r2 = first_compound(r)
            return lead + f'{head} {comb}{h2}:where({page}){r2}'
        return lead + f'{head} {comb}{where} {r}'
    if head.startswith('body'):
        return lead + f'{head}:where({page}){rest}'
    return lead + f'{where} {s}'

def scope_css(css, slug):
    out, i, n = [], 0, len(css)
    while i < n:
        if css[i].isspace():
            out.append(css[i]); i += 1; continue
        # comentarios
        if css.startswith('/*', i):
            j = css.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(css[i:j]); i = j; continue
        if css[i] == '@':
            m = re.match(r'@([\w-]+)', css[i:])
            name = m.group(1) if m else ''
            brace = css.find('{', i)
            semi = css.find(';', i)
            if semi != -1 and (brace == -1 or semi < brace):
                out.append(css[i:semi + 1]); i = semi + 1; continue
            end = match_brace(css, brace)
            if name in ('media', 'supports', 'container', 'layer'):
                out.append(css[i:brace + 1] + scope_css(css[brace + 1:end], slug) + '}')
            else:
                out.append(css[i:end + 1])
            i = end + 1; continue
        brace = css.find('{', i)
        if brace == -1:
            out.append(css[i:]); break
        sel = css[i:brace]
        end = match_brace(css, brace)
        stripped = sel.strip()
        if stripped:
            pre = sel[:len(sel) - len(sel.lstrip())]
            scoped = ','.join(scope_selector(s, slug) for s in split_selectors(sel.strip()))
            out.append(pre + scoped + ' ' + css[brace:end + 1])
        else:
            out.append(css[i:end + 1])
        i = end + 1
    return ''.join(out)

def match_brace(css, start):
    depth = 0
    for j in range(start, len(css)):
        if css[j] == '{': depth += 1
        elif css[j] == '}':
            depth -= 1
            if depth == 0: return j
    return len(css) - 1

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdin.reconfigure(encoding='utf-8')
    print(scope_css(sys.stdin.read(), sys.argv[1]))
