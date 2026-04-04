import { Button } from "@/components/ui/button";
import { Trophy, RotateCcw, Star, Clock, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ScoreDisplay({ result, onPlayAgain, onViewLeaderboard }) {
  const { isCorrect, score, breakdown, timeTaken, equation, correctSolutions, leftoverTiles, expired } = result;

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div className={cn(
        "rounded-2xl p-6 text-center",
        isCorrect ? "bg-emerald-500/20 border border-emerald-400/30" : "bg-red-500/20 border border-red-400/30"
      )}>
        {expired ? (
          <>
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-amber-300">Time's Up!</h2>
          </>
        ) : isCorrect ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-emerald-300">Correct!</h2>
          </>
        ) : (
          <>
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-red-300">Incorrect</h2>
          </>
        )}
        <div className="mt-4">
          <p className="text-4xl font-black text-white">{score}</p>
          <p className="text-slate-400 text-sm mt-1">Points earned</p>
        </div>
      </div>

      {/* Score breakdown */}
      {breakdown && isCorrect && (
        <div className="bg-white/5 rounded-xl p-4 space-y-2 border border-white/10">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Score Breakdown</p>
          <BreakdownRow label="Base Score" value={breakdown.base_score} icon={Star} color="text-amber-400" />
          <BreakdownRow label="Time Bonus" value={`+${breakdown.time_bonus}`} icon={Clock} color="text-blue-400" />
          {breakdown.special_slot_bonus > 0 && (
            <BreakdownRow label="Special Slots" value={`+${breakdown.special_slot_bonus}`} icon={Star} color="text-purple-400" />
          )}
          {breakdown.leftover_penalty > 0 && (
            <BreakdownRow label="Leftover Penalty" value={`-${breakdown.leftover_penalty}`} color="text-red-400" />
          )}
          <div className="border-t border-white/10 pt-2 mt-2">
            <BreakdownRow label={`×${breakdown.complexity_multiplier} Difficulty`} value={`= ${score}`} color="text-emerald-400" bold />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
          <Clock className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-white">{timeTaken}s</p>
          <p className="text-xs text-slate-400">Time taken</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
          <p className="text-xl font-bold text-white">{leftoverTiles?.length ?? 0}</p>
          <p className="text-xs text-slate-400">Unused tiles</p>
        </div>
      </div>

      {/* Your answer */}
      {equation && (
        <div className="bg-white/5 rounded-xl p-3 border border-white/10">
          <p className="text-xs text-slate-400 mb-1">Your answer</p>
          <p className="font-mono text-white text-sm">{equation}</p>
        </div>
      )}

      {/* Correct solutions */}
      {!isCorrect && correctSolutions?.length > 0 && (
        <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-400/20">
          <p className="text-xs text-emerald-400 mb-1">Sample correct answer</p>
          <p className="font-mono text-emerald-300 text-sm">{correctSolutions[0]}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={onPlayAgain} className="flex-1 bg-blue-600 hover:bg-blue-500">
          <RotateCcw className="w-4 h-4 mr-2" /> Play Again
        </Button>
        <Button onClick={onViewLeaderboard} variant="outline" className="flex-1 border-white/20 text-white hover:bg-white/10">
          <Trophy className="w-4 h-4 mr-2" /> Leaderboard
        </Button>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, icon: Icon, color, bold }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`w-3.5 h-3.5 ${color}`} />}
        <span className={`text-slate-300 ${bold ? "font-semibold" : ""}`}>{label}</span>
      </div>
      <span className={`font-mono font-semibold ${color || "text-white"}`}>{value}</span>
    </div>
  );
}