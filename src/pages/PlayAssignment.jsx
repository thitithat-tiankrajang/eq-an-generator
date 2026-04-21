/**
 * PlayAssignment — full-screen assignment playing page at /play/:assignmentId
 *
 * UI pattern mirrors ui.jsx: BingoBoard + BingoRack, count-up timer
 * with manual start (player taps "Start" to reveal puzzle & begin timing).
 *
 * Flow per question:
 *  1. GET current-set → check currentQuestionElements (persisted rack tiles)
 *  2. If no elements → generateBingo(cfg) locally, PATCH to persist elements
 *  3. Player presses "Start" → timer begins, puzzle revealed
 *  4. Player arranges tiles; on submit → POST answer with timeTaken + score
 *  5. On "Next" → load next question (timer resets)
 *  6. After all answered → "complete" phase
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { generateBingo, isValidEquation, WILD_TILES, TILE_POINTS } from "@/lib/bingoGenerator";
import { BingoBoard } from "@/components/bingo/BingoBoard";
import { BingoRack } from "@/components/bingo/BingoRack";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, ArrowRight, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

let _uid = Date.now();
const uid = () => ++_uid;

/** Map assignment optionSet.options → generateBingo cfg
 *
 * Rules to prevent impossible constraints (180-attempt failure):
 *  1. operatorSpec: skip v=0/null — "0" means unconstrained, NOT "exactly 0"
 *  2. operatorSpec uses [v, maxOps] — "at least v", not "exactly v"
 *  3. operatorCount = max(configured, specSum) so spec minimums always fit
 *  4. operatorCount kept as exact value (not wide range) to respect user config
 *  5. All values clamped to tile budget so nothing is geometrically impossible
 */
function buildBingoConfig(opts = {}) {
  const totalTile = Math.max(8, Math.min(15, opts.totalCount || 9));
  const eqCount   = opts.equalsCount ?? 1;
  // max operators that fit: totalTile - equals - at least 2 number tiles
  const maxOps    = Math.min(6, totalTile - eqCount - 2);

  // Build operatorSpec — only constrain ops with a positive minimum count
  let operatorSpec = undefined;
  let specSum      = 0;
  if (opts.operatorFixed) {
    const spec = {};
    for (const [op, v] of Object.entries(opts.operatorFixed)) {
      if (v !== null && v !== undefined && v > 0) {
        spec[op] = [v, maxOps]; // "at least v", not exact
        specSum += v;
      }
    }
    if (Object.keys(spec).length > 0) operatorSpec = spec;
  }

  // Respect the user's configured operatorCount exactly.
  // Only raise it if operatorSpec minimums require more; always cap at maxOps.
  const operatorCount = Math.min(
    Math.max(opts.operatorCount ?? 2, specSum),
    maxOps
  );

  // Clamp heavy/blank to remaining tile budget
  const remaining  = totalTile - eqCount - operatorCount;
  const heavyCount = Math.min(opts.heavyNumberCount ?? 0, remaining);
  const blankCount = Math.min(opts.BlankCount ?? 0, Math.max(0, remaining - heavyCount));

  console.log('[buildBingoConfig]', {
    totalTile, eqCount, maxOps, operatorCount, specSum,
    operatorSpec, heavyCount, blankCount,
    raw_operatorCount: opts.operatorCount,
  });

  return {
    mode: opts.plainMode ? 'plain' : 'cross',
    totalTile,
    equalCount: eqCount,
    operatorCount, // exact number — generator will target this exactly
    heavyCount,
    blankCount,
    wildcardCount: 0,
    ...(operatorSpec ? { operatorSpec } : {}),
  };
}

/** Score from tile points × slot multipliers (matches ui.jsx calcScore) */
function calcScore(boardSlots) {
  let letterTotal = 0;
  let wordMult = 1;
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
  return letterTotal * wordMult;
}

