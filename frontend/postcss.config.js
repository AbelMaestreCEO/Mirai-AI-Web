// https://github.com/michael-ciniawsky/postcss-load-config

import autoprefixer from 'autoprefixer';

// Quasar atenúa todo lo deshabilitado (`.disabled, [disabled] { opacity: .6
// !important; cursor: not-allowed !important }`), también los botones y campos
// normales de las páginas migradas, que en las antiguas se veían según su
// propia hoja. Esas reglas se limitan aquí a los componentes de Quasar (q-*).
const quasarDisabledOnlyOnComponents = {
  postcssPlugin: 'quasar-disabled-only-on-components',
  Rule(rule) {
    const selectors = rule.selectors;
    if (!selectors.every((s) => /^(\.disabled|\[disabled\])( \*)?$/.test(s))) return;
    rule.selectors = selectors.map((s) => s.replace(/^(\.disabled|\[disabled\])/, '$1:is([class^="q-"], [class*=" q-"])'));
  },
};

// Con `backdrop-filter` seguido de `-webkit-backdrop-filter` (como escriben
// las hojas antiguas), el minificador se queda solo con el prefijado, que
// Chrome no aplica: se perdía el desenfoque. Se quita el prefijado escrito a
// mano y autoprefixer lo vuelve a añadir, delante del estándar.
const backdropFilterPrefixFirst = {
  postcssPlugin: 'backdrop-filter-prefix-first',
  Rule(rule) {
    if (!rule.some((node) => node.type === 'decl' && node.prop === 'backdrop-filter')) return;
    rule.each((node) => {
      if (node.type === 'decl' && node.prop === '-webkit-backdrop-filter') node.remove();
    });
  },
};

export default {
  plugins: [
    quasarDisabledOnlyOnComponents,
    backdropFilterPrefixFirst,
    autoprefixer({
      overrideBrowserslist: ['baseline widely available'],
    }),
  ],
};
