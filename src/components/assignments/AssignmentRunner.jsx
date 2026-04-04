/**
 * AssignmentRunner — wired to the real backend API.
 *
 * Flow per question:
 *  1. GET current-set  → check currentQuestionElements (persisted tiles)
 *  2. If no elements   → generateProblem locally, PATCH current-question to persist
 *  3. Player arranges tiles on GameBoard
 *  4. On submit        → POST answers endpoint
 *  5. After submit     → reload current-set; if all answered → "complete" phase
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/apiClient";
import { generateProblem, validateEquation, calculateScore } from "@/components/game/gameEngine";
import GameBoard from "@/components/game/GameBoard";
import TileRack from "@/components/game/TileRack";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, ArrowRight, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Build a gameEngine config from a real API optionSet (or use safe defaults)
function buildGameConfig(optionSet, timeLimitSeconds) {
  const opts = optionSet?.options || {};
  return {
    mode: 1,
    difficulty: 'medium',
    allowed_operators: ['+', '-', '*', '/'],
    num_locked_tiles: opts.lockMode ? (opts.lockCount || 0) : 0,
    tile_bias: 'mixed',
    special_slots_enabled: false,
    time_limit: timeLimitSeconds || 120,
  };
}

export default function AssignmentRunner({ assignment, profile, onExit }) {
  const [phase, setPhase] = useState('loading'); // loading | playing | review | complete
  const [boardSlots, setBoardSlots] = useState(Array(15).fill(null));
  const [handTiles, setHandTiles] = useState([]);
  const [selectedTile, setSelectedTile] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [results, setResults] = useState([]);
  const [currentSetInfo, setCurrentSetInfo] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const totalQuestions = assignment.num_problems || assignment.totalQuestions || 5;

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const submittingRef = useRef(false);

  // ── Load / reload current question ────────────────────────────────────────
  const loadCurrentQuestion = useCallback(async () => {
    setPhase('loading');
    setSelectedTile(null);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const setInfo = await api.assignments.student.getCurrentSet(assignment.id, profile.id);
      setCurrentSetInfo(setInfo);

      const answersData = await api.assignments.student
        .getAnswers(assignment.id, profile.id)
        .catch(() => ({ answeredCount: 0, answers: [] }));
      const answered = answersData.answeredCount ?? answersData.answers?.length ?? 0;
      setAnsweredCount(answered);

      if (answered >= totalQuestions) {
        setPhase('complete');
        return;
      }

      let tilesInHand = setInfo.currentQuestionElements || [];
      let lockedPos = setInfo.currentQuestionListPosLock || [];
      let solutionTokens = setInfo.currentQuestionSolutionTokens || [];

      if (!tilesInHand.length) {
        const config = buildGameConfig(setInfo.currentSet, assignment.time_limit_seconds);
        const gen = generateProblem(config);
        tilesInHand = gen.tilesInHand;
        lockedPos = gen.lockedTiles.map((lt) => ({ pos: lt.slot, value: lt.tile }));
        solutionTokens = gen.correctSolutions;

        try {
          await api.assignments.student.setCurrentQuestion(assignment.id, profile.id, {
            elements: tilesInHand,
            listPosLock: lockedPos,
            solutionTokens,
          });
        } catch (err) {
          console.warn('Could not persist question elements:', err);
        }
      }

      const hand = tilesInHand.map((t, i) => ({ id: `tile-${i}`, value: t, used: false }));
      const slots = Array(15).fill(null).map((_, i) => {
        const lp = lockedPos.find((p) => p.pos === i);
        return lp ? { id: `locked-${i}`, value: lp.value, locked: true } : null;
      });

      setHandTiles(hand);
      setBoardSlots(slots);
      startTimeRef.current = Date.now();

      if (assignment.time_limit_seconds) {
        setTimeLeft(assignment.time_limit_seconds);
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) { clearInterval(timerRef.current); handleSubmit(true); return 0; }
            return prev - 1;
          });
        }, 1000);
      }

      setPhase('playing');
    } catch (err) {
      console.error('Failed to load question:', err);
      toast.error('Failed to load question. Please try again.');
      setPhase('playing');
    }
  }, [assignment.id, assignment.time_limit_seconds, profile.id, totalQuestions]);

  useEffect(() => {
    const init = async () => {
      if (assignment.studentProgress?.status === 'todo') {
        await api.assignments.student.start(assignment.id, profile.id).catch(() => {});
      }
      loadCurrentQuestion();
    };
    init();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Tile interaction ──────────────────────────────────────────────────────
  const handleTileSelect = (tile) => setSelectedTile(tile.used ? null : tile);

  const handleSlotClick = (slotIndex) => {
    if (!selectedTile || boardSlots[slotIndex]?.locked) return;
    if (boardSlots[slotIndex]) {
      const returning = boardSlots[slotIndex];
      setHandTiles((prev) => prev.map((t) => t.id === returning.id ? { ...t, used: false } : t));
    }
    const newSlots = [...boardSlots];
    newSlots[slotIndex] = { ...selectedTile, locked: false };
    setBoardSlots(newSlots);
    setHandTiles((prev) => prev.map((t) => t.id === selectedTile.id ? { ...t, used: true } : t));
    setSelectedTile(null);
  };

  const handleRemoveTile = (slotIndex) => {
    const slot = boardSlots[slotIndex];
    if (!slot || slot.locked) return;
    setHandTiles((prev) => prev.map((t) => t.id === slot.id ? { ...t, used: false } : t));
    const newSlots = [...boardSlots];
    newSlots[slotIndex] = null;
    setBoardSlots(newSlots);
  };

  // ── Submit answer ─────────────────────────────────────────────────────────
  const handleSubmit = async (expired = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);

    const usedSlots = boardSlots.map((s) => s ? s.value : null);
    const equationStr = usedSlots.map((s) => s || '_').join(' ');
    const timeTaken = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const leftoverTiles = handTiles.filter((t) => !t.used).map((t) => t.value);

    const validation = validateEquation(usedSlots, []);
    const config = buildGameConfig(currentSetInfo?.currentSet, assignment.time_limit_seconds);
    const scoreResult = calculateScore(validation, timeTaken, leftoverTiles, config, []);

    const resultEntry = {
      equationStr,
      timeTaken,
      isCorrect: validation.valid && !expired,
      score: expired ? 0 : scoreResult.total,
      correctSolutions: currentSetInfo?.currentQuestionSolutionTokens || [],
    };
    setResults((prev) => [...prev, resultEntry]);

    try {
      const questionText = handTiles.map((t) => t.value).join(' ');
      await api.assignments.student.submitAnswer(assignment.id, profile.id, {
        questionNumber: answeredCount + 1,
        questionText,
        answerText: equationStr,
      });
    } catch (err) {
      console.error('Failed to submit answer:', err);
      toast.error('Failed to save your answer. Please check your connection.');
    }

    submittingRef.current = false;
    setPhase('review');
  };

  // ── Next question ─────────────────────────────────────────────────────────
  const handleNext = async () => {
    if (answeredCount + 1 >= totalQuestions) {
      setPhase('complete');
    } else {
      await loadCurrentQuestion();
    }
  };

  const progress = (answeredCount / totalQuestions) * 100;

  // ── Render: loading ───────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400">Preparing your problem...</p>
        </div>
      </div>
    );
  }

  // ── Render: complete ──────────────────────────────────────────────────────
  if (phase === 'complete') {
    const totalScore = results.reduce((s, r) => s + r.score, 0);
    const correct = results.filter((r) => r.isCorrect).length;
    const avgTime = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.timeTaken, 0) / results.length)
      : 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 p-4 md:p-8 text-white">
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
              <p className="text-3xl font-bold text-blue-400">{avgTime}s</p>
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
                    <div className="flex items-center gap-2">
                      {r.isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span className="text-sm font-bold">{r.score} pts</span>
                    </div>
                  </div>
                  <p className="font-mono text-sm text-slate-300">Your: {r.equationStr.replace(/ _/g, '').trim()}</p>
                  {!r.isCorrect && r.correctSolutions[0] && (
                    <p className="font-mono text-sm text-emerald-400 mt-1">Sample: {r.correctSolutions[0]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button onClick={onExit} className="w-full bg-blue-600 hover:bg-blue-500">Back to Assignments</Button>
        </div>
      </div>
    );
  }

  // ── Render: playing / review ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 p-4 md:p-6 text-white">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Problem {answeredCount + 1} of {totalQuestions}</p>
            <h2 className="font-bold text-white truncate">{assignment.title}</h2>
          </div>
          <div className="flex items-center gap-3">
            {timeLeft !== null && (
              <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold",
                timeLeft < 30 ? "bg-red-500/20 text-red-300" : "bg-white/10")}>
                <Timer className="w-3.5 h-3.5" />
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={onExit} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Progress value={progress} className="h-1.5 bg-white/10" />

        {/* Playing phase */}
        {phase === 'playing' && (
          <>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <p className="text-xs text-slate-400 px-1 pb-2">Arrange the tiles to form a valid equation</p>
              <GameBoard
                slots={boardSlots}
                specialSlots={[]}
                onSlotClick={handleSlotClick}
                onRemoveTile={handleRemoveTile}
                selectedTile={selectedTile}
              />
            </div>
            <TileRack tiles={handTiles} selectedTile={selectedTile} onSelect={handleTileSelect} />
            <Button onClick={() => handleSubmit(false)} className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold py-3">
              Submit Answer
            </Button>
          </>
        )}

        {/* Review phase */}
        {phase === 'review' && results.length > 0 && (() => {
          const r = results[results.length - 1];
          return (
            <div className="space-y-4">
              <div className={cn("rounded-xl p-5 text-center border",
                r.isCorrect ? "bg-emerald-500/20 border-emerald-400/30" : "bg-red-500/20 border-red-400/30")}>
                {r.isCorrect ? <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" /> : <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-2" />}
                <p className="text-2xl font-black">{r.score} pts</p>
                <p className="text-slate-400 text-sm">{r.isCorrect ? "Correct!" : "Incorrect"} · {r.timeTaken}s</p>
              </div>
              {!r.isCorrect && r.correctSolutions[0] && (
                <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-400/20">
                  <p className="text-xs text-emerald-400 mb-1">Sample answer</p>
                  <p className="font-mono text-emerald-300">{r.correctSolutions[0]}</p>
                </div>
              )}
              <Button onClick={handleNext} className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-3">
                {answeredCount + 1 >= totalQuestions ? "Finish" : <>Next Problem <ArrowRight className="w-4 h-4 ml-2" /></>}
              </Button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}