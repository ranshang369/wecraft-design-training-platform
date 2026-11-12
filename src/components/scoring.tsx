"use client";
import { DIMENSIONS } from "@/lib/constants";

export type ScoreValue = Record<string, number | null>;

export function emptyScores(): ScoreValue {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension.code, 4]));
}

export function ScoreInputs({ value, onChange, allowNa = true }: { value: ScoreValue; onChange: (value: ScoreValue) => void; allowNa?: boolean }) {
  return <div className="score-grid">{DIMENSIONS.map((dimension) => (
    <div className="score-field" key={dimension.code}>
      <span>{dimension.label}{dimension.code === "IMAGE_NARRATIVE" ? <span className="hint">（无图可选 N/A）</span> : null}</span>
      <select
        className="select"
        value={value[dimension.code] == null ? "N/A" : String(value[dimension.code])}
        onChange={(event) => onChange({ ...value, [dimension.code]: event.target.value === "N/A" ? null : Number(event.target.value) })}
      >
        {allowNa && dimension.code === "IMAGE_NARRATIVE" ? <option value="N/A">N/A</option> : null}
        {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
      </select>
    </div>
  ))}</div>;
}

export function ScoreTable({ scores }: { scores: Array<{ dimensionCode: string; score: number | null; isNa: boolean }> | undefined }) {
  if (!scores?.length) return <span className="muted small">未评分</span>;
  return <div className="small">{DIMENSIONS.map((dimension) => {
    const score = scores.find((row) => row.dimensionCode === dimension.code);
    return <span key={dimension.code} style={{ display: "inline-block", marginRight: 12 }}>{dimension.label}：{score?.isNa ? "N/A" : score?.score ?? "—"}</span>;
  })}</div>;
}
