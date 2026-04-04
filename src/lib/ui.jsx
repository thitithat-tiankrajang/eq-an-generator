import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  generateBingo, isValidEquation,
  WILD_TILES, TILE_POINTS,
} from '@/lib/bingoGenerator';
import { BingoHeader }   from '@/components/bingo/BingoHeader';
import { BingoConfig, DEFAULT_SETS }   from '@/components/bingo/BingoConfig';
import { DEFAULT_ADV_CFG, buildGeneratorConfig }
                         from '@/components/bingo/BingoAdvancedConfig';
import { BingoBoard } from '@/components/bingo/BingoBoard';
import { BingoRack }     from '@/components/bingo/BingoRack';
import { BingoTile }     from '@/components/bingo/BingoTile';
import { BingoSolution } from '@/components/bingo/BingoSolution';
import { findAllSolutions, analyzePerformance, scoreEquation } from '@/lib/analysisEngine';
import { api } from '@/api/apiClient';

// ── Admin flag — graceful: default false if not authenticated ─────────────────
let IS_ADMIN = false;
try {
  const data = await api.auth.getProfile();
  IS_ADMIN = data.user?.role === 'admin';
} catch {
  // 401 / network error — AuthContext will handle the redirect to Login
}

// ── Wild tile picker options ──────────────────────────────────────────────────
function getWildOptions(tile) {
  if (tile === '+/-')  return ['+', '-'];
  if (tile === '×/÷') return ['×', '÷'];
  if (tile === '?')    return ['=', '+', '-', '×', '÷', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
  return null;
}

// ── Unique ID ─────────────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => ++_uid;

// ── Score calculator ──────────────────────────────────────────────────────────
function calcScore(boardSlots) {
  let letterTotal = 0;
  let wordMult    = 1;
  for (const slot of boardSlots) {
    if (!slot.tile) continue;
    // Wildcards: use the wildcard tile's own points, not the resolved value's points.
    // Locked positions: always px1 (bonus squares under a locked tile have no effect).
    const pts  = TILE_POINTS[slot.tile] ?? 0;
    const type = slot.isLocked ? 'px1' : (slot.slotType ?? 'px1');
    if (type === 'px2') letterTotal += pts * 2;
    else if (type === 'px3' || type === 'px3star') letterTotal += pts * 3;
    else letterTotal += pts;
    if (type === 'ex2') wordMult *= 2;
    if (type === 'ex3') wordMult *= 3;
  }
  return letterTotal * wordMult + 40;
}

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_KEY = 'bingo_session_v1';

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}

