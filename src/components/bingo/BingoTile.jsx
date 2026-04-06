import { HEAVY_SET } from '@/lib/bingoGenerator';

const OPERATORS = new Set(['+', '-', '×', '÷', '+/-', '×/÷', '?']);

// Single tile size used everywhere (board + rack) — keeps them identical
const TILE_DIM = 48;
const SIZES = {
  sm: { dim: 40,       fs: 17, ptFs: 7  },
  md: { dim: TILE_DIM, fs: 20, ptFs: 8  },
  lg: { dim: TILE_DIM, fs: 20, ptFs: 11  }, // alias to md so rack = board size
};

export { TILE_DIM };

// Per-token-type font size ratios (relative to TILE_DIM=48)
// Adjust these values to tune each category independently
const TOKEN_FS_RATIO = {
  smallNum:        24 / 48,   // '0'–'9'
  heavyNum:        22 / 48,   // '10'–'20' (2 chars, needs smaller font)
  plus:            28 / 48,   // '+'
  minus:           30 / 48,   // '-'
  times:           30 / 48,   // '×'
  divide:          30 / 48,   // '÷'
  plusMinus:       20 / 48,   // '+/-'
  timesDivide:     20 / 48,   // '×/÷'
  blank:           22 / 48,   // '?'
};

function tokenCategory(token) {
  if (!token) return 'smallNum';
  if (token === '?')   return 'blank';
  if (token === '+/-') return 'plusMinus';
  if (token === '×/÷') return 'timesDivide';
  if (token === '+')   return 'plus';
  if (token === '-')   return 'minus';
  if (token === '×')   return 'times';
  if (token === '÷')   return 'divide';
  if (HEAVY_SET.has(token)) return 'heavyNum';
  return 'smallNum';
}

/**
 * grid=true  → square corners, right+bottom border only (for collapse grid layout)
 * grid=false → rounded, full border-2 (rack / standalone use)
 */
