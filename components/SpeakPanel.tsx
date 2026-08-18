"use client";
import { useEffect, useRef, useState } from "react";
import { MicIcon, SparkIcon, VolumeIcon } from "@/components/icons";
import type { MeData } from "@/components/Dashboard";

type Line={role:"user"|"assistant";text:string};
type ConversationMode="free"|"custom";
type Mission={title_ja:string;instruction_ja:string;targets_en:string[];success_condition_ja:string;coach_tip_ja:string};
type PronToken={token:string;logprob:number};
type MetricsState={userSpeechMs:number;aiSpeechMs:number;userTurns:number;aiTurns:number;userStart:number|null;aiStart:number|null;lastAiStop:number|null;lastUserStop:number|null;userResponseLatenciesMs:number[];pronunciationTokens:PronToken[]};

const scenarioSamples=[
  "アメリカのカフェ。相手は店員。私は注文する客。注文後におすすめを聞く展開も入れて。",
  "初対面の大学生同士。同年代の留学生と、趣味や大学生活について自然に雑談する。",
  "海外旅行中のホテル。相手はフロント係。予約確認から、Wi-Fiや朝食の質問まで会話する。",
];
const newMetrics=():MetricsState=>({userSpeechMs:0,aiSpeechMs:0,userTurns:0,aiTurns:0,userStart:null,aiStart:null,lastAiStop:null,lastUserStop:null,userResponseLatenciesMs:[],pronunciationTokens:[]});

