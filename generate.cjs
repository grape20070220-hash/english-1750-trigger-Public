const fs=require("fs");
const path=require("path");
const zlib=require("zlib");
const parts=fs.readdirSync(".").filter(x=>/^payload_\d+\.txt$/.test(x)).sort().map(x=>fs.readFileSync(x,"utf8")).join("");
const files=JSON.parse(zlib.brotliDecompressSync(Buffer.from(parts,"base64")).toString("utf8"));
for(const [name,entry] of Object.entries(files)){
  fs.mkdirSync(path.dirname(name),{recursive:true});
  if(entry && typeof entry==="object" && entry.encoding==="base64") fs.writeFileSync(name,Buffer.from(entry.data,"base64"));
  else if(entry && typeof entry==="object") fs.writeFileSync(name,entry.data,"utf8");
  else fs.writeFileSync(name,String(entry),"utf8");
}
console.log(`Generated ${Object.keys(files).length} EigoLoop source files`);
