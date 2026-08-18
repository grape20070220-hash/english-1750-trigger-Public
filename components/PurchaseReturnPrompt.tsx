"use client";

import { useEffect, useState } from "react";

const PENDING_KEY = "eigoloop-billing-return-pending-v1";
const EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

type PendingBilling = { openedAt: number };

function readPending(): PendingBilling | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBilling;
    if (!Number.isFinite(parsed?.openedAt)) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    if (Date.now() - parsed.openedAt > EXPIRES_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export default function PurchaseReturnPrompt() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let timer: number | null = null;
    const check = async () => {
      const pending = readPending();
      if (!pending) return;
      const age = Date.now() - pending.openedAt;
      if (age < 1200) {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => void check(), 1300 - age);
        return;
      }
      try {
        const r = await fetch("/api/api-budget", { cache: "no-store" });
        const d = await r.json();
        if (r.ok) setConfigured(Boolean(d.configured));
      } catch {}
      setOpen(true);
    };
    const onFocus = () => void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function dismissNoPurchase() {
    localStorage.removeItem(PENDING_KEY);
    setOpen(false);
    setCustom(false);
    setAmount("");
    setNotice("");
  }

  async function applyAmount(value: number, action: "add" | "set") {
    if (!Number.isFinite(value) || value < 0) {
      setNotice("金額を入力してください");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const r = await fetch("/api/api-budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amountUsd: value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "save failed");
      localStorage.removeItem(PENDING_KEY);
      window.dispatchEvent(new Event("eigoloop-budget-updated"));
      setOpen(false);
      setCustom(false);
      setAmount("");
    } catch {
      setNotice("クレジット反映に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return <div className="purchaseReturnOverlay" role="presentation">
    <style>{`
      .purchaseReturnOverlay{position:fixed;inset:0;z-index:200;background:rgba(24,25,42,.42);display:grid;place-items:center;padding:18px;backdrop-filter:blur(4px)}
      .purchaseReturnCard{width:min(430px,100%);background:#fff;border:1px solid #e2e3ee;border-radius:20px;padding:20px;box-shadow:0 24px 70px rgba(31,32,60,.22)}
      .purchaseReturnCard h3{margin:5px 0 7px;font-size:21px}.purchaseReturnCard p{margin:0;color:#777a8d;font-size:12px;line-height:1.65}
      .purchasePresetGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}.purchasePresetGrid button,.purchaseCustomActions button,.purchaseNoButton{border:0;border-radius:12px;padding:11px 12px;font-weight:850;cursor:pointer}
      .purchasePresetGrid button{background:#5b5ce2;color:#fff;font-size:14px}.purchaseOtherButton{margin-top:8px;width:100%;background:#ececf7!important;color:#5d5f77!important}
      .purchaseCustom{margin-top:14px}.purchaseCustom label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:800}.purchaseCustom input{border:1px solid #dfe1eb;background:#fbfbfd;border-radius:11px;padding:11px;font-size:15px}
      .purchaseCustomActions{display:flex;gap:8px;margin-top:9px}.purchaseCustomActions button{flex:1;background:#5b5ce2;color:#fff}.purchaseCustomActions button.secondary{background:#ececf7;color:#5d5f77}
      .purchaseNoButton{width:100%;margin-top:9px;background:transparent;color:#777a8d}.purchaseReturnNotice{margin-top:10px;padding:10px;border-radius:10px;background:#fff0ef;color:#a94d47;font-size:11px}.purchaseHint{margin-top:12px;padding:11px;border-radius:12px;background:#f8f8fc;color:#777a8d;font-size:10px;line-height:1.55}
    `}</style>
    <section className="purchaseReturnCard" role="dialog" aria-modal="true" aria-labelledby="purchase-return-title">
      <div className="sectionLabel">OPENAI BILLING RETURN</div>
      <h3 id="purchase-return-title">クレジットを購入しましたか？</h3>
      {configured ? <>
        <p>購入した金額を選ぶと、EigoLoopのAPI残量へすぐ反映します。</p>
        {!custom && <div className="purchasePresetGrid">
          {[5,10,20].map(v => <button key={v} disabled={saving} onClick={() => void applyAmount(v, "add")}>+ ${v}</button>)}
          <button className="purchaseOtherButton" onClick={() => setCustom(true)}>その他の金額</button>
        </div>}
      </> : <>
        <p>まだ既存残高の基準がないため、購入額だけではなく、購入後にOpenAIへ表示されている<strong>現在の合計残高</strong>を入力してください。</p>
        <div className="purchaseHint">最初の1回だけ合計残高を同期すれば、次回以降の購入は $5 / $10 / $20 を1タップで追加できます。</div>
      </>}
      {(custom || !configured) && <div className="purchaseCustom">
        <label>{configured ? "購入額（USD）" : "購入後の現在残高（USD）"}<input autoFocus type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder={configured ? "例: 15.00" : "例: 23.42"}/></label>
        <div className="purchaseCustomActions"><button disabled={saving} onClick={() => void applyAmount(Number(amount), configured ? "add" : "set")}>{saving ? "反映中…" : configured ? "購入額を反映" : "現在残高を同期"}</button>{configured && <button className="secondary" disabled={saving} onClick={() => {setCustom(false);setAmount("");setNotice("")}}>戻る</button>}</div>
      </div>}
      {notice && <div className="purchaseReturnNotice">{notice}</div>}
      <button className="purchaseNoButton" disabled={saving} onClick={dismissNoPurchase}>購入していない</button>
    </section>
  </div>;
}
