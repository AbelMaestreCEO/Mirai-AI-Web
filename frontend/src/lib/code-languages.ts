// Nombre visible del lenguaje de un bloque de código.
//
// La IA etiqueta los bloques como le parece (```py, ```c++, ```xlsx, ```Excel…)
// o no los etiqueta. Aquí se normaliza la etiqueta a un nombre legible y, si no
// hay etiqueta, se intenta deducir el lenguaje por el contenido.

// clave canónica → nombre visible
const LABELS: Record<string, string> = {
  excel: 'Excel',
  vba: 'VBA',
  csv: 'CSV',
  tsv: 'TSV',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  fsharp: 'F#',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  objectivec: 'Objective-C',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  dart: 'Dart',
  scala: 'Scala',
  r: 'R',
  julia: 'Julia',
  matlab: 'MATLAB',
  lua: 'Lua',
  perl: 'Perl',
  haskell: 'Haskell',
  elixir: 'Elixir',
  erlang: 'Erlang',
  clojure: 'Clojure',
  lisp: 'Lisp',
  ocaml: 'OCaml',
  groovy: 'Groovy',
  vbnet: 'VB.NET',
  pascal: 'Pascal',
  fortran: 'Fortran',
  cobol: 'COBOL',
  assembly: 'Assembly',
  zig: 'Zig',
  nim: 'Nim',
  solidity: 'Solidity',
  arduino: 'Arduino',
  glsl: 'GLSL',
  html: 'HTML',
  xml: 'XML',
  svg: 'SVG',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  vue: 'Vue',
  svelte: 'Svelte',
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
  env: '.env',
  sql: 'SQL',
  graphql: 'GraphQL',
  bash: 'Bash',
  powershell: 'PowerShell',
  batch: 'Batch',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  nginx: 'Nginx',
  terraform: 'Terraform',
  protobuf: 'Protobuf',
  markdown: 'Markdown',
  latex: 'LaTeX',
  mermaid: 'Mermaid',
  regex: 'Regex',
  diff: 'Diff',
  http: 'HTTP',
  log: 'Log',
  plaintext: 'Texto',
};

// alias → clave canónica (las claves canónicas valen como alias de sí mismas)
const ALIASES: Record<string, string> = {
  xlsx: 'excel', xls: 'excel', xlsm: 'excel', formula: 'excel', formulas: 'excel', fórmula: 'excel',
  sheets: 'excel', 'google-sheets': 'excel', spreadsheet: 'excel', 'excel-formula': 'excel',
  vb: 'vba', vbscript: 'vba',
  py: 'python', python3: 'python', py3: 'python', ipython: 'python',
  js: 'javascript', node: 'javascript', nodejs: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript',
  'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', h: 'c',
  'c#': 'csharp', cs: 'csharp', dotnet: 'csharp',
  'f#': 'fsharp', fs: 'fsharp',
  kt: 'kotlin', kts: 'kotlin',
  'objective-c': 'objectivec', objc: 'objectivec',
  golang: 'go',
  rs: 'rust',
  rb: 'ruby',
  jl: 'julia',
  pl: 'perl',
  hs: 'haskell',
  ex: 'elixir', exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure', cljs: 'clojure',
  elisp: 'lisp', 'common-lisp': 'lisp', scheme: 'lisp', racket: 'lisp',
  ml: 'ocaml',
  'vb.net': 'vbnet',
  delphi: 'pascal',
  asm: 'assembly', nasm: 'assembly', x86asm: 'assembly',
  sol: 'solidity',
  ino: 'arduino',
  hlsl: 'glsl', shader: 'glsl',
  htm: 'html', xhtml: 'html',
  yml: 'yaml',
  jsonc: 'json', json5: 'json',
  cfg: 'ini', conf: 'ini', properties: 'ini',
  dotenv: 'env',
  mysql: 'sql', postgresql: 'sql', postgres: 'sql', psql: 'sql', sqlite: 'sql', plsql: 'sql', tsql: 'sql',
  gql: 'graphql',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', fish: 'bash',
  ps: 'powershell', ps1: 'powershell', pwsh: 'powershell',
  bat: 'batch', cmd: 'batch',
  docker: 'dockerfile',
  make: 'makefile', mk: 'makefile',
  tf: 'terraform', hcl: 'terraform',
  proto: 'protobuf',
  md: 'markdown',
  tex: 'latex',
  patch: 'diff',
  text: 'plaintext', txt: 'plaintext', plain: 'plaintext',
};

