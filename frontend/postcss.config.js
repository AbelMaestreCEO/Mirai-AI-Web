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

export default {
  plugins: [
    quasarDisabledOnlyOnComponents,
    autoprefixer({
      overrideBrowserslist: ['baseline widely available'],
    }),
  ],
};
