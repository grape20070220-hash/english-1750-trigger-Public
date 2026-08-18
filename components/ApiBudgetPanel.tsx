"use client";

import { useEffect, useMemo, useState } from "react";
import { SparkIcon } from "@/components/icons";

type Budget = {
  configured: boolean;
  model: string;
  estimatedUsdPerMinute: number;
  estimatedCostPer10MinutesUsd: number;
  totalConversationMinutes: number;
  estimatedTotalCostUsd: number;
  balanceUsd: number | null;
  estimatedSpentSinceAnchorUsd?: number;
  remainingUsd: number | null;
  remainingMinutes: number | null;
  status: "unset" | "ok" | "low" | "critical" | "empty";
  updatedAt?: string;
};

const BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";
const CREDIT_URL = "https://platform.openai.com/settings/organization/billing/credit-grants";
const PENDING_KEY = "eigoloop-billing-return-pending-v1";

function money(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function minutesText(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `約${value}分`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m ? `約${h}時間${m}分` : `約${h}時間`;
}

export default function ApiBudgetPanel() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/api-budget", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setBudget(d);
      else setNotice("API残量を読み込めませんでした");
    } catch {
      setNotice("API残量を読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onUpdated = () => void load();
    window.addEventListener("eigoloop-budget-updated", onUpdated);
    return () => window.removeEventListener("eigoloop-budget-updated", onUpdated);
  }, []);

  function openBilling() {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ openedAt: Date.now() })); } catch {}
    window.open(BILLING_URL, "_blank", "noopener,noreferrer");
  }

  async function saveBalance(action: "set" | "add") {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      setNotice("金額を入力してください");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const r = await fetch("/api/api-budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amountUsd: n }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "save failed");
      setBudget(d);
      setAmount("");
      window.dispatchEvent(new Event("eigoloop-budget-updated"));
      setNotice(action === "set" ? "残高を同期しました" : "追加購入分を反映しました");
    } catch {
      setNotice("残高の更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const percent = useMemo(() => {
    if (!budget?.configured || !budget.balanceUsd || budget.remainingUsd === null) return 0;
    return Math.max(0, Math.min(100, Math.round((budget.remainingUsd / budget.balanceUsd) * 100)));
  }, [budget]);

  const statusCopy = budget?.status === "empty"
    ? "残高切れの可能性があります"
    : budget?.status === "critical"
      ? "残り30分以下の目安です"
      : budget?.status === "low"
        ? "そろそろチャージ推奨"
        : "まだ余裕があります";

  return <div className="page contentPage">
    <style>{`
      .apiHero{padding:22px;margin-top:14px}.apiHeroTop{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.apiHero h2{margin:5px 0 6px;font-size:25px}.apiHero p{margin:0;color:#7b7e91;font-size:12px;line-height:1.65}.apiOrb{width:48px;height:48px;border-radius:16px;background:#efefff;color:#5759d6;display:grid;place-items:center}.apiOrb svg{width:22px;height:22px}.budgetGrid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-top:14px}.budgetCard{padding:20px}.budgetMain{font-size:34px;font-weight:900;margin:5px 0 2px}.budgetSub{font-size:12px;color:#85889a}.budgetTrack{height:10px;border-radius:999px;background:#ececf3;overflow:hidden;margin:16px 0 8px}.budgetTrack i{display:block;height:100%;background:#6466df;border-radius:999px;transition:width .25s}.statusChip{display:inline-flex;border-radius:999px;padding:7px 10px;background:#efefff;color:#5658d0;font-size:10px;font-weight:850}.statusChip.low{background:#fff4df;color:#a06a17}.statusChip.critical,.statusChip.empty{background:#ffe9e9;color:#b74b4b}.costStats{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:13px}.costStats div{background:#f8f8fc;border-radius:12px;padding:12px}.costStats span{display:block;font-size:9px;color:#9193a3}.costStats b{display:block;margin-top:4px;font-size:16px}.creditCard{padding:20px;margin-top:14px}.creditActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.creditActions button{border:0;border-radius:11px;padding:10px 13px;font-weight:850;background:#5b5ce2;color:#fff}.creditActions button.secondary{background:#ececf7;color:#5d5f77}.creditField{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end;margin-top:13px}.creditField label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:800}.creditField input{border:1px solid #dfe1eb;background:#fbfbfd;border-radius:11px;padding:10px 11px;font-size:14px}.creditField button{border:0;border-radius:11px;padding:10px 12px;font-weight:850;background:#5b5ce2;color:#fff}.creditField button.secondary{background:#ececf7;color:#5d5f77}.apiNote{margin-top:12px;padding:12px;border-radius:12px;background:#f8f8fc;color:#7b7e91;font-size:10px;line-height:1.65}.apiMeta{padding:18px;margin-top:14px}.apiMeta h3{margin:5px 0 10px;font-size:15px}.apiMeta ul{margin:0;padding-left:18px;color:#777a8d;font-size:11px;line-height:1.7}@media(max-width:700px){.budgetGrid{grid-template-columns:1fr}.creditField{grid-template-columns:1fr 1fr}.creditField label{grid-column:1/-1}.budgetMain{font-size:30px}}
    `}</style>

    <header className="pageHeader"><div><div className="eyebrow">API & CREDITS</div><h2>API残量</h2></div></header>

    <section className="card apiHero">
      <div className="apiHeroTop"><div><div className="sectionLabel">EIGOLOOP API METER</div><h2>{loading ? "読み込み中…" : budget?.configured ? minutesText(budget.remainingMinutes) : "既存のOpenAI残高を同期"}</h2><p>{budget?.configured?"今のEigoLoop構成で、あとどれくらい英会話できるかを見える化します。":"OpenAIにすでに残っているAPIクレジットも、現在残高を入力すれば最初から残り時間へ含められます。"}</p></div><div className="apiOrb"><SparkIcon/></div></div>
    </section>

    {budget?.configured ? <div className="budgetGrid">
      <section className="card budgetCard">
        <div className="sectionLabel">ESTIMATED REMAINING</div>
        <div className="budgetMain">{minutesText(budget.remainingMinutes)}</div>
        <div className="budgetSub">推定残高 {money(budget.remainingUsd)}</div>
        <div className="budgetTrack"><i style={{width:`${percent}%`}}/></div>
        <span className={`statusChip ${budget.status}`}>{statusCopy}</span>
      </section>
      <section className="card budgetCard">
        <div className="sectionLabel">COST ESTIMATE</div>
        <div className="costStats"><div><span>10分あたり</span><b>{money(budget.estimatedCostPer10MinutesUsd)}</b></div><div><span>1分あたり</span><b>{money(budget.estimatedUsdPerMinute)}</b></div><div><span>EigoLoop累計</span><b>{budget.totalConversationMinutes}分</b></div><div><span>累計推定API費</span><b>{money(budget.estimatedTotalCostUsd)}</b></div></div>
      </section>
    </div> : <section className="card creditCard">
      <div className="sectionLabel">FIRST SETUP</div><h3 style={{margin:"5px 0 7px"}}>もともとあるOpenAI残高を同期</h3><p style={{fontSize:12,color:"#7d8092",lineHeight:1.6}}>OpenAI Billingに現在表示されている残高をそのまま入力してください。その時点を基準に、以後EigoLoopで使った分を自動で推定差し引きします。</p>
      <div className="creditActions"><button className="secondary" onClick={()=>window.open(CREDIT_URL,"_blank","noopener,noreferrer")}>OpenAIの現在残高を確認</button></div>
      <div className="creditField"><label>現在のAPI残高（USD）<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="例: 10.00"/></label><button disabled={saving} onClick={()=>saveBalance("set")}>{saving?"保存中…":"既存残高を同期"}</button></div>
    </section>}

    <section className="card creditCard">
      <div className="sectionLabel">CREDIT CONTROL</div><h3 style={{margin:"5px 0 7px"}}>クレジットを追加・同期</h3><p style={{fontSize:12,color:"#7d8092",lineHeight:1.6}}>「OpenAIでクレジットを追加」を押したあとEigoLoopへ戻ると、購入額の確認画面が自動で表示されます。$5 / $10 / $20なら1タップで反映できます。</p>
      <div className="creditActions"><button onClick={openBilling}>OpenAIでクレジットを追加</button><button className="secondary" onClick={()=>window.open(CREDIT_URL,"_blank","noopener,noreferrer")}>公式残高を確認</button></div>
      <div className="creditField"><label>{budget?.configured?"現在残高を再同期 / 追加額を入力":"残高（USD）"}<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="例: 5.00"/></label><button disabled={saving} onClick={()=>saveBalance("set")}>残高を再同期</button>{budget?.configured&&<button className="secondary" disabled={saving} onClick={()=>saveBalance("add")}>購入額を＋反映</button>}</div>
      {notice&&<div className="apiNote">{notice}</div>}
      <div className="apiNote">購入完了そのものをOpenAI APIから受け取る方式ではなく、Billingを開いた記録を端末に残し、EigoLoopへ戻った瞬間または次回起動時に確認画面を出します。購入しなかった場合は「購入していない」で閉じられます。</div>
      <div className="apiNote">この残高メーターはEigoLoop内の利用を基準にした推定です。OpenAI APIを別アプリでも使った場合や、長い会話でコンテキスト量が増えた場合は実際の残高と差が出るため、ときどき「公式残高を確認」→「残高を再同期」してください。</div>
    </section>

    <section className="card apiMeta"><div className="sectionLabel">HOW IT WORKS</div><h3>計算方法</h3><ul><li>現在のモデル：{budget?.model||"gpt-realtime-2.1-mini"}</li><li>Realtime音声・文字起こし・会話後分析を含めた保守的な目安で計算</li><li>残高が少なくなると30分・2時間の目安で警告表示</li><li>OpenAI側の自動リチャージは公式Billing画面から設定できます</li></ul></section>
  </div>;
}
