const fs=require("fs");
const path=require("path");
const zlib=require("zlib");
const parts=fs.readdirSync(".").filter(x=>/^payload_\d+\.txt$/.test(x)).sort().map(x=>fs.readFileSync(x,"utf8")).join("");
const files=JSON.parse(zlib.brotliDecompressSync(Buffer.from(parts,"base64")).toString("utf8"));
const directOverrides=new Set([
  "package.json",
  "vercel.json",
  "components/AppShell.tsx",
  "components/Dashboard.tsx",
  "components/HistoryPanel.tsx",
  "components/PwaRegister.tsx",
  "components/ReviewPanel.tsx",
  "components/SpeakPanel.tsx",
  "lib/auth.ts",
  "lib/webPush.ts",
  "lib/learning.ts",
  "db/schema.sql",
  "public/sw.js",
  "app/api/me/route.ts",
  "app/api/realtime/connect/route.ts",
  "app/api/review/route.ts",
  "app/api/review/grade/route.ts",
  "app/api/version/route.ts",
  "app/api/conversations/start/route.ts",
  "app/api/conversations/finish/route.ts",
  "app/api/push/public-key/route.ts",
  "app/api/push/subscription/route.ts",
  "app/api/push/test/route.ts",
  "app/api/push/cron/[hour]/route.ts",
  "app/api/mission/route.ts",
  "app/api/coach/weekly/route.ts",
]);
for(const [name,entry] of Object.entries(files)){
  if(name==="lib/freeAnalysis.ts") continue;
  if(directOverrides.has(name)&&fs.existsSync(name)) continue;
  fs.mkdirSync(path.dirname(name),{recursive:true});
  if(entry && typeof entry==="object" && entry.encoding==="base64") fs.writeFileSync(name,Buffer.from(entry.data,"base64"));
  else if(entry && typeof entry==="object") fs.writeFileSync(name,entry.data,"utf8");
  else fs.writeFileSync(name,String(entry),"utf8");
}
if(fs.existsSync("lib/freeAnalysis.ts")) fs.unlinkSync("lib/freeAnalysis.ts");
console.log(`Generated EigoLoop source with ${directOverrides.size} protected overrides; learning coach suite enabled`);