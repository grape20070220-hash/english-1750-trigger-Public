"use client";

import { useEffect, useState } from "react";
import { SparkIcon } from "@/components/icons";

type Budget = {
  configured: boolean;
  remainingUsd: number | null;
  remainingMinutes: number | null;
  status: "unset" | "ok" | "low" | "critical" | "empty";
};

function remainingText(budget: Budget | null) {
  if (!budget?.configured) return "既存のOpenAI残高を同期";
  const minutes = budget.remainingMinutes;
  if (minutes === null) return "残高を再同期";
  if (minutes < 60) return `あと約${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `あと約${hours}時間${mins}分` : `あと約${hours}時間`;
}

export default function ApiBudgetSummary({ onOpen }: { onOpen: () => void }) {
  const [budget, setBudget] = useState<Budget | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/api-budget", { cache: "no-store" });
        const data = await response.json();
        if (active && response.ok) setBudget(data);
      } catch {}
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const status = budget?.status || "unset";
  const statusLabel = status === "empty" ? "残高切れ" : status === "critical" ? "残りわずか" : status === "low" ? "少なめ" : status === "ok" ? "利用可能" : "既存残高 未同期";
  const actionLabel = budget?.configured ? "詳細・残高再同期 →" : "既存残高を同期 →";

  return (
    <div className="apiBudgetDock">
      <style>{`
        .apiBudgetDock{position:sticky;top:0;z-index:45;padding:10px 14px 0;display:flex;justify-content:center;pointer-events:none}
        .apiBudgetQuick{pointer-events:auto;width:min(920px,100%);border:1px solid #dddff3;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);border-radius:16px;padding:11px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 28px rgba(48,49,92,.10);text-align:left;color:#25263a;cursor:pointer}
        .apiBudgetQuick svg{width:20px;height:20px;flex:0 0 auto;color:#5b5ce2}
        .apiBudgetCopy{min-width:0;flex:1}.apiBudgetCopy small{display:block;font-size:9px;font-weight:850;letter-spacing:.08em;color:#8a8c9d}.apiBudgetCopy strong{display:block;margin-top:2px;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.apiBudgetMeta{display:flex;align-items:center;gap:8px;flex:0 0 auto}.apiBudgetMeta span{font-size:10px;font-weight:800;border-radius:999px;padding:6px 8px;background:#eeeeff;color:#5658cc}.apiBudgetMeta b{font-size:11px;color:#5b5ce2;white-space:nowrap}.apiBudgetQuick.low .apiBudgetMeta span{background:#fff4df;color:#a76a18}.apiBudgetQuick.critical .apiBudgetMeta span,.apiBudgetQuick.empty .apiBudgetMeta span{background:#ffe9e7;color:#b84b43}.apiBudgetQuick.unset{border-color:#cfd1f6;background:#f8f8ff}
        @media(max-width:620px){.apiBudgetDock{padding:8px 10px 0}.apiBudgetQuick{border-radius:14px;padding:10px 12px;gap:9px}.apiBudgetCopy strong{font-size:14px}.apiBudgetMeta span{display:none}.apiBudgetMeta b{font-size:10px}}
      `}</style>
      <button className={`apiBudgetQuick ${status}`} onClick={onOpen} aria-label="API残量・既存残高同期・チャージを開く">
        <SparkIcon />
        <div className="apiBudgetCopy">
          <small>API 残量</small>
          <strong>{budget ? remainingText(budget) : "残量を確認中…"}{budget?.configured && budget.remainingUsd !== null && budget.remainingUsd !== undefined ? ` ・ $${budget.remainingUsd.toFixed(2)}` : ""}</strong>
        </div>
        <div className="apiBudgetMeta"><span>{statusLabel}</span><b>{actionLabel}</b></div>
      </button>
    </div>
  );
}
