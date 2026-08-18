"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CopyIcon, MicIcon, SparkIcon } from "@/components/icons";

export type MeData = {
  account: {
    id: string; sync_id: string; display_name: string; level: string; preferred_voice: string;
    daily_goal_minutes: number; reminder_enabled: boolean; reminder_hour: number;
    conversation_style: string; response_length: string; speech_speed: string; turn_pace: string;
  };
  stats: { due: number; conversations: number };
  progress: {
    goalMinutes: number; todayMinutes: number; totalMinutes: number; todayReviews: number; streak: number;
    week: Array<{label:string;day:string;minutes:number}>;
    scoreTrend: Array<{label:string;average:number}>;
    weaknesses: Array<{category:string;items:number;occurrences:number;lapses:number;weight:number}>;
  };
  latest: { scenario_title: string; ended_at: string; analysis: any } | null;
};

type Mission = { title_ja:string; instruction_ja:string; targets_en:string[]; success_condition_ja:string; coach_tip_ja:string };
type CoachReport = { headline_ja:string; summary_ja:string; wins_ja:string[]; recurring_issues:Array<{issue_ja:string;evidence_ja:string;action_ja:string}>; next_week_focus_ja:string; recommended_scenario_ja:string; next_mission_ja:string };
type BeforeInstallPromptEvent = Event & { prompt:()=>Promise<void>; userChoice:Promise<{outcome:"accepted"|"dismissed";platform:string}> };

const weaknessName:Record<string,string>={grammar:"文法",vocabulary:"語彙",naturalness:"自然さ",fluency:"流暢さ",expression:"表現"};

function urlBase64ToUint8Array(base64String:string){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=window.atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}