export default function SpeakPanel({me,onChanged}:{me:MeData;onChanged:()=>void}){
  const [mode,setMode]=useState<ConversationMode>("free");
  const [scenario,setScenario]=useState("");
  const [level,setLevel]=useState(me.account.level);
  const [voice,setVoice]=useState(me.account.preferred_voice);
  const [conversationStyle,setConversationStyle]=useState(me.account.conversation_style||"natural");
  const [responseLength,setResponseLength]=useState(me.account.response_length||"short");
  const [speechSpeed,setSpeechSpeed]=useState(me.account.speech_speed||"normal");
  const [turnPace,setTurnPace]=useState(me.account.turn_pace||"medium");
  const [phase,setPhase]=useState<"setup"|"connecting"|"live"|"analyzing"|"result">("setup");
  const [status,setStatus]=useState("準備中");
  const [error,setError]=useState("");
  const [transcript,setTranscript]=useState<Line[]>([]);
  const [analysis,setAnalysis]=useState<any|null>(null);
  const [reviewAdded,setReviewAdded]=useState(0);
  const [reviewStrengthened,setReviewStrengthened]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [audioNeedsTap,setAudioNeedsTap]=useState(false);
  const [mission,setMission]=useState<Mission|null>(null);
  const [drillActive,setDrillActive]=useState(false);
  const [drillIndex,setDrillIndex]=useState(0);
  const [drillReveal,setDrillReveal]=useState(false);
  const [drillDone,setDrillDone]=useState(false);

  const pcRef=useRef<RTCPeerConnection|null>(null);
  const dcRef=useRef<RTCDataChannel|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const sessionIdRef=useRef("");
  const startedRef=useRef(0);
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const remoteStreamRef=useRef<MediaStream|null>(null);
  const transcriptRef=useRef<Line[]>([]);
  const metricsRef=useRef<MetricsState>(newMetrics());
  const missionRef=useRef<Mission|null>(null);

  useEffect(()=>{void loadMission();return()=>cleanup()},[]);
  useEffect(()=>{if(phase!=="live")return;const id=window.requestAnimationFrame(()=>attachRemoteAudio());return()=>window.cancelAnimationFrame(id)},[phase]);

  async function loadMission(){
    try{const r=await fetch("/api/mission",{cache:"no-store"});const d=await r.json();if(r.ok&&d.mission){missionRef.current=d.mission;setMission(d.mission);return d.mission as Mission}}catch{}
    return null;
  }
  function nowRel(){return startedRef.current?Math.max(0,Date.now()-startedRef.current):0}
  function attachRemoteAudio(stream?:MediaStream|null){const remote=stream||remoteStreamRef.current;const el=audioRef.current;if(!remote||!el)return;if(el.srcObject!==remote)el.srcObject=remote;el.muted=false;el.volume=1;void el.play().then(()=>setAudioNeedsTap(false)).catch(()=>setAudioNeedsTap(true))}
  function cleanup(){if(timerRef.current)clearInterval(timerRef.current);timerRef.current=null;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;if(audioRef.current){audioRef.current.pause();audioRef.current.srcObject=null}remoteStreamRef.current=null;setAudioNeedsTap(false);dcRef.current?.close();dcRef.current=null;pcRef.current?.close();pcRef.current=null}
  function liveScenario(){
    const base=mode==="free"?(scenario.trim()?`Free conversation. The learner would like to talk about: ${scenario.trim()}`:"Free conversation about anything. Let the learner choose topics naturally."):scenario.trim();
    const m=missionRef.current;
    return m?`${base}\nLearning mission for the learner: ${m.title_ja}. Encourage opportunities to naturally use these expressions without revealing answers or turning the conversation into a quiz: ${m.targets_en.join(" / ")}.`:base;
  }
  function append(line:Line){setTranscript(prev=>{const next=[...prev,line].slice(-80);transcriptRef.current=next;return next})}
  function finalizeCurrent(now:number){const m=metricsRef.current;if(m.userStart!==null){m.userSpeechMs+=Math.max(0,now-m.userStart);m.userStart=null}if(m.aiStart!==null){m.aiSpeechMs+=Math.max(0,now-m.aiStart);m.aiStart=null}}

  function handleEvent(raw:string){
    let e:any;try{e=JSON.parse(raw)}catch{return}
    const t=nowRel();const m=metricsRef.current;
    if(e.type==="input_audio_buffer.speech_started"){
      setStatus("聞いています…");
      if(m.userStart===null){m.userStart=t;m.userTurns+=1;if(m.lastAiStop!==null&&t>=m.lastAiStop)m.userResponseLatenciesMs.push(Math.min(30000,t-m.lastAiStop))}
    }
    if(e.type==="input_audio_buffer.speech_stopped"){
      setStatus("考えています…");
      if(m.userStart!==null){m.userSpeechMs+=Math.max(0,t-m.userStart);m.userStart=null}m.lastUserStop=t;
    }
    if(e.type==="output_audio_buffer.started"){
      setStatus("AIが話しています");
      if(m.aiStart===null){m.aiStart=t;m.aiTurns+=1}
    }
    if(e.type==="output_audio_buffer.stopped"){
      setStatus("あなたの番です");
      if(m.aiStart!==null){m.aiSpeechMs+=Math.max(0,t-m.aiStart);m.aiStart=null}m.lastAiStop=t;
    }
    if(e.type==="response.output_audio_transcript.done"&&e.transcript)append({role:"assistant",text:e.transcript});
    if(e.type==="conversation.item.input_audio_transcription.completed"&&e.transcript){
      append({role:"user",text:e.transcript});
      if(Array.isArray(e.logprobs))for(const p of e.logprobs){if(typeof p?.token==="string"&&Number.isFinite(Number(p.logprob))&&m.pronunciationTokens.length<2500)m.pronunciationTokens.push({token:p.token,logprob:Number(p.logprob)})}
    }
    if(e.type==="response.done")setStatus("あなたの番です");
    if(e.type==="error"){console.error("Realtime error",e);setStatus("接続エラー")}
  }

  async function createSession(){
    await fetch("/api/me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({level,preferredVoice:voice,conversationStyle,responseLength,speechSpeed,turnPace})});
    const sRes=await fetch("/api/conversations/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,scenario:liveScenario()})});
    const sData=await sRes.json();if(!sRes.ok)throw new Error(sData.error||"会話の準備に失敗しました");sessionIdRef.current=sData.id;
  }
  function startTimer(){startedRef.current=Date.now();setElapsed(0);timerRef.current=setInterval(()=>setElapsed(Math.floor((Date.now()-startedRef.current)/1000)),1000)}
  async function start(){
    setError("");if(mode==="custom"&&!scenario.trim()){setError("シチュエーションを入力してください。");return}
    setPhase("connecting");setTranscript([]);transcriptRef.current=[];setAnalysis(null);metricsRef.current=newMetrics();setDrillActive(false);setDrillDone(false);setDrillIndex(0);setDrillReveal(false);
    try{
      if(!missionRef.current)await loadMission();
      await createSession();
      if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==="undefined")throw new Error("このブラウザはリアルタイム音声会話に対応していません。最新版のChrome / Edge / Safariを使ってください。");
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});streamRef.current=stream;
      const pc=new RTCPeerConnection();pcRef.current=pc;stream.getTracks().forEach(track=>pc.addTrack(track,stream));pc.ontrack=e=>{const remote=e.streams?.[0]||new MediaStream([e.track]);remoteStreamRef.current=remote;attachRemoteAudio(remote)};
      const dc=pc.createDataChannel("oai-events");dcRef.current=dc;dc.onmessage=e=>handleEvent(e.data);dc.onopen=()=>{
        setStatus("AIが会話を始めます");
        dc.send(JSON.stringify({type:"session.update",session:{type:"realtime",include:["item.input_audio_transcription.logprobs"],audio:{input:{transcription:{model:"gpt-4o-mini-transcribe",language:"en"},turn_detection:{type:"semantic_vad",eagerness:turnPace,create_response:true,interrupt_response:true}}}}}));
        dc.send(JSON.stringify({type:"response.create",response:{instructions:"Start the conversation now. Give a brief, natural opening that fits the scenario, then let the learner respond."}}));
      };
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const r=await fetch("/api/realtime/connect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sdp:offer.sdp,scenario:liveScenario(),level,voice,conversationStyle,responseLength,speechSpeed})});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"音声AIに接続できませんでした")}
      const answer=await r.text();await pc.setRemoteDescription({type:"answer",sdp:answer});startTimer();setPhase("live");setStatus("接続しました");
    }catch(err:any){cleanup();setPhase("setup");setError(err?.message||"接続に失敗しました。マイク権限を確認してください。")}
  }
  async function finish(){
    const duration=Math.max(0,Math.floor((Date.now()-startedRef.current)/1000));finalizeCurrent(nowRel());const metrics=metricsRef.current;cleanup();setElapsed(duration);setPhase("analyzing");setStatus("会話を分析中");
    const r=await fetch("/api/conversations/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:sessionIdRef.current,durationSeconds:duration,transcript:transcriptRef.current,metrics:{userSpeechMs:metrics.userSpeechMs,aiSpeechMs:metrics.aiSpeechMs,userTurns:metrics.userTurns,aiTurns:metrics.aiTurns,userResponseLatenciesMs:metrics.userResponseLatenciesMs,pronunciationTokens:metrics.pronunciationTokens}})});
    const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||"添削に失敗しました。");setAnalysis(null)}else{setAnalysis(d.analysis);setReviewAdded(d.reviewAdded||0);setReviewStrengthened(d.reviewStrengthened||0);onChanged()}setPhase("result");
  }
  function reset(){setPhase("setup");setTranscript([]);transcriptRef.current=[];setAnalysis(null);setError("");setReviewAdded(0);setReviewStrengthened(0);metricsRef.current=newMetrics();setDrillActive(false);setDrillDone(false)}
  function speak(text:string,rate=1){if(!text)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="en-US";u.rate=rate;speechSynthesis.speak(u)}
  function nextDrill(){const items=analysis?.five_minute_drill?.items||[];if(drillIndex>=items.length-1){setDrillDone(true);setDrillActive(false)}else{setDrillIndex(i=>i+1);setDrillReveal(false)}}

  if(phase==="connecting"||phase==="analyzing")return <div className="voiceFull"><div className={`voiceOrb ${phase}`}><div className="pulse"/><SparkIcon/></div><h2>{phase==="connecting"?"AIと接続しています":"会話を分析しています"}</h2><p>{phase==="connecting"?"マイクとリアルタイム音声を準備中…":"添削・発音・発話率・5分ドリルをまとめて作成中。"}</p><div className="loaderDots"><i/><i/><i/></div></div>;

  if(phase==="live")return <div className="voiceSession"><audio ref={audioRef} autoPlay playsInline/><div className="liveTop"><button className="ghostButton" onClick={finish}>終了</button><span className="liveDot">LIVE</span><time>{String(Math.floor(elapsed/60)).padStart(2,"0")}:{String(elapsed%60).padStart(2,"0")}</time></div><div className="voiceCenter"><div className={`voiceOrb active ${status.includes("AI")?"speaking":""}`}><div className="pulse"/><MicIcon/></div><h2>{status}</h2><p>{mission?`今日のミッション：${mission.title_ja}`:mode==="free"?"AIフリートーク":"カスタムシチュエーション"}</p>{audioNeedsTap&&<button className="talkButton" onClick={()=>attachRemoteAudio()}><VolumeIcon/>AI音声を再生</button>}</div><div className="liveTranscript">{transcript.slice(-5).map((m,i)=><div className={m.role} key={i}><b>{m.role==="user"?"You":"AI"}</b><span>{m.text}</span></div>)}</div><button className="endButton" onClick={finish}>会話を終了して分析</button></div>;

  if(phase==="result"){
    const m=analysis?.speaking_metrics;const p=analysis?.pronunciation;const missionResult=analysis?.mission_result;const drill=analysis?.five_minute_drill;const drillItem=drill?.items?.[drillIndex];
    return <div className="page contentPage resultPage"><style>{`
      .metricStrip{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0}.metricStrip div{padding:13px;text-align:center}.metricStrip span{display:block;font-size:9px;color:#898b9b}.metricStrip b{display:block;font-size:20px;margin-top:4px}.pronCard,.missionResult,.drillCard{padding:18px;margin-top:14px}.pronScore{display:flex;align-items:end;gap:8px}.pronScore strong{font-size:34px}.pronTargets{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.pronTargets button{border:0;background:#efefff;color:#5557cf;border-radius:999px;padding:7px 10px;font-weight:800}.missionResult.ok{border:1px solid #bfe4c7}.missionResult.no{border:1px solid #ead9b6}.drillStage{background:#f8f8fc;border-radius:14px;padding:16px;margin-top:12px}.drillStage h4{margin:5px 0 10px}.drillAnswer{margin-top:12px;padding:12px;background:white;border-radius:12px;font-weight:800}.drillActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.drillActions button{border:0;border-radius:10px;padding:9px 12px;font-weight:800;background:#ececf5}.drillActions button.primary{background:#5b5ce2;color:#fff}@media(max-width:700px){.metricStrip{grid-template-columns:1fr 1fr}}
    `}</style><header className="pageHeader"><div><div className="eyebrow">SESSION COMPLETE</div><h2>会話レポート</h2></div><span className="durationPill">{Math.max(1,Math.round(elapsed/60))}分</span></header>{error&&<div className="formError">{error}</div>}{analysis?<>
      <section className="scoreBoard card"><div><div className="sectionLabel">総合フィードバック</div><p>{analysis.summary_ja}</p></div>{analysis.scores&&<div className="scoreGrid">{Object.entries(analysis.scores).map(([k,v])=><div key={k}><span>{({fluency:"流暢さ",grammar:"文法",vocabulary:"語彙",naturalness:"自然さ"} as any)[k]}</span><strong>{String(v)}</strong><small>/5</small></div>)}</div>}</section>
      {m&&<div className="metricStrip"><div className="card"><span>自分の発話率</span><b>{m.user_speaking_share_percent}%</b></div><div className="card"><span>返答開始まで</span><b>{m.avg_user_response_seconds}s</b></div><div className="card"><span>話速</span><b>{m.words_per_minute}<small> wpm</small></b></div><div className="card"><span>フィラー</span><b>{m.filler_count}<small> 回</small></b></div></div>}
      {p&&<section className="card pronCard"><div className="sectionLabel">PRONUNCIATION</div><h3>発音・明瞭さ診断</h3><div className="pronScore"><strong>{p.clarity_score||"—"}</strong><span>/ 5　音声認識確信度 {p.confidence_percent||0}%</span></div><p>{p.advice_ja}</p>{p.targets?.length>0&&<><small>認識が揺れた単語</small><div className="pronTargets">{p.targets.map((x:string)=><button key={x} onClick={()=>speak(x,.85)}><VolumeIcon/>{x}</button>)}</div></>}</section>}
      {missionResult&&<section className={`card missionResult ${missionResult.achieved?"ok":"no"}`}><div className="sectionLabel">TODAY&apos;S MISSION</div><h3>{missionResult.achieved?"✓ ミッション達成":"次回もう一度狙おう"}</h3><p>{missionResult.title_ja}</p>{missionResult.used_targets?.length>0&&<div className="targetChips">{missionResult.used_targets.map((x:string)=><span key={x}>{x}</span>)}</div>}</section>}
      {analysis.strengths_ja?.length>0&&<section className="card resultSection"><div className="sectionLabel">GOOD POINTS</div><h3>今回できていたこと</h3><ul className="strengthList">{analysis.strengths_ja.map((x:string,i:number)=><li key={i}>{x}</li>)}</ul></section>}
      <section className="card resultSection"><div className="sectionLabel">CORRECTIONS</div><h3>次に直したい表現</h3>{analysis.corrections?.length?<div className="bigCorrections">{analysis.corrections.map((c:any,i:number)=><div key={i}><div className="before">{c.original}</div><div className="after">{c.corrected}<button onClick={()=>speak(c.corrected)}><VolumeIcon/></button></div><p>{c.explanation_ja}</p></div>)}</div>:<p>大きく直す必要のある表現はありませんでした。</p>}</section>
      <div className="reviewAdded"><SparkIcon/><div><strong>{reviewAdded}件を新規追加{reviewStrengthened>0?`・${reviewStrengthened}件を重点復習に強化`:""}</strong><span>同じ弱点が再発すると早めに再出題します。</span></div></div>
      {drill?.items?.length>0&&<section className="card drillCard"><div className="sectionLabel">5-MINUTE DRILL</div><h3>会話直後の5分集中ドリル</h3><p>今の記憶が残っているうちに、言い直し・瞬間英作文・発音・シャドーイングを終わらせよう。</p>{!drillActive&&!drillDone&&<button className="primaryButton" onClick={()=>{setDrillActive(true);setDrillIndex(0);setDrillReveal(false)}}>5分ドリルを始める</button>}{drillActive&&drillItem&&<div className="drillStage"><span>{drillIndex+1} / {drill.items.length} ・ {drillItem.label_ja}</span><h4>{drillItem.prompt_ja}</h4><p>{drillItem.tip_ja}</p>{drillReveal&&<div className="drillAnswer">{drillItem.answer_en}</div>}<div className="drillActions"><button onClick={()=>speak(drillItem.answer_en,.9)}><VolumeIcon/>聞く</button><button onClick={()=>setDrillReveal(v=>!v)}>{drillReveal?"答えを隠す":"答えを見る"}</button><button className="primary" onClick={nextDrill}>{drillIndex===drill.items.length-1?"完了":"次へ"}</button></div></div>}{drillDone&&<div className="reviewAdded"><SparkIcon/><div><strong>5分ドリル完了</strong><span>この会話の弱点を、会話直後にもう一度口から出せました。</span></div></div>}</section>}
    </>:<section className="card resultSection"><h3>会話は保存しました</h3><p>今回は分析結果を取得できませんでした。</p></section>}<button className="primaryButton full" onClick={reset}>もう一度話す</button></div>;
  }

  return <div className="page contentPage speakSetup"><style>{`
    .missionMini{padding:15px;margin:10px 0 16px;background:#f6f6ff;border:1px solid #e2e2ff;border-radius:14px}.missionMini h3{margin:3px 0 6px;font-size:15px}.missionMini p{margin:0;font-size:11px;color:#73768a}.targetChips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.targetChips span{background:#fff;color:#5658cf;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:800}.setupGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.setupField{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:800}.setupField select,.setupField textarea,.setupField input{border:1px solid #dfe1eb;border-radius:12px;background:#fbfbfd;padding:11px}.setupField textarea{min-height:100px;resize:vertical}.modeSwitch{margin-bottom:12px}.sampleButtons{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.sampleButtons button{border:0;background:#f0f0f6;border-radius:999px;padding:6px 8px;font-size:9px}@media(max-width:700px){.setupGrid{grid-template-columns:1fr}}
  `}</style><header className="pageHeader"><div><div className="eyebrow">SPEAKING PRACTICE</div><h2>英語で話す</h2></div></header><div className="modeNotice paidNotice"><b>OpenAI Realtime</b><span>自然な音声会話 + 発音/発話分析 + 会話後ドリル。</span></div>{mission&&<div className="missionMini"><div className="sectionLabel">TODAY&apos;S MISSION</div><h3>{mission.title_ja}</h3><p>{mission.instruction_ja}</p><div className="targetChips">{mission.targets_en.map(x=><span key={x}>{x}</span>)}</div></div>}<div className="sectionLabel conversationLabel">会話形式</div><section className="modeSwitch"><button className={mode==="free"?"active":""} onClick={()=>setMode("free")}><SparkIcon/><b>フリートーク</b><span>自由な雑談</span></button><button className={mode==="custom"?"active":""} onClick={()=>setMode("custom")}><MicIcon/><b>シチュエーション</b><span>役・場所・展開を指定</span></button></section><div className="setupGrid"><label className="setupField" style={{gridColumn:"1 / -1"}}>テーマ / シチュエーション<textarea value={scenario} onChange={e=>setScenario(e.target.value)} placeholder={mode==="free"?"空欄でもOK。話したいテーマがあれば入力。":"例：海外のカフェで注文する"}/>{mode==="custom"&&<div className="sampleButtons">{scenarioSamples.map(x=><button type="button" key={x} onClick={()=>setScenario(x)}>{x.slice(0,18)}…</button>)}</div>}</label><label className="setupField">レベル<select value={level} onChange={e=>setLevel(e.target.value)}><option value="beginner">初級</option><option value="intermediate">中級</option><option value="advanced">上級</option></select></label><label className="setupField">AI音声<select value={voice} onChange={e=>setVoice(e.target.value)}>{["marin","cedar","coral","verse","sage","alloy"].map(v=><option value={v} key={v}>{v}</option>)}</select></label><label className="setupField">会話スタイル<select value={conversationStyle} onChange={e=>setConversationStyle(e.target.value)}><option value="natural">自然</option><option value="supportive">やさしい</option><option value="immersive">没入</option></select></label><label className="setupField">AI返答量<select value={responseLength} onChange={e=>setResponseLength(e.target.value)}><option value="short">短め</option><option value="medium">標準</option></select></label><label className="setupField">話す速度<select value={speechSpeed} onChange={e=>setSpeechSpeed(e.target.value)}><option value="slow">少しゆっくり</option><option value="normal">自然</option><option value="fast">テンポ良く</option></select></label><label className="setupField">返答タイミング<select value={turnPace} onChange={e=>setTurnPace(e.target.value)}><option value="low">待ち長め</option><option value="medium">自然</option><option value="high">すばやい</option></select></label></div>{error&&<div className="formError">{error}</div>}<button className="primaryButton full" style={{marginTop:16}} onClick={start}><MicIcon/> 会話を始める</button></div>;
}
