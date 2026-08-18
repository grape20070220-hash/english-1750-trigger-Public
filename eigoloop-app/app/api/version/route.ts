import { NextResponse } from "next/server";
export async function GET(){
  return NextResponse.json({
    build:"2026-08-19-billing-return-v9",
    freeMode:false,
    shadowing:true,
    progressDashboard:true,
    smartWeaknessReview:true,
    dailyGoal:true,
    reminders:true,
    conversationTuning:true,
    pronunciation:true,
    fiveMinuteDrill:true,
    dailyMission:true,
    speakingMetrics:true,
    weeklyCoach:true,
    apiBudget:true,
    billingReturnPrompt:true
  });
}
