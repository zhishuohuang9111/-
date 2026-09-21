import {reserveArchive,archiveName} from './archives.mjs';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {saveAttachment,discardAttachment} from './attachments.mjs';
import {problem} from './reports.mjs';
import {exportWorkbook} from './export.mjs';
export const root=process.env.RDIMM_DATA_DIR||path.join(process.cwd(),'data');
fs.mkdirSync(root,{recursive:true});
const file=path.join(root,'rdimm.sqlite');
const existing=fs.existsSync(file);
const sql=new DatabaseSync(file);
sql.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
if(existing){
 const backupDir=path.join(root,'backups');fs.mkdirSync(backupDir,{recursive:true});
 const target=path.join(backupDir,`rdimm-${new Date().toISOString().slice(0,10)}.sqlite`);
 if(!fs.existsSync(target))sql.prepare('VACUUM INTO ?').run(target);
}
sql.exec(`CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY,data TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0));
CREATE TABLE IF NOT EXISTS returns(id TEXT PRIMARY KEY,sample_id TEXT NOT NULL REFERENCES samples(id),quantity INTEGER NOT NULL CHECK(quantity>0),returned_on TEXT NOT NULL,note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_returns_sample ON returns(sample_id);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
// Existing databases gain nullable report metadata; historic returns stay unrecorded.
const returnColumns=new Set(sql.prepare('PRAGMA table_info(returns)').all().map(c=>c.name));
for(const column of ['report_provided','report_name'])if(!returnColumns.has(column))sql.exec(`ALTER TABLE returns ADD COLUMN ${column} TEXT`);
sql.exec(`CREATE TABLE IF NOT EXISTS report_files(return_id TEXT PRIMARY KEY REFERENCES returns(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,inline INTEGER NOT NULL,data BLOB NOT NULL);`);
if(!sql.prepare("SELECT 1 FROM settings WHERE key='initialized'").get()){
 const snapshot=JSON.parse(fs.readFileSync(path.join(process.cwd(),'initial-data.json'),'utf8'));
 sql.exec('BEGIN IMMEDIATE');
 try{
  for(const r of snapshot.rows)sql.prepare('INSERT INTO samples(id,data,quantity) VALUES(?,?,?)').run(r.id,JSON.stringify(r),r.quantity);
  for(const r of snapshot.returns)sql.prepare('INSERT INTO returns(id,sample_id,quantity,returned_on,note) VALUES(?,?,?,?,?)').run(r.id,r.sample_id,r.quantity,r.returned_on,r.note||'');
  sql.prepare("INSERT INTO settings VALUES('initialized','1')").run();sql.exec('COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e}
}
export function database(){return {prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}},all(){return {results:stmt.all(...args)}},first(){return stmt.get(...args)||null}}},all(){return {results:sql.prepare(query).all()}}}}}}
export async function ensureSeed(){}
export function deleteSample(id){
 sql.exec('BEGIN IMMEDIATE');
 try{
  sql.prepare('DELETE FROM returns WHERE sample_id=?').run(id);
  const result=sql.prepare('DELETE FROM samples WHERE id=?').run(id);
  sql.exec('COMMIT');
  return {ok:true,id,deleted:Number(result.changes)>0};
 }catch(e){sql.exec('ROLLBACK');throw e}
}
export function close(){sql.close()}
export function resetSamples(requestId,customName){
 const key='reset:'+requestId;
 const prior=sql.prepare('SELECT value FROM settings WHERE key=?').get(key);
 if(prior)return JSON.parse(prior.value);
 archiveName(customName);
 const backupDir=path.join(root,'backups');fs.mkdirSync(backupDir,{recursive:true});
 const backupName='before-reset-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.sqlite';
 // Backup must succeed before any business data is removed.
 sql.prepare('VACUUM INTO ?').run(path.join(backupDir,backupName));
 const excelBackup=exportWorkbook(snapshot());
 const archive=reserveArchive(customName);
 try{sql.prepare('VACUUM INTO ?').run(archive.file)}catch(e){try{fs.unlinkSync(archive.file)}catch{}throw e}
 sql.exec('BEGIN IMMEDIATE');
 try{
  const returnsRemoved=Number(sql.prepare('DELETE FROM returns').run().changes);
  const samplesRemoved=Number(sql.prepare('DELETE FROM samples').run().changes);
  const result={ok:true,backup:'data/backups/'+backupName,excelBackup:excelBackup.path,archive:'data/finished_order/'+archive.filename,samplesRemoved,returnsRemoved};
  sql.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('initialized','1')").run();
  sql.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key,JSON.stringify(result));
  sql.exec('COMMIT');return result;
 }catch(e){sql.exec('ROLLBACK');throw e}
}
export function snapshot(){
 const rows=sql.prepare('SELECT s.*,COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.sample_id=s.id),0) returned FROM samples s ORDER BY s.id').all().map(r=>({...JSON.parse(r.data),id:r.id,quantity:r.quantity,returned:r.returned}));
 return {rows,returns:sql.prepare('SELECT * FROM returns ORDER BY returned_on DESC,id').all()};
}

export function saveReturn(b,file=null,reportOnly=false){
 let attachment;
 const provided=b.report_provided??null;
 if(![null,'yes','no'].includes(provided)||file&&provided!=='yes')throw problem('请选择客户是否提供测试报告；上传附件须选择已提供');
 sql.exec('BEGIN IMMEDIATE');
 try{
  const existing=sql.prepare('SELECT * FROM returns WHERE id=?').get(String(b.requestId||''));
  if(reportOnly){
   if(!existing)throw problem('未找到归还记录',404);
   if(!file)throw problem('请选择需要上传的测试报告');
   if(sql.prepare('SELECT 1 FROM report_files WHERE return_id=?').get(existing.id))throw problem('该次归还已上传报告，请勿重复上传',409);
   sql.prepare('UPDATE returns SET report_provided=?,report_name=? WHERE id=?').run('yes',file.name,existing.id);
  }else{
   if(existing)throw problem('这次归还已保存，请刷新后查看',409);
   const sample=sql.prepare('SELECT * FROM samples WHERE id=?').get(String(b.id||''));if(!sample)throw problem('未找到送样记录',404);
   const row=JSON.parse(sample.data),q=Number(b.quantity),d=b.returned_on;
   const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
   if(!row.sent)throw problem('尚未送出，不能登记归还');
   if(!Number.isInteger(q)||q<1||q>1000000||typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d||d<row.sent.slice(0,10)||d>today)throw problem('请填写有效的归还数量和日期，日期须在送出日至今天之间');
   if(!/^[a-f0-9-]{36}$/i.test(b.requestId||''))throw problem('请求标识无效，请重试');
   const returned=sql.prepare('SELECT COALESCE(SUM(quantity),0) n FROM returns WHERE sample_id=?').get(sample.id).n;
   if(q>sample.quantity-returned)throw problem('归还数量超过剩余数量，请刷新后重试',409);
   sql.prepare('INSERT INTO returns(id,sample_id,quantity,returned_on,note,report_provided,report_name) VALUES(?,?,?,?,?,?,?)').run(b.requestId,sample.id,q,d,String(b.note||'').trim().slice(0,2000),provided,file?.name||null);
  }
  if(file)sql.prepare('INSERT INTO report_files(return_id,name,mime,inline,data) VALUES(?,?,?,?,?)').run(b.requestId,file.name,file.mime,file.inline?1:0,file.data);
  if(file){try{attachment=saveAttachment(b.requestId,file)}catch{throw problem('Attachment 文件夹保存失败，归还和报告均未保存。请检查文件夹权限或磁盘空间后重试。',500)}}
  sql.exec('COMMIT');return {ok:true};
 }catch(e){sql.exec('ROLLBACK');discardAttachment(attachment);throw e}
}
export function readReport(id){return sql.prepare('SELECT * FROM report_files WHERE return_id=?').get(id)}

// Backfill reports uploaded before the Attachment directory was introduced.
// Failure must not prevent access to existing records and database-held reports.
for(const row of sql.prepare('SELECT return_id FROM report_files').all()){
 try{saveAttachment(row.return_id,readReport(row.return_id))}
 catch(e){console.error('Attachment 历史报告副本保存失败，下次启动将重试：',row.return_id,e.message)}
}
