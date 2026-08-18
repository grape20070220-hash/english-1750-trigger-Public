"use client";
import { useEffect, useState } from "react";
import { CopyIcon, MicIcon, ReviewIcon, SparkIcon } from "@/components/icons";

export type MeData = {
  account: { id: string; sync_id: string; display_name: string; level: string; preferred_voice: string };
  stats: { due: number; conversations: number };
  latest: { scenario_title: string; ended_at: string; analysis: any } | null;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function Dashboard({ me, goSpeak, goReview, onLogout }: { me: MeData; goSpeak: () => void; goReview: () => void; onLogout: () => void }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setInstalled(Boolean(standalone));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
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
  const score = me.latest?.analysis?.scores;
  const avg = score ? ((score.fluency + score.grammar + score.vocabulary + score.naturalness) / 4).toFixed(1) : null;
  async function copyId() { await navigator.clipboard?.writeText(me.account.sync_id); }
  return <div className="page contentPage">
    <header className="pageHeader"><div><div className="eyebrow">TODAY&apos;S PRACTICE</div><h2>{me.account.display_name}さん、英語を話そう。</h2></div><div className="avatar">{(me.account.display_name || "E").slice(0,1).toUpperCase()}</div></header>

    <section className="heroCard">
      <div className="heroCardText"><div className="smallBadge"><SparkIcon/> REALTIME AI CONVERSATION</div><h3>考える前に、<br/>まず口から出してみる。</h3><p>OpenAI Realtimeで自然な英会話を練習。会話後はAIが添削し、弱点を自動で復習に追加します。</p><button className="primaryButton" onClick={goSpeak}><MicIcon/> 会話を始める</button></div>
      <div className="orbWrap" aria-hidden="true"><div className="orb orb1"/><div className="orb orb2"/><div className="soundBars">{[1,2,3,4,5,6,7,8,9].map(i => <i key={i}/>)}</div></div>
    </section>

    <div className="metricGrid">
      <button className="metricCard card clickable" onClick={goReview}><span className="metricIcon"><ReviewIcon/></span><div><small>今日の復習</small><strong>{me.stats.due}<em> 件</em></strong></div><span className="metricHint">弱点を定着</span></button>
      <div className="metricCard card"><span className="metricIcon alt"><MicIcon/></span><div><small>累計会話</small><strong>{me.stats.conversations}<em> 回</em></strong></div><span className="metricHint">クラウド保存</span></div>
      <div className="metricCard card"><span className="metricIcon warm"><SparkIcon/></span><div><small>最新スコア</small><strong>{avg ?? "—"}<em>{avg ? " / 5" : ""}</em></strong></div><span className="metricHint">4項目平均</span></div>
    </div>

    {me.latest && <section className="card latestCard"><div><div className="sectionLabel">前回の会話</div><h3>{me.latest.scenario_title}</h3><p>{me.latest.analysis?.summary_ja || "会話履歴が保存されています。"}</p></div>{score && <div className="miniScores">{Object.entries(score).map(([k,v]) => <div key={k}><span>{({fluency:"流暢さ",grammar:"文法",vocabulary:"語彙",naturalness:"自然さ"} as any)[k]}</span><b>{String(v)}</b></div>)}</div>}</section>}

    {!installed && <section className="card installCard"><div><div className="sectionLabel">ホーム画面から起動</div><h3>EigoLoopをアプリとして使う</h3><p>インストールすると、Chromeのタブやアドレスバーなしで、英単語テストと同じようにホーム画面から起動できます。</p></div>{installPrompt ? <button className="primaryButton installButton" onClick={installApp}>アプリをインストール</button> : <div className="installHint">Chromeのメニュー →「ホーム画面に追加」または「アプリをインストール」</div>}</section>}

    <section className="card syncCard"><div><div className="sectionLabel">スマホ・PC同期</div><h3>あなたの同期ID</h3><p>別の端末で「別端末からログイン」を選び、このIDと登録したPINを入力してください。</p></div><div className="syncCode"><code>{me.account.sync_id}</code><button onClick={copyId} title="コピー"><CopyIcon/></button></div></section>
    <button className="textButton danger" onClick={onLogout}>ログアウト</button>
  </div>;
}
