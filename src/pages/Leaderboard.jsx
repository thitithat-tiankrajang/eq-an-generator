import { Trophy, Zap, Crown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Leaderboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-yellow-50 to-green-100 text-slate-800 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-yellow-400 to-green-600 shadow-md">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-green-700 to-yellow-600 bg-clip-text text-transparent">
              Leaderboard
            </h1>
          </div>
          <p className="text-slate-500 text-sm">
            Top A-Math Players
          </p>
        </div>

        {/* Coming Soon */}
        <Card className="bg-white border border-green-100 shadow-md">
          <CardContent className="p-10 text-center">
            <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-slate-800">
              Coming Soon
            </p>
            <p className="text-slate-500 text-sm mt-1">
              Leaderboard system is under development
            </p>
          </CardContent>
        </Card>

        {/* CTA */}
        <Card className="bg-gradient-to-br from-green-100 to-yellow-100 border border-green-200 shadow-md hover:shadow-lg transition-all">
          <CardContent className="p-6 text-center">
            <div className="flex justify-center mb-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-yellow-400 to-green-600 shadow">
                <Zap className="w-5 h-5 text-white" />
              </div>
            </div>

            <p className="font-bold text-slate-800 text-lg">
              Start Playing Now
            </p>
            <p className="text-slate-600 text-sm mt-1">
              Practice your A-Math skills anytime
            </p>
          </CardContent>
        </Card>

        {/* Preview leaderboard */}
        <Card className="bg-white border border-green-100 shadow-md">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Preview</span>
              <span>Top Player</span>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-100">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-green-600 flex items-center justify-center font-bold text-white shadow-sm">
                1
              </div>

              <div className="flex-1">
                <p className="font-semibold text-slate-800">Player Name</p>
                <p className="text-xs text-slate-500">Score: 9999</p>
              </div>

              <Crown className="w-5 h-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}