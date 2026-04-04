import { HEAVY_SET } from '@/lib/bingoGenerator';

const OPERATORS = new Set(['+', '-', '×', '÷', '+/-', '×/÷', '?']);

const SIZES = {
  sm: { dim: 36, fs: 10, ptFs: 6  },
  md: { dim: 46, fs: 13, ptFs: 7  },
  lg: { dim: 54, fs: 15, ptFs: 8  },
};

/**
 * roles:
 *  'normal'               – plain tile
 *  'locked'               – pre-filled, amber dot
 *  'locked-wild'          – locked wild tile that resolved to a choice op (shows faded suffix)
 *  'locked-wild-question' – locked ? tile resolved to a value (violet color)
 *  'rack'                 – in the rack, elevated shadow
 *  'selected'             – currently selected (blue ring + lift)
 *  'board-placed'         – placed by user on board
 *  'wild-unresolved'      – wild tile on board needing resolution (orange)
 *  'block'                – expand-mode block tile (green)
 *
 * props:
 *  points     – number badge shown bottom-right (uses source tile's value)
 *  sourceTile – original source tile; when provided, shows faded remainder for choice ops
 */
export function BingoTile({ token, role = 'normal', size = 'md', onClick, points, sourceTile }) {
  const { dim, fs, ptFs } = SIZES[size] ?? SIZES.md;

  const BASE = {
    bg: 'bg-white',
    border: 'border-stone-400',
    text: 'text-stone-800',
  };

  let borderCls = BASE.border;
  let bgCls     = BASE.bg;
  let textCls   = BASE.text;
  let shadow    = '';
  let extra     = '';

  switch (role) {
    case 'selected':
      borderCls = 'border-blue-500';
      bgCls     = 'bg-blue-50';
      shadow    = '0 0 0 3px rgba(59,130,246,0.35), 0 4px 12px rgba(59,130,246,0.25)';
      extra     = 'scale-110 cursor-pointer';
      break;

    // 🟩 LOCKED (เด่นสุด)
    case 'locked':
    case 'fixed':
      borderCls = 'border-stone-500';
      bgCls     = 'bg-white';
      shadow    = '0 2px 8px rgba(0,0,0,0.18)';
      break;

    case 'locked-wild':
      borderCls = 'border-amber-400';
      bgCls     = 'bg-white';
      shadow    = '0 2px 8px rgba(0,0,0,0.18)';
      break;

    case 'locked-wild-question':
      borderCls = 'border-violet-400';
      bgCls     = 'bg-white';
      shadow    = '0 2px 10px rgba(139,92,246,0.25)';
      break;

    // 🟫 PLAYER TILE
    case 'board-placed':
      borderCls = 'border-stone-600';
      bgCls     = 'bg-sky-100';
      textCls   = 'text-stone-900';
      shadow    = '0 1px 3px rgba(0,0,0,0.2)';
      extra     = 'cursor-pointer hover:scale-105 transition-transform';
      break;

    case 'wild-unresolved':
      borderCls = 'border-orange-500';
      bgCls     = 'bg-orange-300';
      textCls   = 'text-stone-900';
      shadow    = '0 2px 6px rgba(251,146,60,0.25)';
      extra     = 'cursor-pointer hover:scale-105 transition-transform';
      break;

    // 🟨 RACK
    case 'rack':
      borderCls = 'border-amber-400';
      bgCls     = 'bg-amber-50'; // 🔥 สว่าง
      shadow    = '0 2px 6px rgba(0,0,0,0.1)';
      extra     = 'cursor-pointer hover:scale-105';
      break;

    case 'block':
      borderCls = 'border-emerald-500';
      bgCls     = 'bg-emerald-200';
      shadow    = '0 0 8px rgba(16,185,129,0.25)';
      break;

    default:
      borderCls = 'border-stone-300';
      bgCls     = 'bg-stone-300';
      break;
  }

  // ── Tile face content ────────────────────────────────────────────────────────
  // For locked choice-op tiles: show resolved char prominently + faded rest
  let faceContent;
  if (sourceTile === '+/-' && (token === '+' || token === '-')) {
    const main   = token;
    const faded  = token === '+' ? '/−' : '/+';
    faceContent = (
      <span className="flex items-baseline leading-none" style={{ letterSpacing: -0.5 }}>
        <span>{main}</span>
        <span style={{ color: '#c7c3be', fontSize: fs * 0.62 }}>{faded}</span>
      </span>
    );
  } else if (sourceTile === '×/÷' && (token === '×' || token === '÷')) {
    const main   = token;
    const faded  = token === '×' ? '/÷' : '/×';
    faceContent = (
      <span className="flex items-baseline leading-none" style={{ letterSpacing: -0.5 }}>
        <span>{main}</span>
        <span style={{ color: '#c7c3be', fontSize: fs * 0.62 }}>{faded}</span>
      </span>
    );
  } else {
    faceContent = token || '';
  }

  // ── Points badge ─────────────────────────────────────────────────────────────
  const showPoints = points != null;

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center justify-center shrink-0 rounded-lg border-2 font-mono font-bold select-none transition-all duration-100 ${bgCls} ${borderCls} ${textCls} ${extra}`}
      style={{ width: dim, height: dim, minWidth: dim, fontSize: fs, letterSpacing: token && token.length > 2 ? -0.5 : 0, boxShadow: shadow }}
    >
      {faceContent}

      {/* Lock dot */}
      {(role === 'locked' || role === 'fixed' || role === 'locked-wild') && token && (
        <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-amber-400 opacity-90" />
      )}
      {role === 'locked-wild-question' && token && (
        <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-violet-400 opacity-90" />
      )}

      {/* Block bar */}
      {role === 'block' && (
        <div className="absolute bottom-0.5 right-0.5 w-1.5 h-0.5 rounded-sm bg-emerald-500 opacity-80" />
      )}

      {/* Selection dot */}
      {role === 'selected' && (
        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 opacity-90" />
      )}

      {/* Points badge — bottom right */}
      {showPoints && (
        <div
          className="absolute bottom-0 right-0 rounded-tl-md font-mono font-bold tabular-nums leading-none select-none"
          style={{
            fontSize:        ptFs,
            lineHeight:      1,
            padding:         '1px 2px',
            background:      'rgba(0,0,0,0.10)',
            color:           'inherit',
            opacity:         0.75,
            borderRadius:    '0 0 6px 0',
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
    <span className="block text-center font-mono mt-1" style={{ fontSize: 7, color: '#a8a29e', letterSpacing: 0.5 }}>
      {n}
    </span>
  );
}
