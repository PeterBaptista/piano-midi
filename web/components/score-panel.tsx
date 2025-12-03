"use client"

import type { GameScore, NoteHit } from "@/lib/midi-utils"
import { Trophy, Zap, Target } from "lucide-react"

interface ScorePanelProps {
  score: GameScore
  recentHits: NoteHit[]
  totalNotes: number
}

export function ScorePanel({ score, recentHits, totalNotes }: ScorePanelProps) {
  const completedNotes = score.perfect + score.good + score.miss
  const accuracy =
    completedNotes > 0 ? Math.round(((score.perfect * 100 + score.good * 50) / (completedNotes * 100)) * 100) : 100

  const lastHit = recentHits[recentHits.length - 1]

  return (
    <div className="flex items-center gap-6 px-4 py-3 bg-slate-900/80 border-b border-slate-700">
      {/* Score */}
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" />
        <div className="text-right">
          <div className="text-2xl font-bold text-white tabular-nums">{score.score.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Score</div>
        </div>
      </div>

      {/* Combo */}
      <div className="flex items-center gap-2">
        <Zap className={`w-5 h-5 ${score.combo >= 10 ? "text-orange-500" : "text-slate-500"}`} />
        <div className="text-right">
          <div
            className={`text-xl font-bold tabular-nums ${
              score.combo >= 50
                ? "text-orange-400"
                : score.combo >= 20
                  ? "text-yellow-400"
                  : score.combo >= 10
                    ? "text-green-400"
                    : "text-white"
            }`}
          >
            {score.combo}x
          </div>
          <div className="text-xs text-slate-400">Combo</div>
        </div>
      </div>

      {/* Accuracy */}
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-blue-500" />
        <div className="text-right">
          <div className="text-xl font-bold text-white tabular-nums">{accuracy}%</div>
          <div className="text-xs text-slate-400">Accuracy</div>
        </div>
      </div>

      {/* Hit counts */}
      <div className="flex items-center gap-4 ml-4 pl-4 border-l border-slate-700">
        <div className="text-center">
          <div className="text-lg font-bold text-green-400 tabular-nums">{score.perfect}</div>
          <div className="text-xs text-slate-500">Perfect</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-400 tabular-nums">{score.good}</div>
          <div className="text-xs text-slate-500">Good</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-red-400 tabular-nums">{score.miss}</div>
          <div className="text-xs text-slate-500">Miss</div>
        </div>
      </div>

      {/* Last hit feedback */}
      <div className="ml-auto">
        {lastHit && (
          <div
            className={`text-lg font-bold uppercase animate-pulse ${
              lastHit.rating === "perfect"
                ? "text-green-400"
                : lastHit.rating === "good"
                  ? "text-yellow-400"
                  : "text-red-400"
            }`}
          >
            {lastHit.rating}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="text-right">
        <div className="text-sm text-slate-400">
          {completedNotes} / {totalNotes}
        </div>
        <div className="w-24 h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${totalNotes > 0 ? (completedNotes / totalNotes) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}
