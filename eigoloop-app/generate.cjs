const fs=require("fs");
const path=require("path");
const zlib=require("zlib");
const parts=fs.readdirSync(".").filter(x=>/^payload_\d+\.txt$/.test(x)).sort().map(x=>fs.readFileSync(x,"utf8")).join("");
const files=JSON.parse(zlib.brotliDecompressSync(Buffer.from(parts,"base64")).toString("utf8"));
const directOverrides=new Set([
  "components/SpeakPanel.tsx",
  "components/Dashboard.tsx",
  "components/HistoryPanel.tsx",
  "components/PwaRegister.tsx",
  "public/sw.js",
  "app/api/version/route.ts",
  "app/api/conversations/start/route.ts",
  "app/api/conversations/finish/route.ts",
]);
for(const [name,entry] of Object.entries(files)){
  if(name==="lib/freeAnalysis.ts") continue;
  if(directOverrides.has(name)&&fs.existsSync(name)) continue;
  fs.mkdirSync(path.dirname(name),{recursive:true});
  if(entry && typeof entry==="object" && entry.encoding==="base64") fs.writeFileSync(name,Buffer.from(entry.data,"base64"));
  else if(entry && typeof entry==="object") fs.writeFileSync(name,entry.data,"utf8");
  else fs.writeFileSync(name,String(entry),"utf8");
}
let applied=0;
if(fs.existsSync("override_bundle.txt")){
  const bundle=JSON.parse(zlib.brotliDecompressSync(Buffer.from(fs.readFileSync("override_bundle.txt","utf8"),"base64")).toString("utf8"));
  for(const [name,text] of Object.entries(bundle)){
    fs.mkdirSync(path.dirname(name),{recursive:true});
    fs.writeFileSync(name,String(text),"utf8");
    applied++;
  }
}
if(fs.existsSync("lib/freeAnalysis.ts")) fs.unlinkSync("lib/freeAnalysis.ts");
console.log(`Generated EigoLoop source; applied ${applied} learning-loop overrides; legacy free mode removed`);
