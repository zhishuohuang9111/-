import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {problem} from './reports.mjs';
export const archiveDir=path.join(process.env.RDIMM_DATA_DIR||path.join(process.cwd(),'data'),'finished_order');
export function archiveName(value){
 const fallback='归档_'+new Date(Date.now()+8*3600000).toISOString().slice(0,16).replace('T','_').replace(':','-');
 const name=String(value||fallback).trim().replace(/\.(sqlite|db)$/i,'');
 if(!name||name.length>100||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw problem('归档名称不能包含路径、特殊字符或 Windows 保留名称，最多 100 个字符');
 return name+'.sqlite';
}
export function reserveArchive(value){
 fs.mkdirSync(archiveDir,{recursive:true});const name=archiveName(value),base=name.slice(0,-7);
 for(let i=0;;i++){
  const filename=i?`${base}_${i}.sqlite`:name;
  try{const fd=fs.openSync(path.join(archiveDir,filename),'wx');fs.closeSync(fd);return {filename,file:path.join(archiveDir,filename)}}catch(e){if(e.code!=='EEXIST')throw e}
 }
}
function resolved(name){
 if(typeof name!=='string'||path.basename(name)!==name||!name.endsWith('.sqlite'))throw problem('归档名称无效');
 const file=path.join(archiveDir,name);
 if(!fs.existsSync(file)||!fs.lstatSync(file).isFile())throw problem('未找到数据库归档',404);
 return file;
}
export function listArchives(){
 if(!fs.existsSync(archiveDir))return [];
 return fs.readdirSync(archiveDir).filter(n=>n.endsWith('.sqlite')&&fs.lstatSync(path.join(archiveDir,n)).isFile()).map(name=>{const s=fs.statSync(path.join(archiveDir,name));return {name,size:s.size,modified:s.mtime.toISOString()}}).sort((a,b)=>b.modified.localeCompare(a.modified));
}
function inspect(file,reportId){
 const db=new DatabaseSync(file,{readOnly:true,allowExtension:false});
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
  for(const name of ['samples','returns'])if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name))throw problem('不是兼容的 RDIMM 数据库');
  if(reportId!==undefined){
   if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='report_files'").get())return null;
   return db.prepare('SELECT name,mime,inline,data FROM report_files WHERE return_id=?').get(reportId);
  }
  const rows=db.prepare('SELECT id,data,quantity FROM samples ORDER BY id').all().map(r=>{
   const data=JSON.parse(r.data);
   if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isInteger(r.quantity)||r.quantity<1)throw problem('数据库中的送样记录格式无效');
   const row={id:String(r.id),quantity:r.quantity,returned:0};
   for(const [k,v] of Object.entries(data))if(!['id','quantity','returned','__proto__','constructor','prototype'].includes(k))row[k]=v==null?null:String(v);
   return row;
  });
  const columns=new Set(db.prepare('PRAGMA table_info(returns)').all().map(c=>c.name));
  const returns=db.prepare(`SELECT id,sample_id,quantity,returned_on,note,${columns.has('report_provided')?'report_provided':'NULL AS report_provided'},${columns.has('report_name')?'report_name':'NULL AS report_name'} FROM returns ORDER BY returned_on DESC,id`).all();
  const byId=new Map(rows.map(r=>[r.id,r]));
  for(const r of returns){if(!byId.has(r.sample_id)||!Number.isInteger(r.quantity)||r.quantity<1)throw problem('数据库中的归还明细格式无效');byId.get(r.sample_id).returned+=r.quantity;}
  return {rows,returns};
 }finally{db.close()}
}
export function viewArchive(name){return inspect(resolved(name))}
export function archiveReport(name,id){return inspect(resolved(name),id)}
export async function uploadArchive(req,name){
 fs.mkdirSync(archiveDir,{recursive:true});const temp=path.join(archiveDir,'.upload-'+randomUUID());let fd,allocated;
 try{
  archiveName(name);fd=fs.openSync(temp,'wx');let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>512*1024*1024)throw problem('数据库上传上限为 512 MB',413);fs.writeFileSync(fd,chunk)}
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  const check=fs.openSync(temp,'r');const signature=Buffer.alloc(16);fs.readSync(check,signature,0,16,0);fs.closeSync(check);
  if(signature.toString()!=='SQLite format 3\0')throw problem('请选择完整的 SQLite 数据库文件（.sqlite 或 .db）');
  const verify=new DatabaseSync(temp,{readOnly:true,allowExtension:false});
  try{verify.exec('PRAGMA trusted_schema=OFF');if(verify.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw problem('数据库完整性检查失败')}finally{verify.close()}
  inspect(temp);allocated=reserveArchive(name);fs.copyFileSync(temp,allocated.file);return {ok:true,name:allocated.filename};
 }catch(e){if(allocated)try{fs.unlinkSync(allocated.file)}catch{};if(e.status)throw e;throw problem('数据库无法保存或读取，请检查文件夹权限、磁盘空间，并选择完整且兼容的 RDIMM 数据库')}
 finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp)}catch{}}
}
