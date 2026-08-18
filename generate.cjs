const fs=require("fs");
const path=require("path");
const zlib=require("zlib");
const parts=fs.readdirSync(".").filter(x=>/^payload_\d+\.txt$/.test(x)).sort().map(x=>fs.readFileSync(x,"utf8")).join("");
const files=JSON.parse(zlib.brotliDecompressSync(Buffer.from(parts,"base64")).toString("utf8"));
const overrides=new Set([
  "components/SpeakPanel.tsx",
  "components/Dashboard.tsx",
  "components/HistoryPanel.tsx",
  "public/sw.js",
  "app/api/conversations/start/route.ts",
  "app/api/conversations/finish/route.ts",
]);
for(const [name,entry] of Object.entries(files)){
  if(name==="lib/freeAnalysis.ts") continue;
  if(overrides.has(name)&&fs.existsSync(name)) continue;
  fs.mkdirSync(path.dirname(name),{recursive:true});
  if(entry && typeof entry==="object" && entry.encoding==="base64") fs.writeFileSync(name,Buffer.from(entry.data,"base64"));
  else if(entry && typeof entry==="object") fs.writeFileSync(name,entry.data,"utf8");
  else fs.writeFileSync(name,String(entry),"utf8");
}
if(fs.existsSync("lib/freeAnalysis.ts")) fs.unlinkSync("lib/freeAnalysis.ts");
console.log(`Generated EigoLoop source with ${overrides.size} direct overrides; legacy free mode removed`);
