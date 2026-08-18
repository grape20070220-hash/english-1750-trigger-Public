"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronIcon, HistoryIcon, MicIcon, SparkIcon, VolumeIcon } from "@/components/icons";

type TranscriptLine = { role:string; text:string };
type Session = { id:string; scenario_title:string; scenario:string; mode:string; transcript:TranscriptLine[]; analysis:any; ended_at:string; duration_seconds:number };

function formatDate(s:string){ return new Intl.DateTimeFormat("ja-JP",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(s)); }
function splitSentences(text:string){
  const cleaned=text.replace(/\s+/g," ").trim();
  if(!cleaned) return [];
  const parts=cleaned.match(/[^.!?]+[.!?]+(?:[\"']+)?|[^.!?]+$/g);
  return (parts||[cleaned]).map(x=>x.trim()).filter(Boolean);
}
function aiSentences(s:Session){
  return (s.transcript||[]).filter(x=>x.role==="assistant").flatMap(x=>splitSentences(x.text));
}

export default function HistoryPanel(){
  const [sessions,setSessions]=useState<Session[]>([]);
  const [loading,setLoading]=useState(true);
  const [open,setOpen]=useState<string|null>(null);
  const [speakingKey,setSpeakingKey]=useState<string|null>(null);
  const [rate,setRate]=useState(1);
  const [shadowSession,setShadowSession]=useState<string|null>(null);
  const [shadowIndex,setShadowIndex]=useState(0);
  const [continuous,setContinuous]=useState(false);
  const [repeatOne,setRepeatOne]=useState(false);
  const [recording,setRecording]=useState(false);
  const [recordedUrl,setRecordedUrl]=useState<string|null>(null);
  const [audioError,setAudioError]=useState("");

  const continuousRef=useRef(false);
  const repeatRef=useRef(false);
  const shadowSessionRef=useRef<string|null>(null);
  const shadowIndexRef=useRef(0);
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recordStreamRef=useRef<MediaStream|null>(null);
  const recordChunksRef=useRef<Blob[]>([]);

  useEffect(()=>{
    fetch("/api/conversations").then(r=>r.json()).then(d=>setSessions(d.sessions||[])).finally(()=>setLoading(false));
    return ()=>cleanupMedia();
  },[]);
  useEffect(()=>{ continuousRef.current=continuous; },[continuous]);
  useEffect(()=>{ repeatRef.current=repeatOne; },[repeatOne]);
  useEffect(()=>{ shadowSessionRef.current=shadowSession; },[shadowSession]);
  useEffect(()=>{ shadowIndexRef.current=shadowIndex; },[shadowIndex]);

  function cleanupMedia(){
    if(timerRef.current) clearTimeout(timerRef.current);
    timerRef.current=null;
    if(typeof window!=="undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if(recorderRef.current?.state==="recording") recorderRef.current.stop();
    recordStreamRef.current?.getTracks().forEach(t=>t.stop());
    recordStreamRef.current=null;
  }

  function preferredVoice(){
    if(typeof window==="undefined" || !("speechSynthesis" in window)) return undefined;
    const voices=window.speechSynthesis.getVoices();
    const english=voices.filter(v=>/^en(-|_)/i.test(v.lang));
    return english.find(v=>/Google US English|Samantha|Microsoft.*Online|Natural/i.test(v.name))
      || english.find(v=>/^en-US/i.test(v.lang))
      || english[0];
  }

  function speak(text:string,key:string,onEnd?:()=>void){
    setAudioError("");
    if(typeof window==="undefined" || !("speechSynthesis" in window)){
      setAudioError("この端末では音声読み上げを利用できません。");
      return;
    }
    window.speechSynthesis.cancel();
    if(timerRef.current) clearTimeout(timerRef.current);
    const u=new SpeechSynthesisUtterance(text);
    u.lang="en-US";
    u.rate=rate;
    const voice=preferredVoice();
    if(voice) u.voice=voice;
    u.onstart=()=>setSpeakingKey(key);
    u.onend=()=>{ setSpeakingKey(null); onEnd?.(); };
    u.onerror=()=>{ setSpeakingKey(null); setAudioError("音声の再生に失敗しました。もう一度押してください。"); };
    window.speechSynthesis.speak(u);
  }

  function stopSpeech(){
    if(timerRef.current) clearTimeout(timerRef.current);
    timerRef.current=null;
    continuousRef.current=false;
    repeatRef.current=false;
    setContinuous(false);
    setRepeatOne(false);
    setSpeakingKey(null);
    if(typeof window!=="undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function shadowLines(){
    const s=sessions.find(x=>x.id===shadowSessionRef.current);
    return s?aiSentences(s):[];
  }

  function playShadow(index:number){
    const lines=shadowLines();
    if(!lines.length) return;
    const safe=Math.max(0,Math.min(index,lines.length-1));
    shadowIndexRef.current=safe;
    setShadowIndex(safe);
    speak(lines[safe],`shadow-${safe}`,()=>{
      if(repeatRef.current){
        timerRef.current=setTimeout(()=>playShadow(safe),650);
        return;
      }
      if(continuousRef.current){
        const next=safe+1;
        if(next<lines.length) timerRef.current=setTimeout(()=>playShadow(next),700);
        else { continuousRef.current=false; setContinuous(false); }
      }
    });
  }

  function openShadowing(session:Session){
    stopSpeech();
    if(recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setShadowSession(session.id);
    shadowSessionRef.current=session.id;
    setShadowIndex(0);
    shadowIndexRef.current=0;
    setAudioError("");
  }

  function closeShadowing(){
    stopSpeech();
    stopRecording();
    setShadowSession(null);
    shadowSessionRef.current=null;
  }

  function toggleRepeat(){
    const next=!repeatOne;
    setRepeatOne(next);
    repeatRef.current=next;
    if(next){ setContinuous(false); continuousRef.current=false; }
    if(next) playShadow(shadowIndexRef.current);
    else stopSpeech();
  }

  function toggleContinuous(){
    const next=!continuous;
    setContinuous(next);
    continuousRef.current=next;
    if(next){
      setRepeatOne(false);
      repeatRef.current=false;
      playShadow(shadowIndexRef.current);
    }else stopSpeech();
  }

  async function startRecording(){
    setAudioError("");
    try{
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined") throw new Error("unsupported");
      if(recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      recordStreamRef.current=stream;
      recordChunksRef.current=[];
      const recorder=new MediaRecorder(stream);
      recorderRef.current=recorder;
      recorder.ondataavailable=e=>{ if(e.data.size) recordChunksRef.current.push(e.data); };
      recorder.onstop=()=>{
        const blob=new Blob(recordChunksRef.current,{type:recorder.mimeType||"audio/webm"});
        setRecordedUrl(URL.createObjectURL(blob));
        recordStreamRef.current?.getTracks().forEach(t=>t.stop());
        recordStreamRef.current=null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    }catch{
      setAudioError("録音を開始できませんでした。マイク権限を確認してください。");
    }
  }

  function stopRecording(){
    if(recorderRef.current?.state==="recording") recorderRef.current.stop();
    else {
      recordStreamRef.current?.getTracks().forEach(t=>t.stop());
      recordStreamRef.current=null;
      setRecording(false);
    }
  }

  return <div className="page contentPage">
    <style>{`
      .historyAudioActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0 2px}.historyAudioActions button,.aiPlayButton,.shadowCtl{border:1px solid #dfe1eb;background:#fff;color:#5b5ce2;border-radius:12px;padding:9px 12px;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:7px}.historyAudioActions button:hover,.aiPlayButton:hover,.shadowCtl:hover{background:#f3f3ff}.historyAudioActions svg,.aiPlayButton svg,.shadowCtl svg{width:17px;height:17px}.rateSelect{border:1px solid #dfe1eb;background:#fff;border-radius:12px;padding:9px 10px;color:#55586f;font-size:12px;font-weight:800}.historyAudioNote{font-size:10px;color:#999bad;margin-top:7px}.transcriptHistory .aiLine{align-items:flex-start}.transcriptHistory .aiText{flex:1}.aiPlayButton{padding:5px 8px;border-radius:9px;flex:none;margin-left:auto}.aiPlayButton.playing{background:#ededff}.shadowPanel{margin-top:16px;border:1px solid #dfe0f0;background:linear-gradient(145deg,#f7f7ff,#fff);border-radius:18px;padding:17px}.shadowHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.shadowHead h4{margin:3px 0 4px;font-size:17px}.shadowHead p{margin:0;color:#7f8295;font-size:11px;line-height:1.5}.shadowClose{border:0;background:#ececf7;color:#6d7085;width:32px;height:32px;border-radius:10px;font-size:18px}.shadowSentence{margin:16px 0 12px;background:#20213c;color:#fff;border-radius:17px;padding:20px;min-height:116px;display:flex;flex-direction:column;justify-content:center}.shadowCounter{font-size:10px;color:#aaaed2;letter-spacing:.08em;margin-bottom:9px}.shadowSentence strong{font-size:20px;line-height:1.55;letter-spacing:-.01em}.shadowControls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.shadowCtl.primary{background:#5b5ce2;border-color:#5b5ce2;color:#fff}.shadowCtl.active{background:#e9e9ff;border-color:#b9baf5}.shadowCtl.danger{color:#c14d5b}.shadowNav{display:flex;gap:7px;margin-left:auto}.recordBox{margin-top:12px;padding-top:12px;border-top:1px solid #e1e2ee;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.recordDot{width:8px;height:8px;border-radius:50%;background:#d34f60;display:inline-block;animation:recpulse 1s infinite}.recordPlayback{height:36px;max-width:260px}.audioError{margin-top:10px;font-size:11px;color:#b44b58}.shadowTip{margin-top:10px;font-size:10px;color:#9093a5;line-height:1.5}@keyframes recpulse{50%{opacity:.35}}@media(max-width:560px){.shadowControls{display:grid;grid-template-columns:1fr 1fr}.shadowNav{margin-left:0;grid-column:1/-1}.shadowNav .shadowCtl{flex:1}.recordBox{align-items:stretch}.recordPlayback{max-width:100%;width:100%}.shadowSentence strong{font-size:18px}}
    `}</style>
    <header className="pageHeader"><div><div className="eyebrow">CONVERSATION LOG</div><h2>会話履歴</h2></div><div className="dueBadge"><HistoryIcon/>{sessions.length}回</div></header>
    {loading ? <div className="centerState"><div className="spinner"/>履歴を読み込み中…</div> : sessions.length===0 ? <section className="emptySuccess card"><div className="successCircle muted"><HistoryIcon/></div><h3>まだ会話履歴がありません</h3><p>最初のAI英会話を始めると、添削結果と一緒にここへ保存されます。</p></section> : <div className="historyList">{sessions.map(s=>{ const isOpen=open===s.id; const sc=s.analysis?.scores; const avg=sc?((sc.fluency+sc.grammar+sc.vocabulary+sc.naturalness)/4).toFixed(1):"—"; const source=s.mode?.startsWith("browser:")?"過去の会話":"OpenAI"; const lines=aiSentences(s); const isShadow=shadowSession===s.id; return <article className={`historyCard card ${isOpen?"open":""}`} key={s.id}><button className="historyTop" onClick={()=>{setOpen(isOpen?null:s.id);if(isOpen&&isShadow)closeShadowing();}}><div><div className="historyDate">{formatDate(s.ended_at)} ・ {Math.max(1,Math.round(s.duration_seconds/60))}分 ・ {source}</div><h3>{s.scenario_title}</h3><p>{s.analysis?.summary_ja || "会話を保存しました"}</p></div><div className="historyScore"><strong>{avg}</strong><small>/ 5</small><ChevronIcon/></div></button>{isOpen&&<div className="historyDetail">
      {s.analysis?.corrections?.length>0&&<div><div className="sectionLabel">主な添削</div><div className="correctionList">{s.analysis.corrections.map((c:any,i:number)=><div key={i}><span className="badText">{c.original}</span><span className="arrow">→</span><span className="goodText">{c.corrected}</span><small>{c.explanation_ja}</small></div>)}</div></div>}
      {lines.length>0&&<><div className="historyAudioActions"><button onClick={()=>speak(lines.join(" "),`all-${s.id}`)}><VolumeIcon/>{speakingKey===`all-${s.id}`?"再生中…":"AI発話を全部聞く"}</button><button onClick={()=>openShadowing(s)}><SparkIcon/>シャドーイング</button><select className="rateSelect" value={rate} onChange={e=>setRate(Number(e.target.value))} aria-label="再生速度"><option value="0.75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option></select></div><div className="historyAudioNote">履歴の再生は端末の英語音声を使用するため、追加のOpenAI API料金はかかりません。</div></>}
      {isShadow&&lines.length>0&&<div className="shadowPanel"><div className="shadowHead"><div><div className="sectionLabel">SHADOWING MODE</div><h4>AIの英語を追いかけて発音</h4><p>音声から少し遅れて、同じリズム・強弱・発音をまねして話します。</p></div><button className="shadowClose" onClick={closeShadowing}>×</button></div><div className="shadowSentence"><span className="shadowCounter">{shadowIndex+1} / {lines.length}</span><strong>{lines[shadowIndex]}</strong></div><div className="shadowControls"><button className="shadowCtl primary" onClick={()=>playShadow(shadowIndex)}><VolumeIcon/>{speakingKey===`shadow-${shadowIndex}`?"再生中":"この文を再生"}</button><button className={`shadowCtl ${repeatOne?"active":""}`} onClick={toggleRepeat}>↻ 1文リピート</button><button className={`shadowCtl ${continuous?"active":""}`} onClick={toggleContinuous}>{continuous?"■ 連続停止":"▶ 連続シャドーイング"}</button><div className="shadowNav"><button className="shadowCtl" disabled={shadowIndex===0} onClick={()=>{stopSpeech();setShadowIndex(i=>Math.max(0,i-1));shadowIndexRef.current=Math.max(0,shadowIndexRef.current-1);}}>← 前</button><button className="shadowCtl" disabled={shadowIndex>=lines.length-1} onClick={()=>{stopSpeech();setShadowIndex(i=>Math.min(lines.length-1,i+1));shadowIndexRef.current=Math.min(lines.length-1,shadowIndexRef.current+1);}}>次 →</button></div></div><div className="recordBox">{!recording?<button className="shadowCtl" onClick={startRecording}><MicIcon/>自分の声を録音</button>:<button className="shadowCtl danger" onClick={stopRecording}><span className="recordDot"/>録音を停止</button>}{recordedUrl&&<audio className="recordPlayback" src={recordedUrl} controls/>}</div><div className="shadowTip">イヤホン推奨：AI音声を聞きながら録音すると、自分の発音とリズムを後から確認しやすくなります。録音はこの端末内だけで、履歴やサーバーには保存しません。</div>{audioError&&<div className="audioError">{audioError}</div>}</div>}
      <details><summary>会話全文を見る</summary><div className="transcriptHistory">{(s.transcript||[]).map((m,i)=><div className={`${m.role} ${m.role==="assistant"?"aiLine":""}`} key={i}><b>{m.role==="user"?"You":s.mode?.startsWith("browser:")?"Partner":"AI"}</b><span className={m.role==="assistant"?"aiText":undefined}>{m.text}</span>{m.role==="assistant"&&<button className={`aiPlayButton ${speakingKey===`line-${s.id}-${i}`?"playing":""}`} onClick={()=>speak(m.text,`line-${s.id}-${i}`)} title="AIの文を聞く"><VolumeIcon/>{speakingKey===`line-${s.id}-${i}`?"再生中":"聞く"}</button>}</div>)}</div></details>
      {!isShadow&&audioError&&<div className="audioError">{audioError}</div>}
    </div>}</article>})}</div>}
  </div>;
}
