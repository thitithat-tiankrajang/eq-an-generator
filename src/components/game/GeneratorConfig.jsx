import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";

const MODES = [
  { value: 1, label: "Mode 1", desc: "Use ALL tiles" },
  { value: 2, label: "Mode 2", desc: "ALL tiles · Max score" },
  { value: 3, label: "Mode 3", desc: "SOME tiles · Best net" },
];

const DIFFICULTIES = ["easy", "medium", "hard", "expert"];
const OPERATORS = ["+", "-", "*", "/"];

export default function GeneratorConfig({ config, onChange }) {
  const toggle = (key, val) => onChange({ ...config, [key]: val });

  const toggleOp = (op) => {
    const current = config.allowed_operators || [];
    const next = current.includes(op) ? current.filter(o => o !== op) : [...current, op];
    if (next.length === 0) return; // must have at least 1
    toggle("allowed_operators", next);
  };

  return (
    <Card className="bg-white/5 border-white/10 text-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="w-4 h-4 text-blue-400" />
          Game Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Mode selection */}
        <div>
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Generator Mode</p>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map(m => (
              <button
                key={m.value}
                onClick={() => toggle("mode", m.value)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  config.mode === m.value
                    ? "border-blue-400 bg-blue-500/20"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                <p className="text-sm font-semibold">{m.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Difficulty</p>
          <div className="flex gap-2 flex-wrap">
            {DIFFICULTIES.map(d => (
              <button
                key={d}
                onClick={() => toggle("difficulty", d)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                  config.difficulty === d
                    ? "bg-blue-500 text-white"
                    : "bg-white/10 text-slate-300 hover:bg-white/20"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Operators */}
        <div>
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Operators</p>
          <div className="flex gap-2">
            {OPERATORS.map(op => (
              <button
                key={op}
                onClick={() => toggleOp(op)}
                className={`w-10 h-10 rounded-lg font-bold text-base transition-all ${
                  (config.allowed_operators || []).includes(op)
                    ? "bg-blue-500 text-white"
                    : "bg-white/10 text-slate-400 hover:bg-white/20"
                }`}
              >
                {op}
              </button>
            ))}
          </div>
        </div>

        {/* Time limit */}
        <div>
          <div className="flex justify-between mb-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Time Limit</p>
            <span className="text-xs font-mono text-blue-300">{config.time_limit}s</span>
          </div>
          <Slider
            min={30} max={300} step={15}
            value={[config.time_limit || 120]}
            onValueChange={([v]) => toggle("time_limit", v)}
            className="w-full"
          />
        </div>

        {/* Special slots */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium text-white">Special Score Slots</Label>
            <p className="text-xs text-slate-400">Enable ×2 and ×3 multiplier slots</p>
          </div>
          <Switch
            checked={config.special_slots_enabled}
            onCheckedChange={(v) => toggle("special_slots_enabled", v)}
          />
        </div>

      </CardContent>
    </Card>
  );
}