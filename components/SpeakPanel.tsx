"use client";
import { useEffect, useRef, useState } from "react";
import { MicIcon, SparkIcon, VolumeIcon } from "@/components/icons";
import type { MeData } from "@/components/Dashboard";

type Line = { role:"user"|"assistant"; text:string };
type Analysis = any;
type ConversationMode = "free" | "custom";

const scenarioSamples = [
  "アメリカのカフェ。相手は店員。私は注文する客。注文後におすすめを聞く展開も入れて。",
  "初対面の大学生同士。同年代の留学生と、趣味や大学生活について自然に雑談する。",
  "海外旅行中のホテル。相手はフロント係。予約確認から、Wi-Fiや朝食の質問まで会話する。",
];

export default function SpeakPanel({ me, onChanged }: { me: MeData; onChanged: () => void }) {
  const [mode,setMode]=useState<ConversationMode>("free");
  const [scenario,setScenario]=useState("");
  const [level,setLevel]=useState(me.account.level);
  const [voice,setVoice]=useState(me.account.preferred_voice);
  const [phase,setPhase]=useState<"setup"|"connecting"|"live"|"analyzing"|"result">("setup");
  const [status,setStatus]=useState("準備中");
  const [error,setError]=useState("");
  const [transcript,setTranscript]=useState<Line[]>([]);
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [reviewAdded,setReviewAdded]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [audioNeedsTap,setAudioNeedsTap]=useState(false);

  const pcRef=useRef<RTCPeerConnection|null>(null);
  const dcRef=useRef<RTCDataChannel|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const sessionIdRef=useRef("");
  const startedRef=useRef(0);
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const remoteStreamRef=useRef<MediaStream|null>(null);
  const transcriptRef=useRef<Line[]>([]);

  useEffect(()=>()=>cleanup(),[]);
  useEffect(()=>{
    if(phase!=="live") return;
    const id=window.requestAnimationFrame(()=>attachRemoteAudio());
    return ()=>window.cancelAnimationFrame(id);
  },[phase]);

  function attachRemoteAudio(stream?:MediaStream|null){
    const remote=stream||remoteStreamRef.current;
    const el=audioRef.current;
    if(!remote||!el) return;
    if(el.srcObject!==remote) el.srcObject=remote;
    el.muted=false;
    el.volume=1;
    void el.play().then(()=>setAudioNeedsTap(false)).catch(err=>{
      console.warn("Remote audio autoplay was blocked",err);
      setAudioNeedsTap(true);
    });
  }

  function cleanup(){
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current=null;
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current=null;
    if(audioRef.current){
      audioRef.current.pause();
      audioRef.current.srcObject=null;
    }
    remoteStreamRef.current=null;
    setAudioNeedsTap(false);
    dcRef.current?.close();
    dcRef.current=null;
    pcRef.current?.close();
    pcRef.current=null;
  }

  function liveScenario(){
    if(mode==="free") return scenario.trim()?`Free conversation. The learner would like to talk about: ${scenario.trim()}`:"Free conversation about anything. Let the learner choose topics naturally.";
    return scenario.trim();
  }

  function append(line:Line){
    setTranscript(prev=>{
      const next=[...prev,line].slice(-60);
      transcriptRef.current=next;
      return next;
    });
  }

  function handleEvent(raw:string){
    let e:any;
    try{e=JSON.parse(raw)}catch{return;}
    if(e.type==="input_audio_buffer.speech_started") setStatus("聞いています…");
    if(e.type==="input_audio_buffer.speech_stopped") setStatus("考えています…");
    if(e.type==="output_audio_buffer.started") setStatus("AIが話しています");
    if(e.type==="output_audio_buffer.stopped") setStatus("あなたの番です");
    if(e.type==="response.output_audio_transcript.done"&&e.transcript) append({role:"assistant",text:e.transcript});
    if(e.type==="conversation.item.input_audio_transcription.completed"&&e.transcript) append({role:"user",text:e.transcript});
    if(e.type==="response.done") setStatus("あなたの番です");
    if(e.type==="error"){
      console.error("Realtime error",e);
      setStatus("接続エラー");
    }
  }

  async function createSession(){
    await fetch("/api/me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({level,preferredVoice:voice})});
    const sRes=await fetch("/api/conversations/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,scenario:liveScenario()})});
    const sData=await sRes.json();
    if(!sRes.ok) throw new Error(sData.error||"会話の準備に失敗しました");
    sessionIdRef.current=sData.id;
  }

  function startTimer(){
    startedRef.current=Date.now();
    setElapsed(0);
    timerRef.current=setInterval(()=>setElapsed(Math.floor((Date.now()-startedRef.current)/1000)),1000);
  }

  async function start(){
    setError("");
    if(mode==="custom"&&!scenario.trim()){
      setError("シチュエーションを入力してください。");
      return;
    }
    setPhase("connecting");
    setTranscript([]);
    transcriptRef.current=[];
    setAnalysis(null);
    try{
      await createSession();
      if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==="undefined") throw new Error("このブラウザはリアルタイム音声会話に対応していません。Chrome / Edge / Safariの最新版を使ってください。");
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      streamRef.current=stream;
      const pc=new RTCPeerConnection();
      pcRef.current=pc;
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      pc.ontrack=(e)=>{
        const remote=e.streams?.[0]||new MediaStream([e.track]);
        remoteStreamRef.current=remote;
        attachRemoteAudio(remote);
      };
      const dc=pc.createDataChannel("oai-events");
      dcRef.current=dc;
      dc.onmessage=(e)=>handleEvent(e.data);
      dc.onopen=()=>{
        setStatus("AIが会話を始めます");
        dc.send(JSON.stringify({type:"session.update",session:{type:"realtime",audio:{input:{transcription:{model:"gpt-4o-mini-transcribe"},turn_detection:{type:"semantic_vad",eagerness:"auto",create_response:true,interrupt_response:true}}}}}));
        dc.send(JSON.stringify({type:"response.create",response:{instructions:"Start the conversation now. Give a brief, natural opening that fits the scenario, then let the learner respond."}}));
      };
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r=await fetch("/api/realtime/connect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sdp:offer.sdp,scenario:liveScenario(),level,voice})});
      if(!r.ok){
        const d=await r.json().catch(()=>({}));
        throw new Error(d.error||"音声AIに接続できませんでした");
      }
      const answer=await r.text();
      await pc.setRemoteDescription({type:"answer",sdp:answer});
      startTimer();
      setPhase("live");
      setStatus("接続しました");
    }catch(err:any){
      cleanup();
      setPhase("setup");
      setError(err?.message||"接続に失敗しました。マイク権限を確認してください。");
    }
  }

  async function finish(){
    const duration=Math.max(0,Math.floor((Date.now()-startedRef.current)/1000));
    cleanup();
    setElapsed(duration);
    setPhase("analyzing");
    setStatus("会話を分析中");
    const r=await fetch("/api/conversations/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:sessionIdRef.current,durationSeconds:duration,transcript:transcriptRef.current})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      setError(d.error||"添削に失敗しました。");
      setAnalysis(null);
    }else{
      setAnalysis(d.analysis);
      setReviewAdded(d.reviewAdded||0);
      onChanged();
    }
    setPhase("result");
  }

  function reset(){
    setPhase("setup");
    setTranscript([]);
    transcriptRef.current=[];
    setAnalysis(null);
    setError("");
    setReviewAdded(0);
  }

  if(phase==="connecting"||phase==="analyzing") return <div className="voiceFull"><div className={`voiceOrb ${phase}`}><div className="pulse"/><SparkIcon/></div><h2>{phase==="connecting"?"AIと接続しています":"会話をAIが添削しています"}</h2><p>{phase==="connecting"?"マイクとリアルタイム音声を準備中…":"文法・語彙・自然さを分析して、弱点を復習へ追加します。"}</p><div className="loaderDots"><i/><i/><i/></div></div>;

  if(phase==="live") return <div className="voiceSession"><audio ref={audioRef} autoPlay playsInline/><div className="liveTop"><button className="ghostButton" onClick={finish}>終了</button><span className="liveDot">LIVE</span><time>{String(Math.floor(elapsed/60)).padStart(2,"0")}:{String(elapsed%60).padStart(2,"0")}</time></div><div className="voiceCenter"><div className={`voiceOrb active ${status.includes("AI")?"speaking":""}`}><div className="pulse"/><MicIcon/></div><h2>{status}</h2><p>{mode==="free"?"AIフリートーク":"カスタムシチュエーション"}</p>{audioNeedsTap&&<button className="talkButton" onClick={()=>attachRemoteAudio()}><VolumeIcon/>AI音声を再生</button>}</div><div className="liveTranscript">{transcript.slice(-5).map((m,i)=><div className={m.role} key={i}><b>{m.role==="user"?"You":"AI"}</b><span>{m.text}</span></div>)}</div><button className="endButton" onClick={finish}>会話を終了して添削</button></div>;

  if(phase==="result") return <div className="page contentPage resultPage"><header className="pageHeader"><div><div className="eyebrow">SESSION COMPLETE</div><h2>会話レポート</h2></div><span className="durationPill">{Math.max(1,Math.round(elapsed/60))}分</span></header>{error&&<div className="formError">{error}</div>}{analysis?<>
    <section className="scoreBoard card"><div><div className="sectionLabel">総合フィードバック</div><p>{analysis.summary_ja}</p></div><div className="scoreGrid">{Object.entries(analysis.scores).map(([k,v])=><div key={k}><span>{({fluency:"流暢さ",grammar:"文法",vocabulary:"語彙",naturalness:"自然さ"} as any)[k]}</span><strong>{String(v)}</strong><small>/5</small></div>)}</div></section>
    {analysis.strengths_ja?.length>0&&<section className="card resultSection"><div className="sectionLabel">GOOD POINTS</div><h3>今回できていたこと</h3><ul className="strengthList">{analysis.strengths_ja.map((x:string,i:number)=><li key={i}>{x}</li>)}</ul></section>}
    <section className="card resultSection"><div className="sectionLabel">CORRECTIONS</div><h3>次に直したい表現</h3>{analysis.corrections?.length?<div className="bigCorrections">{analysis.corrections.map((c:any,i:number)=><div key={i}><div className="before">{c.original}</div><div className="after">{c.corrected}<button onClick={()=>{const u=new SpeechSynthesisUtterance(c.corrected);u.lang="en-US";speechSynthesis.speak(u)}}><VolumeIcon/></button></div><p>{c.explanation_ja}</p></div>)}</div>:<p>大きく直す必要のある表現はありませんでした。会話がよく通じています。</p>}</section>
    <div className="reviewAdded"><SparkIcon/><div><strong>{reviewAdded}件を自動復習に追加</strong><span>次回以降、覚えやすいタイミングで出題します。</span></div></div>
  </>:<section className="card resultSection"><h3>会話は保存しました</h3><p>今回は添削結果を取得できませんでした。履歴には文字起こしを保存しています。</p></section>}<button className="primaryButton full" onClick={reset}>もう一度話す</button></div>;

  return <div className="page contentPage speakSetup"><header className="pageHeader"><div><div className="eyebrow">SPEAKING PRACTICE</div><h2>英語で話す</h2></div></header>
    <div className="modeNotice paidNotice"><b>OpenAI Realtime</b><span>自然なAI音声会話と、会話終了後のAI添削を使用します。</span></div>
    <div className="sectionLabel conversationLabel">会話形式</div><section className="modeSwitch"><button className={mode==="free"?"active":""} onClick={()=>setMode("free")}><SparkIcon/><b>フリートーク</b><span>テーマなしでも自由に練習</span></button><button className={mode==="custom"?"active":""} onClick={()=>setMode("custom")}><MicIcon/><b>シチュエーション</b><span>役・場所・展開を自由入力</span></button></section>
    <section className="card setupCard"><label className="fieldLabel">{mode==="free"?"話したいテーマ（空欄でもOK）":"シチュエーションを自由に入力"}<textarea value={scenario} onChange={e=>setScenario(e.target.value)} rows={mode==="free"?3:5} placeholder={mode==="free"?"例：最近ハマっている音楽について話したい":"例：アメリカのレストラン。相手は店員、私は客。注文した後におすすめを聞き、最後に会計まで。"}/></label>{mode==="custom"&&<div className="sampleRow">{scenarioSamples.map((s,i)=><button key={i} onClick={()=>setScenario(s)}>例{i+1}</button>)}</div>}
      <div className="settingsGrid"><label>難易度<select value={level} onChange={e=>setLevel(e.target.value)}><option value="beginner">初心者 — ゆっくり・簡単</option><option value="intermediate">標準 — 日常英会話</option><option value="advanced">上級 — 自然な速度</option></select></label><label>AIの声<select value={voice} onChange={e=>setVoice(e.target.value)}><option value="marin">Marin — 自然・高品質</option><option value="cedar">Cedar — 落ち着き・高品質</option><option value="coral">Coral</option><option value="verse">Verse</option><option value="sage">Sage</option><option value="alloy">Alloy</option></select></label></div>
    </section>
    <div className="flowLine"><span><i>1</i>話す</span><b>→</b><span><i>2</i>AI添削</span><b>→</b><span><i>3</i>弱点復習</span></div>
    {error&&<div className="formError">{error}</div>}<button className="primaryButton full large" onClick={start}><MicIcon/> AI会話を始める</button><p className="microcopy centered">OpenAI APIの利用料が発生します。</p>
  </div>;
}