/** Clave canónica de una etiqueta de bloque (```C++ → 'cpp'); '' si no hay etiqueta. */
export function normalizeLang(raw: string): string {
  const tag = raw.trim().split(/\s+/)[0]?.toLowerCase().replace(/^\{?\.?|\}$/g, '') ?? '';
  if (!tag) return '';
  if (tag in LABELS) return tag;
  return ALIASES[tag] ?? tag;
}

/** Nombre visible de una clave; las desconocidas se muestran tal cual llegaron. */
export function langLabel(lang: string): string {
  return LABELS[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}

/** Todas las líneas no vacías tienen el mismo número (≥1) de separadores. */
function looksDelimited(lines: string[], sep: string): boolean {
  if (lines.length < 2) return false;
  const count = (l: string) => l.split(sep).length - 1;
  const first = count(lines[0] ?? '');
  return first >= 1 && lines.every((l) => count(l) === first);
}

/** Deduce el lenguaje de un bloque sin etiqueta. '' si no está claro. */
export function detectLang(code: string): string {
  const src = code.trim();
  if (!src) return '';
  const lines = src.split(/\r?\n/).filter((l) => l.trim());

  if (/^=\s*[\p{L}][\p{L}\d._]*\s*\(/u.test(src) || /^=\s*[A-Z]{1,3}\$?\d+/.test(src)) return 'excel';
  if (/^\s*(Sub|Function)\s+\w+\s*\(|^\s*End Sub\b|^\s*Dim\s+\w+\s+As\b/im.test(src)) return 'vba';
  if (/^<\?php/.test(src)) return 'php';
  if (/^#!.*\b(bash|sh|zsh)\b/.test(src)) return 'bash';
  if (/^#!.*\bpython/.test(src)) return 'python';
  if (/^\s*#include\s*[<"]/m.test(src)) {
    return /\bstd::|\bcout\b|\bclass\s+\w+|\btemplate\s*<|\bnamespace\b/.test(src) ? 'cpp' : 'c';
  }
  if (/\busing System\b|\bConsole\.Write(Line)?\(/.test(src)) return 'csharp';
  if (/\bpublic\s+(static\s+)?(class|void)\b|\bSystem\.out\.print/.test(src)) return 'java';
  if (/\bfn\s+main\s*\(|\blet\s+mut\b|\bprintln!\(/.test(src)) return 'rust';
  if (/^package\s+main\b|\bfmt\.Print/m.test(src)) return 'go';
  if (/^\s*(<!DOCTYPE html|<html\b)/i.test(src)) return 'html';
  if (/^\s*<\?xml\b/.test(src)) return 'xml';
  if (/^\s*<svg\b/.test(src)) return 'svg';
  if (/^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|VIEW|INDEX|DATABASE)|ALTER\s+TABLE|WITH\s+\w+\s+AS)\b/i.test(src)) {
    return 'sql';
  }
  if (/^\s*(def\s+\w+\s*\(.*\)\s*(->.*)?:|from\s+[\w.]+\s+import\b|import\s+[\w.]+(\s+as\s+\w+)?\s*$|class\s+\w+(\(.*\))?:\s*$)/m.test(src)) {
    return 'python';
  }
  if (/^\s*(\$\s|sudo\s|npm\s|npx\s|pnpm\s|yarn\s|pip\s|git\s|cd\s|apt(-get)?\s|brew\s|curl\s|docker\s)/m.test(src)) return 'bash';
  if (/^\s*(\$\w+\s*=|Get-\w+|Set-\w+|Write-Host)\b/m.test(src)) return 'powershell';
  if (/^[[{]/.test(src)) {
    try {
      JSON.parse(src);
      return 'json';
    } catch {
      // No es JSON; se sigue probando.
    }
  }
  if (/\b(const|let|var)\s+\w+\s*=|\bfunction\s*\w*\s*\(|=>|\bconsole\.log\(|\bimport\s+.+\s+from\s+['"]/.test(src)) {
    return /:\s*(string|number|boolean|any)\b|\binterface\s+\w+|\btype\s+\w+\s*=/.test(src) ? 'typescript' : 'javascript';
  }
  if (/^\s*[.#]?[\w-][\w\s.#:>,-]*\{[^}]*:[^}]*;[^}]*\}/m.test(src)) return 'css';
  if (/^\s*<([a-z][\w-]*)\b[^>]*>[\s\S]*<\/\1>\s*$/i.test(src)) return 'html';
  if (looksDelimited(lines, '\t')) return 'tsv';
  if (looksDelimited(lines, ',') || looksDelimited(lines, ';')) return 'csv';
  return '';
}
