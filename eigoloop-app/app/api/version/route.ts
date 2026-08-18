import { NextResponse } from "next/server";
export async function GET(){
  return NextResponse.json({
    build:"2026-08-18-learning-loop-v4",
    freeMode:false,
    shadowing:true,
    progressDashboard:true,
    smartWeaknessReview:true,
    dailyGoal:true,
    reminders:true,
    conversationTuning:true
  });
}
