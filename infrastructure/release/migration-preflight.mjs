import {Client} from "pg";
import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import process from "node:process";
import console from "node:console";
const db=new Client({connectionString:process.env.DATABASE_URL});
const dir="prisma/migrations", hash=s=>createHash("sha256").update(s).digest("hex");
await db.connect();
try {
  const migrations=await readdir(dir,{withFileTypes:true}), files=new Map();
  for(const f of migrations.filter(f=>f.isDirectory()))files.set(f.name,await readFile(dir+"/"+f.name+"/migration.sql","utf8"));
  const exists=(await db.query("SELECT to_regclass('public._prisma_migrations') AS name")).rows[0].name;
  const applied=exists?(await db.query("SELECT migration_name,checksum,finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL")).rows:[];
  for(const row of applied){
    const sql=files.get(row.migration_name);
    if(!sql || !row.finished_at || ![sql,sql.replaceAll("\r\n","\n"),sql.replace(/\r?\n/g,"\r\n")].some(v=>hash(v)===row.checksum))throw Error("Migration history mismatch or incomplete migration");
  }
  const pending=[...files.keys()].filter(k=>!applied.some(a=>a.migration_name===k)).sort();
  const risky=pending.filter(k=>/\b(?:DROP\s+(?:TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\w+\s+TYPE)\b/i.test(files.get(k)));
  if(applied.length && risky.length && !process.env.MIGRATION_SNAPSHOT_ID)throw Error("Risky migration requires reviewed snapshot and approval");
  console.log(JSON.stringify({applied:applied.length,pending,risky}));
}finally{await db.end();}