export function BingoTile({ token, role = 'normal', size = 'md', onClick, points, sourceTile, grid = false, dimCss }) {
  const { dim, ptFs } = SIZES[size] ?? SIZES.md;
  // dimCss lets the board override the pixel dim with a CSS value (e.g. CSS variable).
  // When provided, scale font sizes proportionally via calc() so they track the tile size.
  const dimVal  = dimCss ?? dim;
  const fsRatio = TOKEN_FS_RATIO[tokenCategory(token)];
  const fsVal   = dimCss
    ? `calc(${dimCss} * ${fsRatio.toFixed(4)})`
    : Math.round(dim * fsRatio);
  const ptFsVal = dimCss ? `calc(${dimCss} * ${(ptFs / dim).toFixed(4)})` : ptFs;

  let bgCls   = 'bg-stone-100';
  let textCls = 'text-stone-800';
  let extra   = '';
  // In grid mode: border-r + border-b only (outer wrapper provides border-l + border-t)
  // In standalone mode: full border-2
  const BORDER_COLOR = grid ? 'border-stone-500' : 'border-stone-400';
  let borderCls = grid ? `border-r-2 border-b-2 ${BORDER_COLOR}` : `border-2 ${BORDER_COLOR}`;
  let shadow    = '';
  let outline   = '';

  switch (role) {
    case 'selected':
      bgCls     = 'bg-green-500';
      textCls   = 'text-green-900';
      borderCls = grid ? 'border-r-2 border-b-2 border-green-500' : 'border-2 border-green-500';
      extra     = 'cursor-pointer z-10 relative';
      break;

    case 'locked':
    case 'fixed':
      bgCls     = 'bg-stone-50';
      textCls   = 'text-stone-900';
      borderCls = grid ? `border-r-2 border-b-2 border-stone-500` : 'border-2 border-stone-500';
      break;

    case 'locked-wild':
      bgCls     = 'bg-stone-50';
      textCls   = 'text-stone-900';
      borderCls = grid ? 'border-r-2 border-b-2 border-stone-500' : 'border-2 border-stone-500';
      break;

    case 'locked-wild-question':
      bgCls     = 'bg-stone-50';
      textCls   = 'text-stone-900';
      borderCls = grid ? 'border-r-2 border-b-2 border-stone-500' : 'border-2 border-stone-500';
      break;

    // rack and board-placed share same look
    case 'board-placed':
    case 'rack':
      bgCls     = 'bg-green-200';
      textCls   = 'text-green-950';
      borderCls = grid
        ? 'border-r-2 border-b-2 border-green-600'
        : 'border-2 border-green-600';
      shadow    = '0 1px 4px rgba(0,0,0,0.10)';
      extra     = 'cursor-pointer';
      break;

    case 'wild-unresolved':
      bgCls     = 'bg-yellow-200';
      textCls   = 'text-yellow-900';
      borderCls = grid ? 'border-r-2 border-b-2 border-yellow-500' : 'border-2 border-yellow-500';
      extra     = 'cursor-pointer';
      break;

    case 'block':
      bgCls     = 'bg-emerald-200';
      textCls   = 'text-emerald-900';
      borderCls = grid ? 'border-r-2 border-b-2 border-emerald-500' : 'border-2 border-emerald-500';
      break;

    default:
      bgCls     = 'bg-stone-100';
      textCls   = 'text-stone-700';
      break;
  }

  // ── Face content ──────────────────────────────────────────────────────────────
  let faceContent;
  if (sourceTile === '+/-' && (token === '+' || token === '-')) {
    const faded = token === '+' ? '/−' : '/+';
    const fadedFs = dimCss
      ? `calc(${dimCss} * ${(fsRatio * 0.6).toFixed(4)})`
      : Math.round(dim * fsRatio * 0.6);
    faceContent = (
      <span className="flex items-baseline leading-none" style={{ letterSpacing: -0.5 }}>
        <span>{token}</span>
        <span style={{ color: '#a8a29e', fontSize: fadedFs }}>{faded}</span>
      </span>
    );
  } else if (sourceTile === '×/÷' && (token === '×' || token === '÷')) {
    const faded = token === '×' ? '/÷' : '/×';
    const fadedFs = dimCss
      ? `calc(${dimCss} * ${(fsRatio * 0.6).toFixed(4)})`
      : Math.round(dim * fsRatio * 0.6);
    faceContent = (
      <span className="flex items-baseline leading-none" style={{ letterSpacing: -0.5 }}>
        <span>{token}</span>
        <span style={{ color: '#a8a29e', fontSize: fadedFs }}>{faded}</span>
      </span>
    );
  } else {
    faceContent = token || '';
  }

  const rounded = grid ? 'rounded-none' : 'rounded-lg';

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center justify-center shrink-0 font-mono font-bold select-none transition-colors duration-100 ${rounded} ${bgCls} ${borderCls} ${textCls} ${outline} ${extra} transition-colors duration-100 transition-transform duration-75 active:scale-[0.96]`}
      style={{ width: dimVal, height: dimVal, minWidth: dimVal, fontSize: fsVal, letterSpacing: token && token.length > 2 ? -1 : 0, boxShadow: shadow }}
    >
      {faceContent}

      {/* Lock dot */}
      {(role === 'locked' || role === 'fixed') && token && (
        <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-stone-400" />
      )}
      {(role === 'locked-wild') && token && (
        <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-amber-400" />
      )}
      {role === 'locked-wild-question' && token && (
        <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-violet-400" />
      )}

      {/* Selection indicator */}
      {role === 'selected' && (
        <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-green-700" />
      )}

      {/* Wild resolve badge */}
      {role === 'wild-unresolved' && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center pointer-events-none z-20"
          style={{ fontSize: 9, fontWeight: 'bold' }}
        >!</div>
      )}

      {/* Points badge */}
      {points != null && (
        <div
          className="absolute bottom-0 right-0 font-mono font-bold tabular-nums leading-none select-none"
          style={{
            fontSize: ptFsVal, lineHeight: 1, padding: '1px 2px',
            background: 'rgba(0,0,0,0.12)', color: 'inherit', opacity: 0.7,
            borderRadius: grid ? '0' : '0 0 6px 0',
          }}
        >
          {points}
        </div>
      )}
    </div>
  );
}

export function SlotLabel({ n }) {
  return (
    <span className="block text-center font-mono mt-1" style={{ fontSize: 9, color: '#78716c', letterSpacing: 0 }}>
      {n}
    </span>
  );
}
