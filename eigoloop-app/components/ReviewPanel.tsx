"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, ReviewIcon, SparkIcon, VolumeIcon } from "@/components/icons";

type Item = {
  id:string;
  category:string;
  original_text:string;
  corrected_text:string;
  explanation_ja:string;
  prompt_ja:string;
  answer_en:string;
  due_at:string;
  repetitions:number;
  lapses:number;
  occurrences:number;
  priority:number;
};

const categoryName:Record<string,string> = {
  grammar:"文法", vocabulary:"語彙", naturalness:"自然さ", expression:"表現", fluency:"流暢さ",
};

export default function ReviewPanel({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading,setLoading]=useState(true);
  const [index,setIndex]=useState(0);
  const [revealed,setRevealed]=useState(false);
  const [grading,setGrading]=useState(false);

  useEffect(() => {
    fetch("/api/review").then(r=>r.json()).then(d=>setItems(d.items||[])).finally(()=>setLoading(false));
  }, []);

  const item = items[index];
  const weakCount = useMemo(()=>items.filter(x=>Number(x.priority)>=2 || Number(x.occurrences)>=2 || Number(x.lapses)>=1).length,[items]);

  function speak(text:string) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang="en-US";
    u.rate=.9;
    speechSynthesis.speak(u);
  }

  async function grade(g:number) {
    if(!item) return;
    setGrading(true);
    const r=await fetch("/api/review/grade",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,grade:g})});
    setGrading(false);
    if(r.ok){
      setRevealed(false);
      setIndex(i=>i+1);
      onChanged();
    }
  }

  if (loading) return <div className="centerState"><div className="spinner"/>復習を読み込み中…</div>;
  if (!item) return <div className="page contentPage"><header className="pageHeader"><div><div className="eyebrow">SMART REVIEW</div><h2>弱点の自動復習</h2></div></header><section className="emptySuccess card"><div className="successCircle"><CheckIcon/></div><h3>今日の復習は完了！</h3><p>{items.length ? `${items.length}件、しっかり復習できました。` : "会話で見つかった弱点がここに自動で追加されます。"}</p></section></div>;

  const remaining = items.length - index;
  const repeated = Number(item.occurrences||1) >= 2;
  const useCorrectionChallenge = repeated && item.original_text && item.original_text !== item.corrected_text && Number(item.repetitions||0)%2===0;
  const important = Number(item.priority||1)>=2 || repeated || Number(item.lapses||0)>0;

  return <div className="page contentPage reviewPage">
    <style>{`
      .weakSummary{display:flex;gap:8px;align-items:center;margin:-2px 0 14px;color:#6f7185;font-size:11px}.weakSummary b{color:#5b5ce2}.priorityBadge{display:inline-flex;align-items:center;gap:5px;background:#fff1e8;color:#b36b35;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:850}.priorityBadge svg{width:13px}.repeatInfo{margin-top:12px;padding:10px 12px;border-radius:12px;background:#f4f4ff;color:#6668a4;font-size:11px;line-height:1.5}.reviewQuestion .sourcePhrase{display:block;margin-top:12px;padding:13px 15px;border-radius:13px;background:#f5f5fa;color:#7b5560;font-size:16px;font-weight:800;line-height:1.5}.reviewMetaLeft{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    `}</style>
    <header className="pageHeader"><div><div className="eyebrow">SMART REVIEW</div><h2>弱点の自動復習</h2></div><div className="dueBadge"><ReviewIcon/>{remaining}件</div></header>
    {weakCount>0&&<div className="weakSummary"><SparkIcon/><span><b>{weakCount}件</b>は再発・苦戦データをもとに優先出題中</span></div>}
    <div className="reviewProgress"><i style={{width:`${Math.round((index/items.length)*100)}%`}}/></div>
    <section className="reviewCard card">
      <div className="reviewMeta"><div className="reviewMetaLeft"><span>{categoryName[item.category]||item.category}</span>{important&&<span className="priorityBadge"><SparkIcon/>重点復習</span>}</div><span>{index+1} / {items.length}</span></div>
      <div className="reviewQuestion">
        <small>{useCorrectionChallenge?"より自然な英語に直して言ってみよう":"英語で言ってみよう"}</small>
        {useCorrectionChallenge?<><span className="sourcePhrase">{item.original_text}</span><p style={{color:"#9294a5",fontSize:11,marginTop:10}}>会話で使った表現を、より自然な形に直して声に出そう。</p></>:<h3>{item.prompt_ja}</h3>}
        {repeated&&<div className="repeatInfo">この弱点は会話で <b>{item.occurrences}回</b> 検出されています。定着するまで優先度を自動調整します。</div>}
      </div>
      {!revealed ? <button className="primaryButton full" onClick={()=>setRevealed(true)}>答えを見る</button> : <div className="answerArea">
        <div className="answerEnglish"><strong>{item.answer_en}</strong><button onClick={()=>speak(item.answer_en)}><VolumeIcon/></button></div>
        {item.original_text && item.original_text !== item.corrected_text && <div className="correctionCompare"><div><small>会話で言った表現</small><span>{item.original_text}</span></div><div><small>より自然</small><span>{item.corrected_text}</span></div></div>}
        <p className="explanation">{item.explanation_ja}</p>
        <div className="gradePrompt">どれくらい思い出せた？</div>
        <div className="gradeGrid"><button disabled={grading} onClick={()=>grade(0)}><b>もう一度</b><span>10分後</span></button><button disabled={grading} onClick={()=>grade(1)}><b>難しい</b><span>優先度↑</span></button><button disabled={grading} onClick={()=>grade(2)}><b>できた</b><span>標準</span></button><button disabled={grading} onClick={()=>grade(3)}><b>簡単</b><span>優先度↓</span></button></div>
      </div>}
    </section>
    <p className="reviewHint">会話での再発回数と復習結果を合わせて、次の出題順・復習日を自動調整します。</p>
  </div>;
}
