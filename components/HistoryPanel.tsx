"use client";
import { useEffect, useState } from "react";
import { ChevronIcon, HistoryIcon } from "@/components/icons";

type Session = { id:string; scenario_title:string; scenario:string; mode:string; transcript:Array<{role:string;text:string}>; analysis:any; ended_at:string; duration_seconds:number };
function formatDate(s:string){ return new Intl.DateTimeFormat("ja-JP",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(s)); }
export default function HistoryPanel(){ const [sessions,setSessions]=useState<Session[]>([]); const [loading,setLoading]=useState(true); const [open,setOpen]=useState<string|null>(null); useEffect(()=>{fetch("/api/conversations").then(r=>r.json()).then(d=>setSessions(d.sessions||[])).finally(()=>setLoading(false));},[]);
  return <div className="page contentPage"><header className="pageHeader"><div><div className="eyebrow">CONVERSATION LOG</div><h2>会話履歴</h2></div><div className="dueBadge"><HistoryIcon/>{sessions.length}回</div></header>
    {loading ? <div className="centerState"><div className="spinner"/>履歴を読み込み中…</div> : sessions.length===0 ? <section className="emptySuccess card"><div className="successCircle muted"><HistoryIcon/></div><h3>まだ会話履歴がありません</h3><p>最初のAI英会話を始めると、添削結果と一緒にここへ保存されます。</p></section> : <div className="historyList">{sessions.map(s=>{ const isOpen=open===s.id; const sc=s.analysis?.scores; const avg=sc?((sc.fluency+sc.grammar+sc.vocabulary+sc.naturalness)/4).toFixed(1):"—"; const source=s.mode?.startsWith("browser:")?"旧ブラウザ会話":"OpenAI"; return <article className={`historyCard card ${isOpen?"open":""}`} key={s.id}><button className="historyTop" onClick={()=>setOpen(isOpen?null:s.id)}><div><div className="historyDate">{formatDate(s.ended_at)} ・ {Math.max(1,Math.round(s.duration_seconds/60))}分 ・ {source}</div><h3>{s.scenario_title}</h3><p>{s.analysis?.summary_ja || "会話を保存しました"}</p></div><div className="historyScore"><strong>{avg}</strong><small>/ 5</small><ChevronIcon/></div></button>{isOpen&&<div className="historyDetail">
      {s.analysis?.corrections?.length>0&&<div><div className="sectionLabel">主な添削</div><div className="correctionList">{s.analysis.corrections.map((c:any,i:number)=><div key={i}><span className="badText">{c.original}</span><span className="arrow">→</span><span className="goodText">{c.corrected}</span><small>{c.explanation_ja}</small></div>)}</div></div>}
      <details><summary>会話全文を見る</summary><div className="transcriptHistory">{(s.transcript||[]).map((m,i)=><div className={m.role} key={i}><b>{m.role==="user"?"You":s.mode?.startsWith("browser:")?"Partner":"AI"}</b><span>{m.text}</span></div>)}</div></details>
    </div>}</article>})}</div>}
  </div>;
}
