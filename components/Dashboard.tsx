"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CopyIcon, MicIcon, ReviewIcon, SparkIcon } from "@/components/icons";

export type MeData = {
  account: {
    id: string;
    sync_id: string;
    display_name: string;
    level: string;
    preferred_voice: string;
    daily_goal_minutes: number;
    reminder_enabled: boolean;
    reminder_hour: number;
    conversation_style: string;
    response_length: string;
    speech_speed: string;
    turn_pace: string;
  };
  stats: { due: number; conversations: number };
  progress: {
    goalMinutes: number;
    todayMinutes: number;
    totalMinutes: number;
    todayReviews: number;
    streak: number;
    week: Array<{label:string;day:string;minutes:number}>;
    scoreTrend: Array<{label:string;average:number}>;
    weaknesses: Array<{category:string;items:number;occurrences:number;lapses:number;weight:number}>;
  };
  latest: { scenario_title: string; ended_at: string; analysis: any } | null;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const weaknessName:Record<string,string>={grammar:"文法",vocabulary:"語彙",naturalness:"自然さ",fluency:"流暢さ",expression:"表現"};

export default function Dashboard({ me, goSpeak, goReview, onLogout, onChanged }: { me: MeData; goSpeak: () => void; goReview: () => void; onLogout: () => void; onChanged:()=>void }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [goal,setGoal]=useState(Number(me.account.daily_goal_minutes||15));
  const [reminderEnabled,setReminderEnabled]=useState(Boolean(me.account.reminder_enabled));
  const [reminderHour,setReminderHour]=useState(Number(me.account.reminder_hour||20));
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setInstalled(Boolean(standalone));
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  async function saveLearningSettings(nextEnabled=reminderEnabled){
    setSaving(true); setNotice("");
    const r=await fetch("/api/me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({dailyGoalMinutes:goal,reminderEnabled:nextEnabled,reminderHour})});
    setSaving(false);
    if(r.ok){ setNotice("設定を保存しました"); onChanged(); }
    else setNotice("設定の保存に失敗しました");
  }

  async function toggleReminder(){
    const next=!reminderEnabled;
    if(next){
      if(!("Notification" in window)){
        setNotice("このブラウザは通知に対応していません");
        return;
      }
      const permission=await Notification.requestPermission();
      if(permission!=="granted"){
        setReminderEnabled(false);
        setNotice("通知の許可が必要です");
        return;
      }
      setReminderEnabled(true);
      await saveLearningSettings(true);
      try{
        const reg=await navigator.serviceWorker?.ready;
        await reg?.showNotification("EigoLoop 通知をオンにしました",{body:`毎日${reminderHour}:00ごろ、目標未達なら学習をリマインドします。`,icon:"/icon-192.png",tag:"eigoloop-reminder-enabled",data:{url:"/"}});
      }catch{}
    }else{
      setReminderEnabled(false);
      await saveLearningSettings(false);
    }
  }

  const score = me.latest?.analysis?.scores;
  const avg = score ? ((score.fluency + score.grammar + score.vocabulary + score.naturalness) / 4).toFixed(1) : null;
  const todayMinutes=Number(me.progress?.todayMinutes||0);
  const goalPct=Math.min(100,Math.round((todayMinutes/Math.max(1,goal))*100));
  const remain=Math.max(0,goal-todayMinutes);
  const weekMax=Math.max(1,...(me.progress?.week||[]).map(x=>x.minutes));
  const scorePoints=useMemo(()=>{
    const data=me.progress?.scoreTrend||[];
    if(data.length<2) return "";
    return data.map((x,i)=>`${(i/(data.length-1))*100},${100-((x.average-1)/4)*100}`).join(" ");
  },[me.progress?.scoreTrend]);

  async function copyId() { await navigator.clipboard?.writeText(me.account.sync_id); }

  return <div className="page contentPage">
    <style>{`
      .progressHero{display:grid;grid-template-columns:140px 1fr;gap:22px;align-items:center;padding:22px;margin-top:14px}.goalRing{width:128px;height:128px;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#5b5ce2 var(--pct),#ececf4 0)}.goalRing:after{content:"";position:absolute;inset:10px;border-radius:50%;background:#fff}.goalRing>div{position:relative;z-index:1;text-align:center}.goalRing strong{display:block;font-size:28px}.goalRing span{font-size:10px;color:#8d8fa1}.progressCopy h3{margin:0 0 7px;font-size:20px}.progressCopy p{margin:0;color:#7d8093;font-size:12px;line-height:1.6}.streakChip{display:inline-flex;gap:6px;align-items:center;margin-top:10px;border-radius:999px;background:#fff1e7;color:#ad652e;padding:7px 10px;font-size:11px;font-weight:850}.analyticsGrid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;margin-top:14px}.analyticsCard{padding:19px}.analyticsCard h3{margin:4px 0 14px;font-size:15px}.weekBars{height:120px;display:grid;grid-template-columns:repeat(7,1fr);gap:7px;align-items:end}.weekBar{display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}.weekBar i{display:block;width:100%;max-width:30px;min-height:4px;border-radius:8px 8px 4px 4px;background:#7779e8}.weekBar b{font-size:9px;color:#65687a}.weekBar span{font-size:9px;color:#a1a3b1}.scoreSpark{height:90px;background:#f8f8fc;border-radius:13px;padding:12px}.scoreSpark svg{width:100%;height:100%;overflow:visible}.scoreSpark polyline{fill:none;stroke:#5b5ce2;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.scoreLabels{display:flex;justify-content:space-between;margin-top:7px;color:#a0a2b1;font-size:9px}.weaknessList{display:grid;gap:8px}.weaknessRow{display:grid;grid-template-columns:78px 1fr auto;gap:8px;align-items:center}.weaknessRow span{font-size:11px}.weaknessTrack{height:8px;background:#eeeef4;border-radius:999px;overflow:hidden}.weaknessTrack i{height:100%;display:block;background:#6e70e5;border-radius:999px}.weaknessRow b{font-size:10px;color:#8a8c9c}.settingsCard{margin-top:14px;padding:20px}.goalSettings{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:end}.goalSettings label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:800}.goalSettings select{border:1px solid #dfe1eb;background:#fbfbfd;border-radius:12px;padding:11px 12px}.reminderLine{margin-top:14px;padding-top:14px;border-top:1px solid #ececf2;display:flex;align-items:center;justify-content:space-between;gap:12px}.reminderText b{display:block;font-size:13px}.reminderText span{display:block;color:#8d8fa0;font-size:10px;margin-top:3px}.toggleBtn{border:0;border-radius:999px;padding:9px 13px;font-weight:850;background:#ececf4;color:#77798c}.toggleBtn.on{background:#e9e9ff;color:#5557d5}.settingsActions{margin-top:13px;display:flex;align-items:center;gap:10px}.settingsActions button{border:0;background:#5b5ce2;color:#fff;border-radius:11px;padding:10px 14px;font-weight:800}.settingsActions span{font-size:10px;color:#777a8d}.learningMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.learningMetrics .metricCard{display:block}.learningMetrics .metricCard strong{display:block;margin-top:4px}.learningMetrics .metricCard small{margin:0}.learningMetrics .metricHint{display:block;margin:5px 0 0}.weakCard{margin-top:14px;padding:19px}@media(max-width:700px){.progressHero{grid-template-columns:1fr;text-align:center}.goalRing{margin:auto}.analyticsGrid{grid-template-columns:1fr}.learningMetrics{grid-template-columns:1fr 1fr}.goalSettings{grid-template-columns:1fr}.reminderLine{align-items:flex-start}.weaknessRow{grid-template-columns:68px 1fr auto}}
    `}</style>
    <header className="pageHeader"><div><div className="eyebrow">TODAY&apos;S PRACTICE</div><h2>{me.account.display_name}さん、英語を話そう。</h2></div><div className="avatar">{(me.account.display_name || "E").slice(0,1).toUpperCase()}</div></header>

    <section className="heroCard">
      <div className="heroCardText"><div className="smallBadge"><SparkIcon/> REALTIME AI CONVERSATION</div><h3>考える前に、<br/>まず口から出してみる。</h3><p>OpenAI Realtimeで自然な英会話を練習。会話後はAIが添削し、弱点を自動で復習に追加します。</p><button className="primaryButton" onClick={goSpeak}><MicIcon/> 会話を始める</button></div>
      <div className="orbWrap" aria-hidden="true"><div className="orb orb1"/><div className="orb orb2"/><div className="soundBars">{[1,2,3,4,5,6,7,8,9].map(i => <i key={i}/>)}</div></div>
    </section>

    <section className="card progressHero">
      <div className="goalRing" style={{"--pct":`${goalPct}%`} as CSSProperties}><div><strong>{todayMinutes}<small style={{fontSize:11}}>分</small></strong><span>目標 {goal}分</span></div></div>
      <div className="progressCopy"><div className="sectionLabel">DAILY GOAL</div><h3>{goalPct>=100?"今日の目標達成！":remain>0?`あと${remain}分で今日の目標`:`今日も継続できています`}</h3><p>会話時間を自動集計。短くても毎日続けるほど、英語を口から出す習慣が作りやすくなります。</p><div className="streakChip">🔥 {me.progress?.streak||0}日連続</div></div>
    </section>

    <div className="learningMetrics">
      <button className="metricCard card clickable" onClick={goReview}><small>今日の復習</small><strong>{me.stats.due}<em> 件</em></strong><span className="metricHint">完了 {me.progress?.todayReviews||0}件</span></button>
      <div className="metricCard card"><small>累計会話</small><strong>{me.stats.conversations}<em> 回</em></strong><span className="metricHint">クラウド保存</span></div>
      <div className="metricCard card"><small>累計会話時間</small><strong>{me.progress?.totalMinutes||0}<em> 分</em></strong><span className="metricHint">実際に話した時間</span></div>
      <div className="metricCard card"><small>最新スコア</small><strong>{avg ?? "—"}<em>{avg ? " / 5" : ""}</em></strong><span className="metricHint">4項目平均</span></div>
    </div>

    <div className="analyticsGrid">
      <section className="card analyticsCard"><div className="sectionLabel">LAST 7 DAYS</div><h3>会話時間</h3><div className="weekBars">{(me.progress?.week||[]).map((d)=><div className="weekBar" key={d.day}><b>{d.minutes||""}</b><i style={{height:`${Math.max(4,Math.round((d.minutes/weekMax)*86))}px`}}/><span>{d.label}</span></div>)}</div></section>
      <section className="card analyticsCard"><div className="sectionLabel">SCORE TREND</div><h3>会話スコアの推移</h3>{scorePoints?<><div className="scoreSpark"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="最近の会話スコア推移"><polyline points={scorePoints}/></svg></div><div className="scoreLabels"><span>1</span><span>5</span></div></>:<p style={{fontSize:12,color:"#9294a6"}}>会話を2回以上すると推移が表示されます。</p>}</section>
    </div>

    {(me.progress?.weaknesses||[]).length>0&&<section className="card weakCard"><div className="sectionLabel">WEAK POINTS</div><h3 style={{margin:"5px 0 13px"}}>いま優先して復習する分野</h3><div className="weaknessList">{me.progress.weaknesses.map((w,i)=>{const max=Math.max(...me.progress.weaknesses.map(x=>x.weight),1);return <div className="weaknessRow" key={`${w.category}-${i}`}><span>{weaknessName[w.category]||w.category}</span><div className="weaknessTrack"><i style={{width:`${Math.max(8,Math.round((w.weight/max)*100))}%`}}/></div><b>{w.occurrences}回検出</b></div>})}</div></section>}

    <section className="card settingsCard">
      <div className="sectionLabel">LEARNING SETTINGS</div><h3 style={{margin:"5px 0 14px"}}>毎日の目標とリマインダー</h3>
      <div className="goalSettings"><label>1日の会話目標<select value={goal} onChange={e=>setGoal(Number(e.target.value))}><option value={5}>5分</option><option value={10}>10分</option><option value={15}>15分</option><option value={20}>20分</option><option value={30}>30分</option><option value={45}>45分</option><option value={60}>60分</option></select></label><label>通知する時間<select value={reminderHour} onChange={e=>setReminderHour(Number(e.target.value))}>{Array.from({length:17},(_,i)=>i+7).map(h=><option value={h} key={h}>{h}:00</option>)}</select></label></div>
      <div className="reminderLine"><div className="reminderText"><b>学習リマインダー</b><span>設定時刻を過ぎても会話目標が未達なら、アプリ起動中・次回起動時に端末通知で知らせます。</span></div><button className={`toggleBtn ${reminderEnabled?"on":""}`} onClick={toggleReminder}>{reminderEnabled?"通知 ON":"通知 OFF"}</button></div>
      <div className="settingsActions"><button disabled={saving} onClick={()=>saveLearningSettings()}>{saving?"保存中…":"設定を保存"}</button>{notice&&<span>{notice}</span>}</div>
    </section>

    {me.latest && <section className="card latestCard"><div><div className="sectionLabel">前回の会話</div><h3>{me.latest.scenario_title}</h3><p>{me.latest.analysis?.summary_ja || "会話履歴が保存されています。"}</p></div>{score && <div className="miniScores">{Object.entries(score).map(([k,v]) => <div key={k}><span>{({fluency:"流暢さ",grammar:"文法",vocabulary:"語彙",naturalness:"自然さ"} as any)[k]}</span><b>{String(v)}</b></div>)}</div>}</section>}

    {!installed && <section className="card installCard"><div><div className="sectionLabel">ホーム画面から起動</div><h3>EigoLoopをアプリとして使う</h3><p>インストールすると、Chromeのタブやアドレスバーなしでホーム画面から起動できます。</p></div>{installPrompt ? <button className="primaryButton installButton" onClick={installApp}>アプリをインストール</button> : <div className="installHint">Chromeのメニュー →「ホーム画面に追加」または「アプリをインストール」</div>}</section>}

    <section className="card syncCard"><div><div className="sectionLabel">スマホ・PC同期</div><h3>あなたの同期ID</h3><p>別の端末で「別端末からログイン」を選び、このIDと登録したPINを入力してください。</p></div><div className="syncCode"><code>{me.account.sync_id}</code><button onClick={copyId} title="コピー"><CopyIcon/></button></div></section>
    <button className="textButton danger" onClick={onLogout}>ログアウト</button>
  </div>;
}
