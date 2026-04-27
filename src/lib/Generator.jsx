import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  isValidEquation,
  WILD_TILES, TILE_POINTS,
} from '@/lib/bingoGenerator';
import { generateBatchAsync, buildCfgList } from '@/lib/generateBatch';
import { BingoHeader }   from '@/components/bingo/BingoHeader';
import { BingoConfig, DEFAULT_SETS }   from '@/components/bingo/BingoConfig';
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
let _uid = Date.now();
const uid = () => ++_uid;

// ── Score calculator ──────────────────────────────────────────────────────────
function calcScore(boardSlots) {
  let letterTotal = 0;
  let wordMult    = 1;
  for (const slot of boardSlots) {
    if (!slot.tile) continue;
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
  const [crossBonus,   setCrossBonus]   = useState(true);
  const [puzzleSets,   setPuzzleSets]   = useState(DEFAULT_SETS);
  const [timerEnabled, setTimerEnabled] = useState(false);

  // ── Tile sets (fetched once for poolDef lookup in generate) ─────────────
  const tileSetsCache = useRef([]);
  useEffect(() => {
    api.tileSets.list()
      .then(res => { tileSetsCache.current = res.tileSets ?? res ?? []; })
      .catch(() => {});
  }, []);

  // ── Puzzle list state ─────────────────────────────────────────────────────
  const [puzzleList,   setPuzzleList]   = useState([]);
  const [puzzleStates, setPuzzleStates] = useState([]);
  const [currentIdx,   setCurrentIdx]   = useState(0);

  // ── Puzzle transition animation ───────────────────────────────────────────
  const [puzzleVisible, setPuzzleVisible] = useState(true);
  const [slideDir, setSlideDir] = useState('up'); // 'up' | 'left' | 'right'

  // ── Loading / error ───────────────────────────────────────────────────────
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [genCount,    setGenCount]    = useState(0);
  const [genProgress, setGenProgress] = useState(null);
  const cancelRef = useRef(null);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [timerMs,     setTimerMs]     = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef(null);
  const timerStartRef    = useRef(null);

  // ── Wild picker ───────────────────────────────────────────────────────────
  const [wildPicker, setWildPicker] = useState(null);

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);

  // ── Analysis modal ────────────────────────────────────────────────────────
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // ── Reveal solution ───────────────────────────────────────────────────────
  const [revealed, setRevealed] = useState(false);

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
    if (saved.crossBonus != null)   setCrossBonus(saved.crossBonus);
    if (saved.genCount)     setGenCount(saved.genCount);
  }, []);

  // PERSISTENCE — save on state change
  useEffect(() => {
    if (puzzleList.length === 0) return;
    saveSession({ puzzleList, puzzleStates, currentIdx, puzzleSets, timerEnabled, crossBonus, genCount });
  }, [puzzleList, puzzleStates, currentIdx, puzzleSets, timerEnabled, crossBonus, genCount]);

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

  useEffect(() => () => stopTimer(), [stopTimer]);

  useEffect(() => {
    if (!currentState) return;
    if (!timerActive && currentState.timeMs != null) {
      setTimerMs(currentState.timeMs);
    }
  }, [currentIdx, currentState, timerActive]);

  // ─────────────────────────────────────────────────────────────────────────
  // ANIMATED NAVIGATE
  // ─────────────────────────────────────────────────────────────────────────
  const navigateTo = useCallback((idx, dir = 'up') => {
    if (idx < 0 || idx >= puzzleList.length) return;

    stopTimer();
    setSlideDir(dir);
    setPuzzleVisible(false);

    setTimeout(() => {
      const nextState = puzzleStates[idx];
      setTimerMs(nextState?.timeMs ?? 0);
      setSelected(null);
      setWildPicker(null);
      setRevealed(false);
      setAnalysisOpen(false);
      setCurrentIdx(idx);
      setPuzzleVisible(true);
    }, 180);
  }, [puzzleList.length, puzzleStates, stopTimer]);

  // ─────────────────────────────────────────────────────────────────────────
  // GENERATE
  // ─────────────────────────────────────────────────────────────────────────
  const handleCancelGenerate = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setLoading(false);
    setGenProgress(null);
  }, []);

  const generate = useCallback(() => {
    cancelRef.current?.();
    setLoading(true);
    setError('');
    setPuzzleList([]);
    setPuzzleStates([]);
    setCurrentIdx(0);
    stopTimer();
    setTimerMs(0);
    setSelected(null);
    setWildPicker(null);
    setRevealed(false);
    setAnalysisOpen(false);

    const cfgList = buildCfgList(puzzleSets, mode, tileSetsCache.current, crossBonus);
    setGenProgress({ done: 0, total: cfgList.length });

    cancelRef.current = generateBatchAsync(cfgList, {
      onEach: (result, done, total) => {
        setGenProgress({ done, total });
        setPuzzleList(prev => [...prev, result]);
        setPuzzleStates(prev => [...prev, initPuzzleState(result)]);
      },
      onDone: () => {
        setGenCount(n => n + 1);
        setLoading(false);
        setGenProgress(null);
        cancelRef.current = null;
      },
      onError: (e) => {
        setError(e.message);
        setLoading(false);
        setGenProgress(null);
        cancelRef.current = null;
      },
    });
  }, [mode, puzzleSets, stopTimer, crossBonus]);

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
  // BOARD TILE CLICK
  // ─────────────────────────────────────────────────────────────────────────
  const handleBoardSlotClick = useCallback((slotIndex) => {
    const slot = boardSlots[slotIndex];
    if (!slot || !slot.tile || slot.isLocked) return;

    if (selected?.source === 'board' && selected.index === slotIndex) {
      if (WILD_TILES.has(slot.tile)) {
        setWildPicker({ slotIndex });
        setSelected(null);
      } else {
        setSelected(null);
      }
      return;
    }

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

    setSelected({ source: 'board', index: slotIndex });
  }, [boardSlots, rackTiles, selected, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // BOARD EMPTY SLOT CLICK
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
  // RACK TILE CLICK
  // ─────────────────────────────────────────────────────────────────────────
  const handleRackTileClick = useCallback((rackIndex) => {
    if (wildPicker) { setWildPicker(null); return; }

    const clickedItem = rackTiles[rackIndex];
    if (!clickedItem) return;

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

    if (selected?.source === 'rack' && selected.index === rackIndex) {
      setSelected(null);
      return;
    }

    if (selected?.source === 'rack') {
      updateCurrentState(s => {
        const newRack = s.rackTiles.map(t => t ? { ...t } : null);
        [newRack[selected.index], newRack[rackIndex]] = [newRack[rackIndex], newRack[selected.index]];
        return { ...s, rackTiles: newRack, submitResult: null };
      });
      setSelected(null);
      return;
    }

    setSelected({ source: 'rack', index: rackIndex });
  }, [boardSlots, rackTiles, selected, wildPicker, updateCurrentState]);

  // ─────────────────────────────────────────────────────────────────────────
  // RACK EMPTY SLOT CLICK
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
  // RECALL ALL
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
      updateCurrentState(s => ({ ...s, submitResult: { correct: false, message: 'Tap your wildcard tile again to assign its value' } }));
      return;
    }

    const tiles = boardSlots.map(s => WILD_TILES.has(s.tile) ? s.resolvedValue : s.tile);
    const eq    = tiles.join('');
    const valid = isValidEquation(eq, currentResult?.eqCount ?? 1, false);
    const score = valid ? calcScore(boardSlots) : 0;
    const elapsed = timerActive ? Date.now() - timerStartRef.current : (currentState?.timeMs ?? timerMs);

    if (valid && timerActive) {
      stopTimer();
      updateCurrentState(s => ({
        ...s,
        submitResult: { correct: true, message: eq, score },
        timeMs: elapsed,
        timerStarted: true,
      }));
      if (currentIdx < puzzleList.length - 1) {
        setTimeout(() => navigateTo(currentIdx + 1, 'left'), 1400);
      }
    } else {
      updateCurrentState(s => ({
        ...s,
        submitResult: { correct: valid, message: eq, score },
        timeMs: elapsed,
      }));
      if (!valid && timerActive) stopTimer();
    }
  }, [boardSlots, timerActive, timerMs, currentState, updateCurrentState, currentIdx, puzzleList.length, navigateTo, stopTimer, currentResult?.eqCount]);

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────
  const handleAnalysis = useCallback(async () => {
    if (!currentResult) return;
    setAnalysisLoading(true);
    setAnalysisOpen(true);

    await new Promise(r => setTimeout(r, 30));
    const allSolutions = findAllSolutions(currentResult.solutionTiles, 300);
    const slotTypes = boardSlots.map(s => s.isLocked ? 'px1' : (s.slotType ?? 'px1'));

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

  const [jumpValue, setJumpValue] = useState(currentIdx + 1);

  useEffect(() => {
    setJumpValue(currentIdx + 1);
  }, [currentIdx]);

  // Build animation class based on direction and visibility
  const puzzleAnimClass = puzzleVisible
    ? 'puzzle-enter'
    : slideDir === 'left'
      ? 'puzzle-exit-left'
      : slideDir === 'right'
        ? 'puzzle-exit-right'
        : 'puzzle-exit-up';

  return (
    <div className="min-h-screen bg-stone-200 pb-20">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        .font-mono { font-family: "JetBrains Mono", "Fira Code", monospace; letter-spacing: 0; }

        /* ── Puzzle transition animations ─────────────────────────────── */
        @keyframes puzzleEnter {
          from { opacity: 0; transform: translateY(16px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
        @keyframes puzzleExitUp {
          from { opacity: 1; transform: translateY(0)     scale(1);     }
          to   { opacity: 0; transform: translateY(-12px) scale(0.985); }
        }
        @keyframes puzzleExitLeft {
          from { opacity: 1; transform: translateX(0)    scale(1);     }
          to   { opacity: 0; transform: translateX(-20px) scale(0.99); }
        }
        @keyframes puzzleExitRight {
          from { opacity: 1; transform: translateX(0)    scale(1);    }
          to   { opacity: 0; transform: translateX(20px) scale(0.99); }
        }
        .puzzle-enter      { animation: puzzleEnter      0.28s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .puzzle-exit-up    { animation: puzzleExitUp     0.16s ease-in both; }
        .puzzle-exit-left  { animation: puzzleExitLeft   0.16s ease-in both; }
        .puzzle-exit-right { animation: puzzleExitRight  0.16s ease-in both; }

        /* ── Button base ──────────────────────────────────────────────── */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border-radius: 8px;
          border: 1px solid;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease;
          white-space: nowrap;
          user-select: none;
        }
        .btn:active { transform: scale(0.97); }
        .btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

        /* Nav variant — subtle, stone */
        .btn-nav {
          padding: 7px 14px;
          background: #ffffff;
          border-color: #d6d3d1;
          color: #57534e;
        }
        .btn-nav:not(:disabled):hover {
          background: #f5f5f4;
          border-color: #a8a29e;
          color: #292524;
        }

        /* Primary variant — dark fill */
        .btn-primary {
          padding: 9px 20px;
          background: #292524;
          border-color: #292524;
          color: #fafaf9;
        }
        .btn-primary:not(:disabled):hover {
          background: #1c1917;
          border-color: #1c1917;
          box-shadow: 0 1px 6px rgba(0,0,0,0.18);
        }

        /* Danger / error variant */
        .btn-danger {
          padding: 9px 20px;
          background: #fef2f2;
          border-color: #fca5a5;
          color: #991b1b;
        }
        .btn-danger:not(:disabled):hover {
          background: #fee2e2;
          border-color: #f87171;
        }

        /* Ghost variant — no fill, just border */
        .btn-ghost {
          padding: 7px 16px;
          background: transparent;
          border-color: #d6d3d1;
          color: #78716c;
        }
        .btn-ghost:not(:disabled):hover {
          background: #f5f5f4;
          border-color: #a8a29e;
          color: #292524;
        }

        /* Accent variant — violet */
        .btn-accent {
          padding: 8px 18px;
          background: #f5f3ff;
          border-color: #c4b5fd;
          color: #5b21b6;
        }
        .btn-accent:not(:disabled):hover {
          background: #ede9fe;
          border-color: #a78bfa;
        }

        /* Cancel / destructive ghost */
        .btn-cancel {
          padding: 11px 20px;
          background: transparent;
          border-color: #e7e5e4;
          color: #a8a29e;
        }
        .btn-cancel:not(:disabled):hover {
          background: #f5f5f4;
          border-color: #d6d3d1;
          color: #57534e;
        }
      `}</style>

      <BingoHeader />

      <div className="max-w-3xl mx-auto px-2 pt-2">
        <BingoConfig
          mode={mode} setMode={setMode}
          crossBonus={crossBonus} setCrossBonus={setCrossBonus}
          puzzleSets={puzzleSets} setPuzzleSets={setPuzzleSets}
          timerEnabled={timerEnabled} setTimerEnabled={setTimerEnabled}
          onGenerate={generate} loading={loading}
          error={error} genCount={genCount}
          genProgress={genProgress} onCancel={handleCancelGenerate}
        />

        {/* ── Puzzle navigation bar ─────────────────────────────────── */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between mb-4 px-1 gap-2">

            <button
              onClick={() => navigateTo(currentIdx - 1, 'right')}
              disabled={currentIdx === 0}
              className="btn btn-nav"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{flexShrink:0}}>
                <path d="M7 2L4 5.5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Prev
            </button>

            <div className="flex items-center gap-2">
              <input
                type="number"
                value={jumpValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setJumpValue(val === '' ? '' : Number(val));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = Number(jumpValue);
                    if (!isNaN(v)) navigateTo(v - 1);
                  }
                }}
                onBlur={() => {
                  const v = Number(jumpValue);
                  if (!isNaN(v)) navigateTo(v - 1);
                  else setJumpValue(currentIdx + 1);
                }}
                className="w-14 px-2 py-1 text-center border border-stone-300 rounded-md text-[10px] font-mono"
                min={1}
                max={totalCount}
              />
              <span className="font-mono text-[10px] text-stone-500 whitespace-nowrap">
                / {totalCount}
              </span>
            </div>

            <button
              onClick={() => navigateTo(currentIdx + 1, 'left')}
              disabled={currentIdx === totalCount - 1}
              className="btn btn-nav"
            >
              Next
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{flexShrink:0}}>
                <path d="M4 2L7 5.5L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

          </div>
        )}

        {/* ── Puzzle area ──────────────────────────────────────────────── */}
        {currentResult && (
          <div className={puzzleAnimClass} key={currentIdx}>

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
              <div className="mb-4 px-5 py-3 rounded-xl border border-red-200 bg-red-50 font-mono text-[11px] text-red-700 tracking-wide text-center font-bold" style={{animation:'puzzleEnter 0.2s ease both'}}>
                {submitResult.message}
              </div>
            )}

            {/* Admin analysis button */}
            {!puzzleHidden && IS_ADMIN && (
              <div className="flex gap-3 mb-4 justify-center">
                <button
                  onClick={handleAnalysis}
                  disabled={analysisLoading}
                  className="btn btn-accent"
                >
                  {analysisLoading ? 'Analyzing' : 'Analysis'}
                </button>
              </div>
            )}

            {/* Analysis panel */}
            {IS_ADMIN && analysisOpen && analysis && (
              <AnalysisPanel
                analysis={analysis}
                onClose={() => setAnalysisOpen(false)}
              />
            )}

            {/* Solution reveal */}
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
          <div className="text-center py-20 text-stone-400 font-mono text-[11px] tracking-wide uppercase">
            <div className="w-12 h-12 mx-auto mb-5 opacity-20 border-2 border-stone-400 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="2" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="11" y="2" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="11" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="11" y="11" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
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
      style={{ animation: 'puzzleEnter 0.15s ease' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl border-t border-stone-200 shadow-2xl w-full max-w-lg pb-8"
        style={{ animation: 'puzzleEnter 0.2s cubic-bezier(0.22,1,0.36,1)' }}
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
              <span className="font-mono text-stone-400 text-sm">—</span>
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
          <button onClick={onClose} className="btn btn-cancel w-full">
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
    <div className="bg-white rounded-2xl border border-violet-200 shadow-sm p-5 mb-4" style={{ animation: 'puzzleEnter 0.2s ease' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-violet-600">Analysis</div>
        <button onClick={onClose} className="btn btn-ghost" style={{padding:'4px 10px', fontSize:'11px'}}>
          Close
        </button>
      </div>

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

      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <MiniStat label="Patterns" value={perf.patternCount} />
        <MiniStat label="Difficulty" value={<span className={diffClsMap[perf.difficultyClass]}>{perf.difficultyClass}</span>} />
        <MiniStat label="Max Score" value={perf.maxPossibleScore} />
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