export default function Dashboard({ me, goSpeak, goReview, onLogout, onChanged }:{ me:MeData; goSpeak:()=>void; goReview:()=>void; onLogout:()=>void; onChanged:()=>void }){
  const [installPrompt,setInstallPrompt]=useState<BeforeInstallPromptEvent|null>(null);
  const [installed,setInstalled]=useState(false);
  const [goal,setGoal]=useState(Number(me.account.daily_goal_minutes||15));
  const [reminderEnabled,setReminderEnabled]=useState(Boolean(me.account.reminder_enabled));
  const [reminderHour,setReminderHour]=useState(Number(me.account.reminder_hour||20));
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [mission,setMission]=useState<Mission|null>(null);
  const [missionLoading,setMissionLoading]=useState(true);
  const [coach,setCoach]=useState<CoachReport|null>(null);
  const [coachLoading,setCoachLoading]=useState(true);
  const [coachOpen,setCoachOpen]=useState(false);

  useEffect(()=>{
    const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||(navigator as Navigator&{standalone?:boolean}).standalone;
    setInstalled(Boolean(standalone));
    const onPrompt=(event:Event)=>{event.preventDefault();setInstallPrompt(event as BeforeInstallPromptEvent)};
    const onInstalled=()=>{setInstalled(true);setInstallPrompt(null)};
    window.addEventListener("beforeinstallprompt",onPrompt);
    window.addEventListener("appinstalled",onInstalled);
    return()=>{window.removeEventListener("beforeinstallprompt",onPrompt);window.removeEventListener("appinstalled",onInstalled)};
  },[]);

  useEffect(()=>{
    let active=true;
    void fetch("/api/mission",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(active)setMission(d?.mission||null)}).finally(()=>{if(active)setMissionLoading(false)});
    void fetch("/api/coach/weekly",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(active)setCoach(d?.report||null)}).finally(()=>{if(active)setCoachLoading(false)});
    return()=>{active=false};
  },[]);

  async function installApp(){ if(!installPrompt)return; await installPrompt.prompt(); const choice=await installPrompt.userChoice; if(choice.outcome==="accepted")setInstallPrompt(null); }
  async function saveLearningSettings(nextEnabled=reminderEnabled){
    setSaving(true);setNotice("");
    const r=await fetch("/api/me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({dailyGoalMinutes:goal,reminderEnabled:nextEnabled,reminderHour})});
    setSaving(false);
    if(r.ok){setNotice("設定を保存しました");onChanged()}else setNotice("設定の保存に失敗しました");
  }
  async function ensurePushSubscription(){
    if(!("serviceWorker" in navigator)||!("PushManager" in window))throw new Error("この端末はWeb Pushに対応していません");
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      const keyRes=await fetch("/api/push/public-key",{cache:"no-store"});
      const keyData=await keyRes.json();
      if(!keyRes.ok||!keyData.publicKey)throw new Error("Push鍵を取得できませんでした");
      sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(keyData.publicKey)});
    }
    const sync=await fetch("/api/push/subscription",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:sub.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Asia/Tokyo"})});
    if(!sync.ok)throw new Error("Push購読を保存できませんでした");
  }
  async function toggleReminder(){
    const next=!reminderEnabled;
    if(next){
      if(!("Notification" in window)){setNotice("このブラウザは通知に対応していません");return}
      const permission=await Notification.requestPermission();
      if(permission!=="granted"){setNotice("通知の許可が必要です");return}
      setReminderEnabled(true);
      await saveLearningSettings(true);
      try{await ensurePushSubscription();setNotice("サーバーPushを有効にしました")}catch(e:any){setNotice(e?.message||"Push登録に失敗しました")}
    }else{setReminderEnabled(false);await saveLearningSettings(false)}
  }
  async function testPush(){
    setNotice("テスト通知を送信中…");
    try{await ensurePushSubscription();const r=await fetch("/api/push/test",{method:"POST"});const d=await r.json();setNotice(r.ok&&d.sent>0?"テスト通知を送信しました":"テスト通知を送れませんでした")}catch(e:any){setNotice(e?.message||"テスト通知に失敗しました")}
  }
  async function refreshCoach(){
    setCoachLoading(true);const r=await fetch("/api/coach/weekly",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(r.ok)setCoach(d.report||null);setCoachLoading(false);setCoachOpen(true);
  }

  const score=me.latest?.analysis?.scores;
  const avg=score?((score.fluency+score.grammar+score.vocabulary+score.naturalness)/4).toFixed(1):null;
  const todayMinutes=Number(me.progress?.todayMinutes||0);
  const goalPct=Math.min(100,Math.round((todayMinutes/Math.max(1,goal))*100));
  const remain=Math.max(0,goal-todayMinutes);
  const weekMax=Math.max(1,...(me.progress?.week||[]).map(x=>x.minutes));
  const scorePoints=useMemo(()=>{const data=me.progress?.scoreTrend||[];if(data.length<2)return"";return data.map((x,i)=>`${(i/(data.length-1))*100},${100-((x.average-1)/4)*100}`).join(" ")},[me.progress?.scoreTrend]);
  async function copyId(){await navigator.clipboard?.writeText(me.account.sync_id)}

  return <div className="page contentPage">
    <style>{`
      .progressHero{display:grid;grid-template-columns:140px 1fr;gap:22px;align-items:center;padding:22px;margin-top:14px}.goalRing{width:128px;height:128px;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#5b5ce2 var(--pct),#ececf4 0)}.goalRing:after{content:"";position:absolute;inset:10px;border-radius:50%;background:#fff}.goalRing>div{position:relative;z-index:1;text-align:center}.goalRing strong{display:block;font-size:28px}.goalRing span{font-size:10px;color:#8d8fa1}.progressCopy h3{margin:0 0 7px;font-size:20px}.progressCopy p{margin:0;color:#7d8093;font-size:12px;line-height:1.6}.streakChip{display:inline-flex;margin-top:10px;border-radius:999px;background:#fff1e7;color:#ad652e;padding:7px 10px;font-size:11px;font-weight:850}.missionCard,.coachCard{padding:20px;margin-top:14px}.missionHead,.coachHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.missionHead h3,.coachHead h3{margin:4px 0 5px;font-size:18px}.missionCard p,.coachCard p{font-size:12px;line-height:1.65;color:#72758a}.targetChips{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.targetChips span{background:#efefff;color:#5557cf;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800}.missionMeta{display:grid;grid-template-columns:1fr 1fr;gap:10px}.missionMeta div{background:#f8f8fc;border-radius:12px;padding:11px}.missionMeta b{display:block;font-size:10px;color:#66697a;margin-bottom:4px}.missionMeta span{font-size:11px;color:#85889a}.analyticsGrid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;margin-top:14px}.analyticsCard{padding:19px}.analyticsCard h3{margin:4px 0 14px;font-size:15px}.weekBars{height:120px;display:grid;grid-template-columns:repeat(7,1fr);gap:7px;align-items:end}.weekBar{display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}.weekBar i{display:block;width:100%;max-width:30px;min-height:4px;border-radius:8px 8px 4px 4px;background:#7779e8}.weekBar b,.weekBar span{font-size:9px;color:#818397}.scoreSpark{height:90px;background:#f8f8fc;border-radius:13px;padding:12px}.scoreSpark svg{width:100%;height:100%}.scoreSpark polyline{fill:none;stroke:#5b5ce2;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.learningMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.learningMetrics .metricCard{display:block}.learningMetrics .metricCard strong{display:block;margin-top:4px}.weakCard{margin-top:14px;padding:19px}.weaknessList{display:grid;gap:8px}.weaknessRow{display:grid;grid-template-columns:78px 1fr auto;gap:8px;align-items:center}.weaknessTrack{height:8px;background:#eeeef4;border-radius:999px;overflow:hidden}.weaknessTrack i{height:100%;display:block;background:#6e70e5;border-radius:999px}.settingsCard{margin-top:14px;padding:20px}.goalSettings{display:grid;grid-template-columns:1fr 1fr;gap:14px}.goalSettings label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:800}.goalSettings select{border:1px solid #dfe1eb;background:#fbfbfd;border-radius:12px;padding:11px}.reminderLine{margin-top:14px;padding-top:14px;border-top:1px solid #ececf2;display:flex;align-items:center;justify-content:space-between;gap:12px}.reminderText b{display:block;font-size:13px}.reminderText span{display:block;color:#8d8fa0;font-size:10px;margin-top:3px}.toggleBtn{border:0;border-radius:999px;padding:9px 13px;font-weight:850;background:#ececf4;color:#77798c}.toggleBtn.on{background:#e9e9ff;color:#5557d5}.settingsActions{margin-top:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.settingsActions button,.coachHead button{border:0;background:#5b5ce2;color:#fff;border-radius:11px;padding:9px 12px;font-weight:800}.settingsActions button.secondary{background:#ececf7;color:#5d5f77}.settingsActions span{font-size:10px;color:#777a8d}.coachWins{display:grid;gap:7px;margin:10px 0}.coachWins div,.issueBox{background:#f8f8fc;border-radius:12px;padding:11px;font-size:11px}.issueBox{margin-top:8px}.issueBox b{display:block;margin-bottom:5px}.issueBox span{display:block;color:#777a8b;line-height:1.5}.coachNext{margin-top:12px;padding:12px;background:#efefff;border-radius:12px}.coachNext b{font-size:11px}.coachNext span{display:block;font-size:11px;color:#66697d;margin-top:4px}@media(max-width:700px){.progressHero{grid-template-columns:1fr;text-align:center}.goalRing{margin:auto}.missionMeta,.analyticsGrid,.goalSettings{grid-template-columns:1fr}.learningMetrics{grid-template-columns:1fr 1fr}.weaknessRow{grid-template-columns:68px 1fr auto}.reminderLine{align-items:flex-start}}
    `}</style>
    <header className="pageHeader"><div><div className="eyebrow">TODAY&apos;S PRACTICE</div><h2>{me.account.display_name}さん、英語を話そう。</h2></div><div className="avatar">{(me.account.display_name||"E").slice(0,1).toUpperCase()}</div></header>
    <section className="heroCard"><div className="heroCardText"><div className="smallBadge"><SparkIcon/> REALTIME AI CONVERSATION</div><h3>考える前に、<br/>まず口から出してみる。</h3><p>会話→発音・会話分析→5分ドリル→弱点復習まで1本で回します。</p><button className="primaryButton" onClick={goSpeak}><MicIcon/> 会話を始める</button></div><div className="orbWrap" aria-hidden="true"><div className="orb orb1"/><div className="orb orb2"/><div className="soundBars">{[1,2,3,4,5,6,7,8,9].map(i=><i key={i}/>)}</div></div></section>

    <section className="card missionCard"><div className="missionHead"><div><div className="sectionLabel">TODAY&apos;S MISSION</div><h3>{missionLoading?"今日のミッションを作成中…":mission?.title_ja||"今日の会話ミッション"}</h3></div><SparkIcon/></div>{mission&&<><p>{mission.instruction_ja}</p><div className="targetChips">{mission.targets_en.map(x=><span key={x}>{x}</span>)}</div><div className="missionMeta"><div><b>達成条件</b><span>{mission.success_condition_ja}</span></div><div><b>コーチのコツ</b><span>{mission.coach_tip_ja}</span></div></div></>}</section>

    <section className="card progressHero"><div className="goalRing" style={{"--pct":`${goalPct}%`} as CSSProperties}><div><strong>{todayMinutes}<small style={{fontSize:11}}>分</small></strong><span>目標 {goal}分</span></div></div><div className="progressCopy"><div className="sectionLabel">DAILY GOAL</div><h3>{goalPct>=100?"今日の目標達成！":`あと${remain}分で今日の目標`}</h3><p>会話時間を自動集計。復習も連続学習日にカウントします。</p><div className="streakChip">🔥 {me.progress?.streak||0}日連続</div></div></section>

    <div className="learningMetrics"><button className="metricCard card clickable" onClick={goReview}><small>今日の復習</small><strong>{me.stats.due}<em> 件</em></strong></button><div className="metricCard card"><small>累計会話</small><strong>{me.stats.conversations}<em> 回</em></strong></div><div className="metricCard card"><small>累計会話時間</small><strong>{me.progress?.totalMinutes||0}<em> 分</em></strong></div><div className="metricCard card"><small>最新スコア</small><strong>{avg??"—"}<em>{avg?" / 5":""}</em></strong></div></div>

    <div className="analyticsGrid"><section className="card analyticsCard"><div className="sectionLabel">LAST 7 DAYS</div><h3>会話時間</h3><div className="weekBars">{(me.progress?.week||[]).map(d=><div className="weekBar" key={d.day}><b>{d.minutes||""}</b><i style={{height:`${Math.max(4,Math.round((d.minutes/weekMax)*86))}px`}}/><span>{d.label}</span></div>)}</div></section><section className="card analyticsCard"><div className="sectionLabel">SCORE TREND</div><h3>会話スコアの推移</h3>{scorePoints?<div className="scoreSpark"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={scorePoints}/></svg></div>:<p style={{fontSize:12,color:"#9294a6"}}>会話を2回以上すると表示されます。</p>}</section></div>

    {(me.progress?.weaknesses||[]).length>0&&<section className="card weakCard"><div className="sectionLabel">WEAK POINTS</div><h3 style={{margin:"5px 0 13px"}}>いま優先して復習する分野</h3><div className="weaknessList">{me.progress.weaknesses.map((w,i)=>{const max=Math.max(...me.progress.weaknesses.map(x=>x.weight),1);return <div className="weaknessRow" key={`${w.category}-${i}`}><span>{weaknessName[w.category]||w.category}</span><div className="weaknessTrack"><i style={{width:`${Math.max(8,Math.round((w.weight/max)*100))}%`}}/></div><b>{w.occurrences}回</b></div>})}</div></section>}

    <section className="card coachCard"><div className="coachHead"><div><div className="sectionLabel">WEEKLY AI COACH</div><h3>{coachLoading?"今週のレポートを分析中…":coach?.headline_ja||"今週はまだ会話データがありません"}</h3></div><button onClick={refreshCoach}>更新</button></div>{coach&&<><p>{coach.summary_ja}</p><button className="textButton" onClick={()=>setCoachOpen(v=>!v)}>{coachOpen?"閉じる":"詳しいレポートを見る"}</button>{coachOpen&&<div><div className="coachWins">{coach.wins_ja.map((x,i)=><div key={i}>✓ {x}</div>)}</div>{coach.recurring_issues.map((x,i)=><div className="issueBox" key={i}><b>{x.issue_ja}</b><span>{x.evidence_ja}</span><span>→ {x.action_ja}</span></div>)}<div className="coachNext"><b>次の重点</b><span>{coach.next_week_focus_ja}</span><b style={{marginTop:8,display:"block"}}>おすすめ会話</b><span>{coach.recommended_scenario_ja}</span><b style={{marginTop:8,display:"block"}}>次のミッション</b><span>{coach.next_mission_ja}</span></div></div>}</>}</section>

    <section className="card settingsCard"><div className="sectionLabel">LEARNING SETTINGS</div><h3 style={{margin:"5px 0 14px"}}>毎日の目標とリマインダー</h3><div className="goalSettings"><label>1日の会話目標<select value={goal} onChange={e=>setGoal(Number(e.target.value))}>{[5,10,15,20,30,45,60].map(v=><option value={v} key={v}>{v}分</option>)}</select></label><label>通知する時間<select value={reminderHour} onChange={e=>setReminderHour(Number(e.target.value))}>{Array.from({length:17},(_,i)=>i+7).map(h=><option value={h} key={h}>{h}:00</option>)}</select></label></div><div className="reminderLine"><div className="reminderText"><b>完全Web Pushリマインダー</b><span>アプリを閉じていても、目標未達や復習残りをサーバーから通知します。</span></div><button className={`toggleBtn ${reminderEnabled?"on":""}`} onClick={toggleReminder}>{reminderEnabled?"通知 ON":"通知 OFF"}</button></div><div className="settingsActions"><button disabled={saving} onClick={()=>saveLearningSettings()}>{saving?"保存中…":"設定を保存"}</button>{reminderEnabled&&<button className="secondary" onClick={testPush}>テスト通知</button>}{notice&&<span>{notice}</span>}</div></section>

    {me.latest&&<section className="card latestCard"><div><div className="sectionLabel">前回の会話</div><h3>{me.latest.scenario_title}</h3><p>{me.latest.analysis?.summary_ja||"会話履歴が保存されています。"}</p></div></section>}
    {!installed&&<section className="card installCard"><div><div className="sectionLabel">ホーム画面から起動</div><h3>EigoLoopをアプリとして使う</h3><p>ホーム画面に追加すると、通知と音声練習を使いやすくなります。</p></div>{installPrompt?<button className="primaryButton installButton" onClick={installApp}>アプリをインストール</button>:<div className="installHint">Chromeのメニュー →「ホーム画面に追加」または「アプリをインストール」</div>}</section>}
    <section className="card syncCard"><div><div className="sectionLabel">スマホ・PC同期</div><h3>あなたの同期ID</h3><p>別端末でも同じ履歴・弱点・レポートを使えます。</p></div><div className="syncCode"><code>{me.account.sync_id}</code><button onClick={copyId} title="コピー"><CopyIcon/></button></div></section><button className="textButton danger" onClick={onLogout}>ログアウト</button>
  </div>;
}
