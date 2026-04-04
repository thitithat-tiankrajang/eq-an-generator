// boardConstants.js
// Shared constants used by both bingoGenerator.js and crossBingoPlacement.js.
// Extracted here to break the circular dependency between those two modules.

export const OPS_SET   = new Set(['+', '-', '×', '÷', '+/-', '×/÷']);
export const WILDS_SET = new Set(['?', '+/-', '×/÷']);
export const HEAVY_SET = new Set(['10','11','12','13','14','15','16','17','18','19','20']);

// ── Description board 15×15 ───────────────────────────────────────────────────
// px1=normal, px2=letter×2, px3=letter×3, px3star=letter×3+star, ex2=word×2, ex3=word×3
export const DESCRIPTION_BOARD = [
  ['ex3','px1','px1','px2','px1','px1','px1','ex3','px1','px1','px1','px2','px1','px1','ex3'],
  ['px1','ex2','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','ex2','px1'],
  ['px1','px1','ex2','px1','px1','px1','px2','px1','px2','px1','px1','px1','ex2','px1','px1'],
  ['px2','px1','px1','ex2','px1','px1','px1','px2','px1','px1','px1','ex2','px1','px1','px2'],
  ['px1','px1','px1','px1','px3','px1','px1','px1','px1','px1','px3','px1','px1','px1','px1'],
  ['px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1'],
  ['px1','px1','px2','px1','px1','px1','px2','px1','px2','px1','px1','px1','px2','px1','px1'],
  ['ex3','px1','px1','px2','px1','px1','px1','px3star','px1','px1','px1','px2','px1','px1','ex3'],
  ['px1','px1','px2','px1','px1','px1','px2','px1','px2','px1','px1','px1','px2','px1','px1'],
  ['px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1'],
  ['px1','px1','px1','px1','px3','px1','px1','px1','px1','px1','px3','px1','px1','px1','px1'],
  ['px2','px1','px1','ex2','px1','px1','px1','px2','px1','px1','px1','ex2','px1','px1','px2'],
  ['px1','px1','ex2','px1','px1','px1','px2','px1','px2','px1','px1','px1','ex2','px1','px1'],
  ['px1','ex2','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','ex2','px1'],
  ['ex3','px1','px1','px2','px1','px1','px1','ex3','px1','px1','px1','px2','px1','px1','ex3'],
];