/** Format ms → M:SS */
function fmtMs(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayAssignment() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState('loading'); // loading | playing | review | complete
  const [assignment, setAssignment] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [results, setResults] = useState([]);
  const [solutionTiles, setSolutionTiles] = useState([]);
  // Original rack tiles when question loaded — used as questionText (tracks what was given)
  const originalRackRef = useRef([]);

  // ── Board / rack state (ui.jsx format) ──────────────────────────────────────
  const [boardSlots, setBoardSlots] = useState([]);
  const [rackTiles, setRackTiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [wildPicker, setWildPicker] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [puzzleEqCount, setPuzzleEqCount] = useState(1);

  // ── Timer (count-up) ─────────────────────────────────────────────────────
  const [timerStarted, setTimerStarted] = useState(false);
  const [timerMs, setTimerMs] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef(null);
  const timerStartRef = useRef(null);

  const puzzleHidden = !timerStarted;

  // ── Stop confirmation ────────────────────────────────────────────────────
  const [confirmStop, setConfirmStop] = useState(false);

  const submittingRef = useRef(false);
  // Prevent double-fire on mobile touch events duplicating tiles
  const handlingRef = useRef(false);
  // Live refs — always hold the latest board/rack values so handlers never
  // read stale closure state even when two touch events fire before re-render
  const boardSlotsRef = useRef([]);
  const rackTilesRef  = useRef([]);

  // ── Timer helpers ──────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerActive(false);
  }, []);

  const handleStartTimer = useCallback(() => {
    timerStartRef.current = Date.now();
    setTimerMs(0);
    setTimerActive(true);
    setTimerStarted(true);
    timerIntervalRef.current = setInterval(() => {
      setTimerMs(Date.now() - timerStartRef.current);
    }, 50);
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── Board state helpers ────────────────────────────────────────────────────
  const allFilled = useMemo(
    () => boardSlots.length > 0 && boardSlots.every(s => s.tile !== null),
    [boardSlots]
  );

  // ── Load a question ──────────────────────────────────────────────────────
  const loadQuestion = useCallback(async (assignmentData, studentId) => {
    setPhase('loading');
    setSelected(null);
    setWildPicker(null);
    setSubmitResult(null);
    setTimerStarted(false);
    setTimerMs(0);
    stopTimer();

    try {
      const setInfo = await api.assignments.student.getCurrentSet(assignmentId, studentId);

      const answersData = await api.assignments.student
        .getAnswers(assignmentId, studentId)
        .catch(() => ({ answeredCount: 0 }));
      const answered = answersData.answeredCount ?? answersData.answers?.length ?? 0;
      setAnsweredCount(answered);

      const total = assignmentData?.totalQuestions ?? 5;
      if (answered >= total) {
        setPhase('complete');
        return;
      }

      let rackValues = setInfo.currentQuestionElements || [];
      let lockedPos  = setInfo.currentQuestionListPosLock || [];
      let solution   = setInfo.currentQuestionSolutionTokens || [];
      let slotTypes  = setInfo.currentQuestionSlotTypes || [];

      if (!rackValues.length) {
        const cfg = buildBingoConfig(setInfo.currentSet?.options);
        const gen = generateBingo(cfg);

        rackValues = gen.rackTiles;
        solution   = gen.solutionTiles;
        slotTypes  = gen.boardSlots.map(s => s.slotType ?? 'px1');
        setPuzzleEqCount(gen.eqCount ?? 1);
        lockedPos  = gen.boardSlots
          .map((slot, i) => (slot.isLocked ? { pos: i, value: slot.tile } : null))
          .filter(Boolean);

        await api.assignments.student
          .setCurrentQuestion(assignmentId, studentId, {
            elements: rackValues,
            listPosLock: lockedPos,
            solutionTokens: solution,
            slotTypes,
          })
          .catch((err) => console.warn('Could not persist question elements:', err));
      }

      setSolutionTiles(solution);

      // Build rack: { id, tile }[]
      const newRack = rackValues.map((v) => ({ id: uid(), tile: v }));
      // Snapshot original rack values for use as questionText on submit
      originalRackRef.current = rackValues;

      // Build board slots using persisted slotTypes for correct size + special squares
      const totalSlots = rackValues.length + lockedPos.length;
      const newSlots = Array(totalSlots).fill(null).map((_, i) => ({
        tile: null, isLocked: false, slotType: slotTypes[i] ?? 'px1', resolvedValue: null,
      }));
      lockedPos.forEach(({ pos, value }) => {
        if (pos >= 0 && pos < totalSlots) {
          newSlots[pos] = { tile: value, isLocked: true, slotType: slotTypes[pos] ?? 'px1', resolvedValue: null };
        }
      });

      rackTilesRef.current  = newRack;
      boardSlotsRef.current = newSlots;
      setRackTiles(newRack);
      setBoardSlots(newSlots);
      setPhase('playing');
    } catch (err) {
      console.error('Failed to load question:', err);
      toast.error('Failed to load question. Please try again.');
    }
  }, [assignmentId, stopTimer]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const init = async () => {
      try {
        const data = await api.assignments.student.getAssignment(assignmentId, user.id);
        if (cancelled) return;
        const a = data.assignment;
        setAssignment(a);

        if (a.studentProgress?.status === 'todo') {
          await api.assignments.student.start(assignmentId, user.id).catch(() => {});
        }

        if (!cancelled) await loadQuestion(a, user.id);
      } catch (err) {
        console.error('Failed to init assignment:', err);
        toast.error('Failed to load assignment.');
        navigate('/Assignments');
      }
    };

    init();
    return () => {
      cancelled = true;
      stopTimer();
    };
  }, [user, assignmentId]);

  // ── Board slot click (filled, user-placed only) ──────────────────────────
  const handleBoardSlotClick = useCallback((slotIndex) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setTimeout(() => { handlingRef.current = false; }, 50);

    // Always read from refs to avoid stale closure on mobile double-fire
    const curBoard = boardSlotsRef.current;
    const curRack  = rackTilesRef.current;

    const slot = curBoard[slotIndex];
    if (!slot || !slot.tile || slot.isLocked) return;

    // Re-click already-selected board tile
    if (selected?.source === 'board' && selected.index === slotIndex) {
      if (WILD_TILES.has(slot.tile)) {
        setWildPicker({ slotIndex });
        setSelected(null);
      } else {
        setSelected(null);
      }
      return;
    }

    // Rack tile selected → swap rack ↔ board
    if (selected?.source === 'rack') {
      const rackItem = curRack[selected.index];
      if (!rackItem) { setSelected(null); return; }
      const incomingTile = rackItem.tile;
      const displaced    = slot.tile;

      const newBoard = curBoard.map(sl => ({ ...sl }));
      const newRack  = curRack.map(t => t ? { ...t } : null);
      newBoard[slotIndex]     = { ...curBoard[slotIndex], tile: incomingTile, resolvedValue: null };
      newRack[selected.index] = { id: uid(), tile: displaced };
      boardSlotsRef.current = newBoard;
      rackTilesRef.current  = newRack;
      setBoardSlots(newBoard);
      setRackTiles(newRack);
      setSubmitResult(null);
      setSelected(null);
      if (WILD_TILES.has(incomingTile)) setWildPicker({ slotIndex });
      return;
    }

    // Board tile selected → swap board ↔ board
    if (selected?.source === 'board') {
      const fromSlot = curBoard[selected.index];
      const newBoard = curBoard.map(sl => ({ ...sl }));
      newBoard[slotIndex]      = { ...curBoard[slotIndex], tile: fromSlot.tile, resolvedValue: fromSlot.resolvedValue };
      newBoard[selected.index] = { ...curBoard[selected.index], tile: slot.tile, resolvedValue: slot.resolvedValue };
      boardSlotsRef.current = newBoard;
      setBoardSlots(newBoard);
      setSubmitResult(null);
      setSelected(null);
      return;
    }

    // Nothing selected → select
    setSelected({ source: 'board', index: slotIndex });
  }, [selected]);

  // ── Board empty slot click ───────────────────────────────────────────────
  const handleBoardEmptySlotClick = useCallback((slotIndex) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setTimeout(() => { handlingRef.current = false; }, 50);

    if (!selected) return;

    const curBoard = boardSlotsRef.current;
    const curRack  = rackTilesRef.current;

    if (selected.source === 'rack') {
      const rackItem = curRack[selected.index];
      if (!rackItem) { setSelected(null); return; }

      const newBoard = curBoard.map(sl => ({ ...sl }));
      const newRack  = curRack.map(t => t ? { ...t } : null);
      newBoard[slotIndex]     = { ...curBoard[slotIndex], tile: rackItem.tile, resolvedValue: null };
      newRack[selected.index] = null;
      boardSlotsRef.current = newBoard;
      rackTilesRef.current  = newRack;
      setBoardSlots(newBoard);
      setRackTiles(newRack);
      setSubmitResult(null);
      setSelected(null);
      if (WILD_TILES.has(rackItem.tile)) setWildPicker({ slotIndex });
      return;
    }

    if (selected.source === 'board') {
      const fromSlot = curBoard[selected.index];
      if (!fromSlot || !fromSlot.tile || fromSlot.isLocked) { setSelected(null); return; }

      const newBoard = curBoard.map(sl => ({ ...sl }));
      newBoard[slotIndex]      = { ...curBoard[slotIndex], tile: fromSlot.tile, resolvedValue: fromSlot.resolvedValue };
      newBoard[selected.index] = { ...curBoard[selected.index], tile: null, resolvedValue: null };
      boardSlotsRef.current = newBoard;
      setBoardSlots(newBoard);
      setSubmitResult(null);
      setSelected(null);
    }
  }, [selected]);

  // ── Rack tile click ──────────────────────────────────────────────────────
  const handleRackTileClick = useCallback((rackIndex) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setTimeout(() => { handlingRef.current = false; }, 50);

    if (wildPicker) { setWildPicker(null); return; }

    const curBoard = boardSlotsRef.current;
    const curRack  = rackTilesRef.current;

    const clickedItem = curRack[rackIndex];
    if (!clickedItem) return;

    // Board tile selected → swap rack ↔ board
    if (selected?.source === 'board') {
      const boardSlot = curBoard[selected.index];
      if (!boardSlot || boardSlot.isLocked) { setSelected(null); return; }

      const newBoard = curBoard.map(sl => ({ ...sl }));
      const newRack  = curRack.map(t => t ? { ...t } : null);
      newRack[rackIndex]       = { id: uid(), tile: curBoard[selected.index].tile };
      newBoard[selected.index] = { ...curBoard[selected.index], tile: clickedItem.tile, resolvedValue: null };
      boardSlotsRef.current = newBoard;
      rackTilesRef.current  = newRack;
      setBoardSlots(newBoard);
      setRackTiles(newRack);
      setSubmitResult(null);
      setSelected(null);
      if (WILD_TILES.has(clickedItem.tile)) setWildPicker({ slotIndex: selected.index });
      return;
    }

    // Same rack tile → deselect
    if (selected?.source === 'rack' && selected.index === rackIndex) {
      setSelected(null);
      return;
    }

    // Other rack tile → swap rack ↔ rack
    if (selected?.source === 'rack') {
      const newRack = curRack.map(t => t ? { ...t } : null);
      [newRack[selected.index], newRack[rackIndex]] = [newRack[rackIndex], newRack[selected.index]];
      rackTilesRef.current = newRack;
      setRackTiles(newRack);
      setSelected(null);
      return;
    }

    // Nothing selected → select
    setSelected({ source: 'rack', index: rackIndex });
  }, [selected, wildPicker]);

  // ── Rack empty slot click ────────────────────────────────────────────────
  const handleRackEmptySlotClick = useCallback((rackIndex) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setTimeout(() => { handlingRef.current = false; }, 50);

    if (!selected) return;

    const curBoard = boardSlotsRef.current;
    const curRack  = rackTilesRef.current;

    if (selected.source === 'rack') {
      const newRack = curRack.map(t => t ? { ...t } : null);
      newRack[rackIndex]      = newRack[selected.index];
      newRack[selected.index] = null;
      rackTilesRef.current = newRack;
      setRackTiles(newRack);
      setSelected(null);
      return;
    }

    if (selected.source === 'board') {
      const boardSlot = curBoard[selected.index];
      if (!boardSlot || !boardSlot.tile || boardSlot.isLocked) { setSelected(null); return; }

      const newBoard = curBoard.map(sl => ({ ...sl }));
      const newRack  = curRack.map(t => t ? { ...t } : null);
      newRack[rackIndex]       = { id: uid(), tile: boardSlot.tile };
      newBoard[selected.index] = { ...curBoard[selected.index], tile: null, resolvedValue: null };
      boardSlotsRef.current = newBoard;
      rackTilesRef.current  = newRack;
      setBoardSlots(newBoard);
      setRackTiles(newRack);
      setSubmitResult(null);
      setSelected(null);
    }
  }, [selected]);

  // ── Recall all ────────────────────────────────────────────────────────────
  const handleRecallAll = useCallback(() => {
    const curBoard = boardSlotsRef.current;
    const curRack  = rackTilesRef.current;
    const newBoard = curBoard.map(sl => ({ ...sl }));
    const newRack  = curRack.map(t => t ? { ...t } : null);
    for (let bi = 0; bi < newBoard.length; bi++) {
      const slot = newBoard[bi];
      if (!slot.tile || slot.isLocked) continue;
      const emptyIdx = newRack.findIndex(t => t === null);
      if (emptyIdx < 0) break;
      newRack[emptyIdx] = { id: uid(), tile: slot.tile };
      newBoard[bi] = { ...slot, tile: null, resolvedValue: null };
    }
    boardSlotsRef.current = newBoard;
    rackTilesRef.current  = newRack;
    setBoardSlots(newBoard);
    setRackTiles(newRack);
    setSubmitResult(null);
    setSelected(null);
    setWildPicker(null);
  }, []);

  // ── Wild tile resolve ────────────────────────────────────────────────────
  const handleWildResolve = useCallback((value) => {
    if (!wildPicker) return;
    const { slotIndex } = wildPicker;
    const newBoard = boardSlotsRef.current.map(sl => ({ ...sl }));
    newBoard[slotIndex] = { ...newBoard[slotIndex], resolvedValue: value };
    boardSlotsRef.current = newBoard;
    setBoardSlots(newBoard);
    setWildPicker(null);
  }, [wildPicker]);

  // ── Submit answer ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;

    const hasEmpty      = boardSlots.some(s => s.tile === null);
    const hasUnresolved = boardSlots.some(s => WILD_TILES.has(s.tile) && !s.resolvedValue);

    if (hasEmpty) {
      setSubmitResult({ correct: false, message: 'Place all tiles on the board first' });
      return;
    }
    if (hasUnresolved) {
      setSubmitResult({ correct: false, message: 'Tap your wildcard tile again to assign its value' });
      return;
    }

    const tiles = boardSlots.map(s => WILD_TILES.has(s.tile) ? s.resolvedValue : s.tile);
    const eq    = tiles.join('');
    const valid = isValidEquation(eq, puzzleEqCount, false);
    const score = valid ? calcScore(boardSlots) : 0;

    const elapsed = timerActive ? Date.now() - timerStartRef.current : timerMs;
    const timeTaken = Math.round(elapsed / 1000);

    if (valid) stopTimer();

    setSubmitResult({ correct: valid, message: valid ? `✓ ${eq}` : `✗ ${eq}`, score });

    if (!valid) return; // let player fix before submitting

    submittingRef.current = true;
    try {
      await api.assignments.student.submitAnswer(assignmentId, user.id, {
        questionNumber: answeredCount + 1,
        questionText: originalRackRef.current.join(' ') || rackTiles.filter(Boolean).map(t => t.tile).join(' ') || 'tiles',
        answerText: tiles.filter(Boolean).join(' '),
        timeTaken,
        score,
      });
      console.log(`✅ Q${answeredCount + 1} submitted — ${timeTaken}s, score ${score}`);
    } catch (err) {
      console.error('Failed to submit answer:', err);
      toast.error('Failed to save your answer. Please check your connection.');
    } finally {
      submittingRef.current = false;
    }

    setResults(prev => [
      ...prev,
      { eq, timeTaken, isCorrect: valid, score, solutionTiles, timerMs: elapsed },
    ]);
    setPhase('review');
  }, [boardSlots, rackTiles, timerActive, timerMs, answeredCount, assignmentId, user, solutionTiles, stopTimer, puzzleEqCount]);

  // ── Next question ─────────────────────────────────────────────────────────
  const handleNext = async () => {
    const newCount = answeredCount + 1;
    const total = assignment?.totalQuestions ?? 5;
    if (newCount >= total) {
      setPhase('complete');
    } else {
      await loadQuestion(assignment, user.id);
    }
  };

  // ── Stop assignment ───────────────────────────────────────────────────────
  const handleStop = () => {
    stopTimer();
    navigate('/Assignments');
  };

  const totalQuestions = assignment?.totalQuestions ?? 5;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  // ── Render: loading ──────────────────────────────────────────────────────
  if (phase === 'loading' || !assignment) {
    return (
      <div className="min-h-screen bg-green-950 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400">Preparing your problem...</p>
        </div>
      </div>
    );
  }

  // ── Render: complete ─────────────────────────────────────────────────────
  if (phase === 'complete') {
    const totalScore = results.reduce((s, r) => s + r.score, 0);
    const correct    = results.filter(r => r.isCorrect).length;
    const avgTime    = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.timeTaken, 0) / results.length)
      : 0;

    return (
      <div className="min-h-screen bg-linear-to-br from-green-950 to-green-900 p-4 md:p-8 text-white">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-3xl font-black">Assignment Complete!</h1>
            <p className="text-slate-400 mt-2">{assignment.title}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{totalScore}</p>
              <p className="text-xs text-slate-400 mt-1">Total Score</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{correct}/{results.length || totalQuestions}</p>
              <p className="text-xs text-slate-400 mt-1">Correct</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-yellow-400">{avgTime}s</p>
              <p className="text-xs text-slate-400 mt-1">Avg Time</p>
            </div>
          </div>

          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-300">Problem Summary</h3>
              {results.map((r, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Problem {i + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-400">{fmtMs(r.timerMs)}</span>
                      {r.isCorrect
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span className="text-sm font-bold text-amber-400">{r.score} pts</span>
                    </div>
                  </div>
                  <p className="font-mono text-sm text-slate-300">Your: {r.eq || '—'}</p>
                  {!r.isCorrect && r.solutionTiles?.length > 0 && (
                    <p className="font-mono text-sm text-emerald-400 mt-1">
                      Answer: {r.solutionTiles.join(' ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={() => navigate('/Assignments')}
            className="w-full bg-amber-700 hover:bg-amber-600 font-semibold py-3"
          >
            Back to Assignments
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: playing / review ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 via-amber-50/30 to-stone-50 pb-20">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        .font-mono { font-family: "JetBrains Mono", "Fira Code", monospace; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-400 font-mono tracking-widest uppercase">
              Problem {answeredCount + 1} / {totalQuestions}
            </p>
            <h2 className="font-bold text-stone-900 truncate">{assignment.title}</h2>
          </div>

          {/* Stop button */}
          {confirmStop ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-mono">Stop assignment?</span>
              <button
                onClick={handleStop}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-mono hover:bg-red-500 transition-colors cursor-pointer"
              >
                Yes, stop
              </button>
              <button
                onClick={() => setConfirmStop(false)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 text-xs font-mono hover:border-stone-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmStop(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-400 text-xs font-mono hover:border-red-300 hover:text-red-500 transition-colors cursor-pointer"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Stop
            </button>
          )}
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="h-1.5 bg-stone-200" />

        {/* ── Playing ── */}
        {phase === 'playing' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <BingoBoard
              boardSlots={boardSlots}
              selected={selected}
              onSlotClick={handleBoardSlotClick}
              onEmptySlotClick={handleBoardEmptySlotClick}
              submitResult={submitResult}
              allFilled={allFilled}
              onSubmit={handleSubmit}
              timerEnabled={true}
              timerRunning={timerActive}
              timerMs={timerMs}
              puzzleHidden={puzzleHidden}
              onStartTimer={handleStartTimer}
            />

            {!puzzleHidden && (
              <>
                <BingoRack
                  rackTiles={rackTiles}
                  selected={selected}
                  onTileClick={handleRackTileClick}
                  onEmptySlotClick={handleRackEmptySlotClick}
                  onRecallAll={handleRecallAll}
                />

                {/* Wild picker inline */}
                {wildPicker !== null && (() => {
                  const slot = boardSlots[wildPicker.slotIndex];
                  const options = slot?.tile === '+/-' ? ['+', '-']
                    : slot?.tile === '×/÷' ? ['×', '÷']
                    : ['=', '+', '-', '×', '÷', '0','1','2','3','4','5','6','7','8','9','10'];
                  return (
                    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 mb-4">
                      <p className="text-[9px] font-mono tracking-widest uppercase text-amber-600 mb-3">
                        Choose value for "{slot?.tile}"
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {options.map(v => (
                          <button
                            key={v}
                            onClick={() => handleWildResolve(v)}
                            className="px-3 py-1.5 rounded-lg border border-stone-200 font-mono text-sm hover:border-amber-400 hover:bg-amber-50 transition-colors cursor-pointer"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Submit error */}
                {submitResult && !submitResult.correct && (
                  <div className="mb-4 px-5 py-3 rounded-xl border border-red-200 bg-red-50 font-mono text-[11px] text-red-600 tracking-wide text-center">
                    {submitResult.message}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Review ── */}
        {phase === 'review' && results.length > 0 && (() => {
          const r = results[results.length - 1];
          return (
            <div className="space-y-4" style={{ animation: 'fadeUp 0.3s ease' }}>
              <div className={cn(
                'rounded-2xl p-5 text-center border',
                r.isCorrect
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              )}>
                {r.isCorrect
                  ? <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  : <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />}
                <p className="text-2xl font-black text-stone-900">{r.score} pts</p>
                <p className="text-stone-500 text-sm mt-1">
                  {r.isCorrect ? 'Correct!' : 'Incorrect'} · {fmtMs(r.timerMs)}
                </p>
              </div>

              {!r.isCorrect && r.solutionTiles?.length > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                  <p className="text-xs text-emerald-600 font-mono mb-1">Answer</p>
                  <p className="font-mono text-emerald-700">{r.solutionTiles.join(' ')}</p>
                </div>
              )}

              <Button
                onClick={handleNext}
                className="w-full bg-amber-700 hover:bg-amber-600 font-semibold py-3"
              >
                {answeredCount + 1 >= totalQuestions ? 'Finish' : (
                  <><span>Next Problem</span> <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