// ── Fresh per-puzzle game state ───────────────────────────────────────────────
function initPuzzleState(result) {
  return {
    boardSlots: result.boardSlots.map(s => ({ ...s, resolvedValue: s.resolvedValue ?? null })),
    rackTiles:  result.rackTiles.map(tile => ({ id: uid(), tile })),
    submitResult: null,
    timeMs:       null,
    timerStarted: false,
    analysis:     null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Config state ─────────────────────────────────────────────────────────
  const [mode,         setMode]         = useState('cross');
  const [puzzleSets,   setPuzzleSets]   = useState(DEFAULT_SETS);
  const [timerEnabled, setTimerEnabled] = useState(false);

  // ── Puzzle list state ─────────────────────────────────────────────────────
  const [puzzleList,   setPuzzleList]   = useState([]);  // array of generateBingo results
  const [puzzleStates, setPuzzleStates] = useState([]);  // per-puzzle game states (mutable)
  const [currentIdx,   setCurrentIdx]   = useState(0);

  // ── Loading / error ───────────────────────────────────────────────────────
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [genCount, setGenCount] = useState(0);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [timerMs,     setTimerMs]     = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef(null);
  const timerStartRef    = useRef(null);

  // ── Wild picker ───────────────────────────────────────────────────────────
  const [wildPicker, setWildPicker] = useState(null); // { slotIndex } | null

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);

  // ── Analysis modal ────────────────────────────────────────────────────────
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // ── Reveal solution ───────────────────────────────────────────────────────
  const [revealed, setRevealed] = useState(false);

  const genTimerRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED CURRENT STATE
  // ─────────────────────────────────────────────────────────────────────────
  const currentResult = puzzleList[currentIdx] ?? null;
  const currentState  = puzzleStates[currentIdx] ?? null;
  const boardSlots    = useMemo(() => currentState?.boardSlots ?? [], [currentState]);
  const rackTiles     = useMemo(() => currentState?.rackTiles  ?? [], [currentState]);
  const submitResult  = currentState?.submitResult ?? null;
  const timerStarted  = currentState?.timerStarted ?? false;
  const puzzleHidden  = timerEnabled && !timerStarted;

  // ─────────────────────────────────────────────────────────────────────────
  // PERSISTENCE — load on mount
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    if (saved.puzzleList)   setPuzzleList(saved.puzzleList);
    if (saved.puzzleStates) setPuzzleStates(saved.puzzleStates);
    if (saved.currentIdx != null) setCurrentIdx(saved.currentIdx);
    if (saved.puzzleSets)   setPuzzleSets(saved.puzzleSets);
    if (saved.timerEnabled != null) setTimerEnabled(saved.timerEnabled);
    if (saved.genCount)     setGenCount(saved.genCount);
  }, []);

  // PERSISTENCE — save on state change
  useEffect(() => {
    if (puzzleList.length === 0) return;
    saveSession({ puzzleList, puzzleStates, currentIdx, puzzleSets, timerEnabled, genCount });
  }, [puzzleList, puzzleStates, currentIdx, puzzleSets, timerEnabled, genCount]);

  // ─────────────────────────────────────────────────────────────────────────
  // PUZZLE STATE UPDATER
  // ─────────────────────────────────────────────────────────────────────────
  const updateCurrentState = useCallback((updater) => {
    setPuzzleStates(prev => {
      const next = [...prev];
      next[currentIdx] = updater(next[currentIdx] ?? {});
      return next;
    });
  }, [currentIdx]);

  // ─────────────────────────────────────────────────────────────────────────
  // TIMER
  // ─────────────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerActive(false);
  }, []);

  const handleStartTimer = useCallback(() => {
    const now = Date.now();
    timerStartRef.current = now;
    setTimerMs(0);
    setTimerActive(true);
    updateCurrentState(s => ({ ...s, timerStarted: true }));

    timerIntervalRef.current = setInterval(() => {
      setTimerMs(Date.now() - timerStartRef.current);
    }, 50);
  }, [updateCurrentState]);

  // Clean up timer on unmount or puzzle change
  useEffect(() => () => stopTimer(), [stopTimer]);

  // Restore timer when start puzzle
  useEffect(() => {
    if (!currentState) return;
  
    if (!timerActive && currentState.timeMs != null) {
      setTimerMs(currentState.timeMs);
    }
  }, [currentIdx, currentState, timerActive]);

  // ─────────────────────────────────────────────────────────────────────────
  // GENERATE
  // ─────────────────────────────────────────────────────────────────────────
  const generate = useCallback(() => {
    setLoading(true); setError('');
    if (genTimerRef.current) clearTimeout(genTimerRef.current);
    genTimerRef.current = setTimeout(() => {
      try {
        const results = [];
        for (const s of puzzleSets) {
          const cfg = buildGeneratorConfig(mode, s.tileCount, s.advancedCfg ?? DEFAULT_ADV_CFG);
          for (let i = 0; i < s.count; i++) {
            results.push(generateBingo(cfg));
          }
        }
        setPuzzleList(results);
        setPuzzleStates(results.map(r => initPuzzleState(r)));
        setCurrentIdx(0);
        setGenCount(n => n + 1);
        stopTimer();
        setTimerMs(0);
        setSelected(null);
        setWildPicker(null);
        setRevealed(false);
        setAnalysisOpen(false);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 20);
  }, [mode, puzzleSets, stopTimer]);

  // ─────────────────────────────────────────────────────────────────────────
  // NAVIGATE
  // ─────────────────────────────────────────────────────────────────────────
  const navigateTo = useCallback((idx) => {
    if (idx < 0 || idx >= puzzleList.length) return;
  
    stopTimer();
  
    const nextState = puzzleStates[idx];
  
    setTimerMs(nextState?.timeMs ?? 0); // ✅ restore เวลา
  
    setSelected(null);
    setWildPicker(null);
    setRevealed(false);
    setAnalysisOpen(false);
  
    setCurrentIdx(idx);
  }, [puzzleList.length, puzzleStates, stopTimer]);

  // ─────────────────────────────────────────────────────────────────────────
  // WILD PICKER
  // ─────────────────────────────────────────────────────────────────────────
  const handleWildResolve = useCallback((value) => {
    if (!wildPicker) return;
    const { slotIndex } = wildPicker;
    updateCurrentState(s => {
      const next = { ...s, boardSlots: s.boardSlots.map(sl => ({ ...sl })), submitResult: null };
      next.boardSlots[slotIndex] = { ...next.boardSlots[slotIndex], resolvedValue: value };
      return next;
    });
    setWildPicker(null);
  }, [wildPicker, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // BOARD TILE CLICK (filled, user-placed tiles only — locked tiles inert)
  //   • nothing selected      → select this tile
  //   • same tile re-clicked  → deselect (wild tile → open picker)
  //   • rack selected         → swap rack ↔ board
  //   • other board selected  → swap board ↔ board
  // ─────────────────────────────────────────────────────────────────────────
  const handleBoardSlotClick = useCallback((slotIndex) => {
    const slot = boardSlots[slotIndex];
    if (!slot || !slot.tile || slot.isLocked) return;

    // ── Re-click already-selected tile ─────────────────────────────────────
    if (selected?.source === 'board' && selected.index === slotIndex) {
      if (WILD_TILES.has(slot.tile)) {
        setWildPicker({ slotIndex });
        setSelected(null);
      } else {
        setSelected(null);
      }
      return;
    }

    // ── Rack tile selected → swap rack ↔ board ──────────────────────────────
    if (selected?.source === 'rack') {
      const rackItem = rackTiles[selected.index];
      if (!rackItem) { setSelected(null); return; }
      const incomingTile = rackItem.tile;
      const displaced    = slot.tile;

      updateCurrentState(s => {
        const newBoard = s.boardSlots.map(sl => ({ ...sl }));
        const newRack  = s.rackTiles.map(t => t ? { ...t } : null);
        newBoard[slotIndex]      = { ...s.boardSlots[slotIndex], tile: incomingTile, resolvedValue: null };
        newRack[selected.index]  = { id: uid(), tile: displaced };
        return { ...s, boardSlots: newBoard, rackTiles: newRack, submitResult: null };
      });
      setSelected(null);
      if (WILD_TILES.has(incomingTile)) setWildPicker({ slotIndex });
      return;
    }

    // ── Board tile selected → swap board ↔ board ────────────────────────────
    if (selected?.source === 'board') {
      const fromSlot = boardSlots[selected.index];
      updateCurrentState(s => {
        const newBoard = s.boardSlots.map(sl => ({ ...sl }));
        newBoard[slotIndex]      = { ...s.boardSlots[slotIndex], tile: fromSlot.tile,            resolvedValue: fromSlot.resolvedValue };
        newBoard[selected.index] = { ...s.boardSlots[selected.index], tile: slot.tile, resolvedValue: slot.resolvedValue };
        return { ...s, boardSlots: newBoard, submitResult: null };
      });
      setSelected(null);
      return;
    }

    // ── Nothing selected → select ────────────────────────────────────────────
    setSelected({ source: 'board', index: slotIndex });
  }, [boardSlots, rackTiles, selected, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // BOARD EMPTY SLOT CLICK
  //   • rack selected   → place rack tile here; rack slot becomes null
  //   • board selected  → move board tile here; original slot becomes null
  // ─────────────────────────────────────────────────────────────────────────
  const handleBoardEmptySlotClick = useCallback((slotIndex) => {
    if (!selected) return;

    if (selected.source === 'rack') {
      const rackItem = rackTiles[selected.index];
      if (!rackItem) { setSelected(null); return; }

      updateCurrentState(s => {
        const newBoard = s.boardSlots.map(sl => ({ ...sl }));
        const newRack  = s.rackTiles.map(t => t ? { ...t } : null);
        newBoard[slotIndex]     = { ...s.boardSlots[slotIndex], tile: rackItem.tile, resolvedValue: null };
        newRack[selected.index] = null;
        return { ...s, boardSlots: newBoard, rackTiles: newRack, submitResult: null };
      });
      setSelected(null);
      if (WILD_TILES.has(rackItem.tile)) setWildPicker({ slotIndex });
      return;
    }

    if (selected.source === 'board') {
      const fromSlot = boardSlots[selected.index];
      if (!fromSlot || !fromSlot.tile || fromSlot.isLocked) { setSelected(null); return; }

      updateCurrentState(s => {
        const newBoard = s.boardSlots.map(sl => ({ ...sl }));
        newBoard[slotIndex]      = { ...s.boardSlots[slotIndex], tile: fromSlot.tile, resolvedValue: fromSlot.resolvedValue };
        newBoard[selected.index] = { ...s.boardSlots[selected.index], tile: null, resolvedValue: null };
        return { ...s, boardSlots: newBoard, submitResult: null };
      });
      setSelected(null);
    }
  }, [boardSlots, rackTiles, selected, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // RACK TILE CLICK (filled slots only)
  //   • board selected      → swap rack ↔ board
  //   • same rack selected  → deselect
  //   • other rack selected → swap rack ↔ rack
  //   • nothing selected    → select this rack tile
  // ─────────────────────────────────────────────────────────────────────────
  const handleRackTileClick = useCallback((rackIndex) => {
    if (wildPicker) { setWildPicker(null); return; }

    const clickedItem = rackTiles[rackIndex];
    if (!clickedItem) return;

    // Board tile selected → swap rack ↔ board ────────────────────────────
    if (selected?.source === 'board') {
      const boardSlot = boardSlots[selected.index];
      if (!boardSlot || boardSlot.isLocked) { setSelected(null); return; }

      updateCurrentState(s => {
        const newBoard = s.boardSlots.map(sl => ({ ...sl }));
        const newRack  = s.rackTiles.map(t => t ? { ...t } : null);
        newRack[rackIndex]       = { id: uid(), tile: s.boardSlots[selected.index].tile };
        newBoard[selected.index] = { ...s.boardSlots[selected.index], tile: clickedItem.tile, resolvedValue: null };
        return { ...s, boardSlots: newBoard, rackTiles: newRack, submitResult: null };
      });
      setSelected(null);
      if (WILD_TILES.has(clickedItem.tile)) setWildPicker({ slotIndex: selected.index });
      return;
    }

    // Same rack tile → deselect ───────────────────────────────────────────
    if (selected?.source === 'rack' && selected.index === rackIndex) {
      setSelected(null);
      return;
    }

    // Other rack tile selected → swap rack ↔ rack ─────────────────────────
    if (selected?.source === 'rack') {
      updateCurrentState(s => {
        const newRack = s.rackTiles.map(t => t ? { ...t } : null);
        [newRack[selected.index], newRack[rackIndex]] = [newRack[rackIndex], newRack[selected.index]];
        return { ...s, rackTiles: newRack, submitResult: null };
      });
      setSelected(null);
      return;
    }

    // Nothing selected → select ───────────────────────────────────────────
    setSelected({ source: 'rack', index: rackIndex });
  }, [boardSlots, rackTiles, selected, wildPicker, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // RACK EMPTY SLOT CLICK
  //   • rack selected  → move rack tile to this empty slot
  //   • board selected → move board tile back to rack
  // ─────────────────────────────────────────────────────────────────────────
  const handleRackEmptySlotClick = useCallback((rackIndex) => {
    if (!selected) return;

    if (selected.source === 'rack') {
      updateCurrentState(s => {
        const newRack = s.rackTiles.map(t => t ? { ...t } : null);
        newRack[rackIndex]       = newRack[selected.index];
        newRack[selected.index]  = null;
        return { ...s, rackTiles: newRack, submitResult: null };
      });
      setSelected(null);
      return;
    }

    if (selected.source === 'board') {
      const boardSlot = boardSlots[selected.index];
      if (!boardSlot || !boardSlot.tile || boardSlot.isLocked) { setSelected(null); return; }

      updateCurrentState(s => {
        const newBoard = s.boardSlots.map(sl => ({ ...sl }));
        const newRack  = s.rackTiles.map(t => t ? { ...t } : null);
        newRack[rackIndex]       = { id: uid(), tile: boardSlot.tile };
        newBoard[selected.index] = { ...s.boardSlots[selected.index], tile: null, resolvedValue: null };
        return { ...s, boardSlots: newBoard, rackTiles: newRack, submitResult: null };
      });
      setSelected(null);
    }
  }, [boardSlots, selected, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // RECALL ALL — move all non-locked board tiles back to rack
  // ─────────────────────────────────────────────────────────────────────────
  const handleRecallAll = useCallback(() => {
    updateCurrentState(s => {
      const newBoard = s.boardSlots.map(sl => ({ ...sl }));
      const newRack  = s.rackTiles.map(t => t ? { ...t } : null);
      for (let bi = 0; bi < newBoard.length; bi++) {
        const slot = newBoard[bi];
        if (!slot.tile || slot.isLocked) continue;
        const emptyIdx = newRack.findIndex(t => t === null);
        if (emptyIdx < 0) break;
        newRack[emptyIdx] = { id: uid(), tile: slot.tile };
        newBoard[bi] = { ...slot, tile: null, resolvedValue: null };
      }
      return { ...s, boardSlots: newBoard, rackTiles: newRack, submitResult: null };
    });
    setSelected(null);
    setWildPicker(null);
  }, [updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMIT
  // ─────────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const hasEmpty      = boardSlots.some(s => s.tile === null);
    const hasUnresolved = boardSlots.some(s => WILD_TILES.has(s.tile) && !s.resolvedValue);

    if (hasEmpty) {
      updateCurrentState(s => ({ ...s, submitResult: { correct: false, message: 'Place all tiles on the board first' } }));
      return;
    }
    if (hasUnresolved) {
      updateCurrentState(s => ({ ...s, submitResult: { correct: false, message: 'Tap your wildcard tile again to assign its value (? / +/- / ×/÷)' } }));
      return;
    }

    const tiles = boardSlots.map(s => WILD_TILES.has(s.tile) ? s.resolvedValue : s.tile);
    const eq    = tiles.join('');
    const valid = isValidEquation(eq, 1, false);
    const score = valid ? calcScore(boardSlots) : 0;
    const elapsed = timerActive ? Date.now() - timerStartRef.current : (currentState?.timeMs ?? timerMs);

    if (valid && timerActive) {
      stopTimer();
      updateCurrentState(s => ({
        ...s,
        submitResult: { correct: true, message: `✓ ${eq}`, score },
        timeMs: elapsed,
        timerStarted: true,
      }));
      // Auto-navigate to next puzzle after short delay
      if (currentIdx < puzzleList.length - 1) {
        setTimeout(() => navigateTo(currentIdx + 1), 1400);
      }
    } else {
      updateCurrentState(s => ({
        ...s,
        submitResult: { correct: valid, message: valid ? `✓ ${eq}` : `✗ ${eq}`, score },
        timeMs: elapsed,
      }));
      if (!valid && timerActive) stopTimer();
    }
  }, [boardSlots, timerActive, timerMs, currentState, updateCurrentState, currentIdx, puzzleList.length, navigateTo, stopTimer]);

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYSIS (admin only)
  // ─────────────────────────────────────────────────────────────────────────
  const handleAnalysis = useCallback(async () => {
    if (!currentResult) return;
    setAnalysisLoading(true);
    setAnalysisOpen(true);

    // Run solver in a microtask to not block UI
    await new Promise(r => setTimeout(r, 30));
    const allSolutions = findAllSolutions(currentResult.solutionTiles, 300);
    // Locked positions always count as px1 (matches check-eq fixed-tile rule).
    const slotTypes = boardSlots.map(s => s.isLocked ? 'px1' : (s.slotType ?? 'px1'));

    // Score each solution using its own pre-expansion token order (origTokens),
    // so wildcard tiles contribute their OWN points, not the resolved tile's points.
    const scoredSols = allSolutions.map(sol => ({
      ...sol,
      score: scoreEquation(sol.origTokens ?? currentResult.solutionTiles, slotTypes),
    }));

    const perf = analyzePerformance({
      allSolutions:     scoredSols,
      userScore:        submitResult?.score ?? 0,
      timeMs:           currentState?.timeMs ?? null,
      difficulty:       currentResult.difficulty,
    });

    updateCurrentState(s => ({ ...s, analysis: { allSolutions: scoredSols, perf } }));
    setAnalysisLoading(false);
  }, [currentResult, boardSlots, submitResult, currentState, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  const allFilled  = currentResult && boardSlots.length > 0 && boardSlots.every(s => s.tile !== null);
  const wildSlot   = wildPicker !== null ? boardSlots[wildPicker?.slotIndex] : null;
  const totalCount = puzzleList.length;
  const analysis   = currentState?.analysis ?? null;

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 via-amber-50/30 to-stone-50 pb-20">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        @keyframes fadeUp  { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(40px); } to { opacity:1; transform:translateY(0); } }
        .font-mono { font-family: "JetBrains Mono", "Fira Code", monospace; }
      `}</style>

      <BingoHeader />

      <div className="max-w-3xl mx-auto px-4 pt-7">
        <BingoConfig
          mode={mode} setMode={setMode}
          puzzleSets={puzzleSets} setPuzzleSets={setPuzzleSets}
          timerEnabled={timerEnabled} setTimerEnabled={setTimerEnabled}
          onGenerate={generate} loading={loading}
          error={error} genCount={genCount}
        />

        {/* ── Puzzle navigation bar ─────────────────────────────────── */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between mb-4 px-1">
            <button
              onClick={() => navigateTo(currentIdx - 1)}
              disabled={currentIdx === 0}
              className="px-3 py-1.5 rounded-lg border border-stone-200 font-mono text-[9px] text-stone-500 hover:border-stone-300 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              ← PREV
            </button>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-stone-500">
                {currentIdx + 1} / {totalCount}
              </span>
              <div className="flex gap-1">
                {puzzleList.map((_, i) => {
                  const st = puzzleStates[i];
                  const done = st?.submitResult?.correct;
                  return (
                    <button
                      key={i}
                      onClick={() => navigateTo(i)}
                      className={`w-5 h-2 rounded-full cursor-pointer transition-colors ${
                        i === currentIdx ? 'bg-amber-500' :
                        done ? 'bg-emerald-400' : 'bg-stone-200 hover:bg-stone-300'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => navigateTo(currentIdx + 1)}
              disabled={currentIdx === totalCount - 1}
              className="px-3 py-1.5 rounded-lg border border-stone-200 font-mono text-[9px] text-stone-500 hover:border-stone-300 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              NEXT →
            </button>
          </div>
        )}

        {/* ── Puzzle area ──────────────────────────────────────────────── */}
        {currentResult && (
          <div style={{ animation: 'fadeUp 0.3s ease' }} key={currentIdx}>

            <BingoBoard
              boardSlots={boardSlots}
              selected={selected}
              onSlotClick={handleBoardSlotClick}
              onEmptySlotClick={handleBoardEmptySlotClick}
              submitResult={submitResult}
              allFilled={!!allFilled}
              onSubmit={handleSubmit}
              timerEnabled={timerEnabled}
              timerRunning={timerActive}
              timerMs={timerActive ? timerMs : (currentState?.timeMs ?? timerMs)}
              puzzleHidden={puzzleHidden}
              onStartTimer={handleStartTimer}
            />

            {!puzzleHidden && (
              <BingoRack
                rackTiles={rackTiles}
                selected={selected}
                onTileClick={handleRackTileClick}
                onEmptySlotClick={handleRackEmptySlotClick}
                onRecallAll={handleRecallAll}
              />
            )}

            {/* Submit error message */}
            {submitResult && !submitResult.correct && (
              <div className="mb-4 px-5 py-3 rounded-xl border border-red-200 bg-red-50 font-mono text-[11px] text-red-600 tracking-wide text-center">
                {submitResult.message}
              </div>
            )}

            {/* Admin analysis button */}
            {!puzzleHidden && IS_ADMIN && (
              <div className="flex gap-3 mb-4 justify-center">
                <button
                  onClick={handleAnalysis}
                  disabled={analysisLoading}
                  className="px-5 py-2 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 font-mono text-[10px] tracking-[0.2em] uppercase hover:bg-violet-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {analysisLoading ? '◌ Analyzing…' : '⊕ ANALYSIS'}
                </button>
              </div>
            )}

            {/* Analysis panel (admin) */}
            {IS_ADMIN && analysisOpen && analysis && (
              <AnalysisPanel
                analysis={analysis}
                onClose={() => setAnalysisOpen(false)}
              />
            )}

            {/* Solution reveal — finds ALL valid permutations of rack tiles */}
            {!puzzleHidden && (
              <BingoSolution
                result={currentResult}
                revealed={revealed}
                setRevealed={setRevealed}
              />
            )}
          </div>
        )}


        {totalCount === 0 && !loading && !error && (
          <div className="text-center py-20 text-stone-300 font-mono text-[10px] tracking-[0.3em] uppercase">
            <div className="text-5xl mb-5 opacity-20 leading-none">⊞</div>
            Configure a set and press Generate
          </div>
        )}
      </div>

      {/* ── Wild Picker Modal ──────────────────────────────────────────────── */}
      {wildPicker !== null && wildSlot && (
        <WildPicker
          tile={wildSlot.tile}
          currentValue={wildSlot.resolvedValue}
          onSelect={handleWildResolve}
          onClose={() => setWildPicker(null)}
        />
      )}
    </div>
  );
}

// ── WildPicker ────────────────────────────────────────────────────────────────
function WildPicker({ tile, currentValue, onSelect, onClose }) {
  const options = getWildOptions(tile);
  if (!options) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[1px]"
      style={{ animation: 'fadeUp 0.15s ease' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl border-t border-stone-200 shadow-2xl w-full max-w-lg pb-8"
        style={{ animation: 'slideUp 0.2s ease' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>
        <div className="px-5">
          <div className="text-center mb-4">
            <div className="text-[9px] font-mono tracking-[0.3em] uppercase text-stone-400 mb-1">Set value for tile</div>
            <div className="inline-flex items-center gap-2">
              <BingoTile token={tile} role="wild-unresolved" size="md" points={TILE_POINTS[tile] ?? 0} />
              <span className="font-mono text-stone-400 text-sm">→</span>
              {currentValue
                ? <BingoTile token={currentValue} role="selected" size="md" />
                : <div className="w-[46px] h-[46px] rounded-lg border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-300 font-mono text-xs">?</div>
              }
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {options.map(opt => (
              <button key={opt} onClick={() => onSelect(opt)} className="cursor-pointer hover:scale-110 transition-transform active:scale-95">
                <BingoTile token={opt} role={currentValue === opt ? 'selected' : 'rack'} size={options.length > 10 ? 'sm' : 'md'} />
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-xl border border-stone-200 font-mono text-[10px] tracking-[0.2em] uppercase text-stone-400 hover:border-stone-300 hover:bg-stone-50 transition-colors cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AnalysisPanel ─────────────────────────────────────────────────────────────
function AnalysisPanel({ analysis, onClose }) {
  const { allSolutions, perf } = analysis;
  const colorMap = {
    Excellent: 'text-emerald-600', Good: 'text-sky-600', Average: 'text-amber-600',
    Hard: 'text-orange-600', 'Very Hard': 'text-red-600',
  };
  const diffClsMap = {
    easy: 'text-emerald-500', medium: 'text-amber-500',
    hard: 'text-orange-500', 'very-hard': 'text-red-500',
  };

  return (
    <div className="bg-white rounded-2xl border border-violet-200 shadow-sm p-5 mb-4" style={{ animation: 'fadeUp 0.2s ease' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-violet-600">ANALYSIS</div>
        <button onClick={onClose} className="text-stone-400 font-mono text-xs hover:text-stone-600 cursor-pointer">✕</button>
      </div>

      {/* Performance score */}
      <div className="flex items-center gap-4 mb-4 px-4 py-3 rounded-xl bg-violet-50 border border-violet-100">
        <div className="text-center">
          <div className={`text-3xl font-extrabold ${colorMap[perf.label]}`}>{perf.performance}%</div>
          <div className={`text-[9px] font-mono font-bold tracking-wider ${colorMap[perf.label]}`}>{perf.label}</div>
        </div>
        <div className="flex-1 space-y-2">
          <BarRow label="Score"  value={perf.breakdown.score}  max={50} color="bg-emerald-400" />
          <BarRow label="Speed"  value={perf.breakdown.time}   max={30} color="bg-sky-400"     />
          <BarRow label="Rarity" value={perf.breakdown.optionality} max={20} color="bg-violet-400" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <MiniStat label="Patterns" value={perf.patternCount} />
        <MiniStat label="Difficulty" value={<span className={diffClsMap[perf.difficultyClass]}>{perf.difficultyClass}</span>} />
        <MiniStat label="Max Score" value={perf.maxPossibleScore} />
      </div>

      {/* Solutions list */}
      <div className="text-[9px] font-mono text-stone-400 mb-2 tracking-widest uppercase">
        All Solutions ({allSolutions.length})
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {allSolutions.slice(0, 50).map((s, i) => (
          <div key={i} className="px-3 py-1.5 rounded-lg bg-stone-50 border border-stone-100 font-mono text-[10px] text-stone-600 tracking-widest">
            {s.eq}
          </div>
        ))}
        {allSolutions.length > 50 && (
          <div className="text-center text-stone-300 font-mono text-[8px]">+{allSolutions.length - 50} more</div>
        )}
      </div>
    </div>
  );
}

function BarRow({ label, value, max, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[8px] text-stone-400 w-10 text-right">{label}</span>
      <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.round((value/max)*100)}%` }} />
      </div>
      <span className="font-mono text-[8px] text-stone-500 w-6">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-stone-50 border border-stone-100">
      <div className="text-[7px] font-mono text-stone-400 uppercase tracking-widest mb-0.5">{label}</div>
      <div className="font-mono text-[12px] font-bold text-stone-700">{value}</div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
      <div className="text-[8px] font-mono tracking-widest uppercase text-stone-400 mb-2">{label}</div>
      <div className={`text-xl font-extrabold ${color}`}>{value}</div>
    </div>
  );
}
