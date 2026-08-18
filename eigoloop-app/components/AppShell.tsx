"use client";
import { useCallback, useEffect, useState } from "react";
import AuthScreen from "@/components/AuthScreen";
import Dashboard, { type MeData } from "@/components/Dashboard";
import SpeakPanel from "@/components/SpeakPanel";
import ReviewPanel from "@/components/ReviewPanel";
import HistoryPanel from "@/components/HistoryPanel";
import ApiBudgetPanel from "@/components/ApiBudgetPanel";
import ApiBudgetSummary from "@/components/ApiBudgetSummary";
import { HistoryIcon, HomeIcon, MicIcon, ReviewIcon, SparkIcon } from "@/components/icons";

type Tab="home"|"speak"|"review"|"history"|"api";
export default function AppShell(){ const [me,setMe]=useState<MeData|null>(null); const [loading,setLoading]=useState(true); const [tab,setTab]=useState<Tab>("home");
  const load=useCallback(async()=>{const r=await fetch("/api/me",{cache:"no-store"});if(r.ok)setMe(await r.json());else setMe(null);setLoading(false);},[]); useEffect(()=>{load()},[load]);
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});setMe(null);setTab("home");}
  if(loading)return <div className="appSplash"><div className="brandOrb">E</div><b>EigoLoop</b><div className="spinner"/></div>;
  if(!me)return <AuthScreen onDone={load}/>;
  return <main className="appShell"><div className="desktopBrand"><div className="brandOrb small">E</div><b>EigoLoop</b></div><ApiBudgetSummary onOpen={()=>setTab("api")}/><section className="appContent">{tab==="home"&&<Dashboard me={me} goSpeak={()=>setTab("speak")} goReview={()=>setTab("review")} onLogout={logout} onChanged={load}/>} {tab==="speak"&&<SpeakPanel me={me} onChanged={load}/>} {tab==="review"&&<ReviewPanel onChanged={load}/>} {tab==="history"&&<HistoryPanel/>} {tab==="api"&&<ApiBudgetPanel/>}</section><nav className="bottomNav">{([{id:"home",label:"ホーム",icon:HomeIcon},{id:"speak",label:"話す",icon:MicIcon},{id:"review",label:"復習",icon:ReviewIcon},{id:"history",label:"履歴",icon:HistoryIcon},{id:"api",label:"API",icon:SparkIcon}] as const).map(n=><button key={n.id} className={tab===n.id?"active":""} onClick={()=>setTab(n.id)}><n.icon/><span>{n.label}</span>{n.id==="review"&&me.stats.due>0&&<i>{me.stats.due>9?"9+":me.stats.due}</i>}</button>)}</nav></main>;
}
