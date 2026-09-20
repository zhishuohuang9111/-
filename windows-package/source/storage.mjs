import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
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
export function resetSamples(requestId){
 const key='reset:'+requestId;
 const prior=sql.prepare('SELECT value FROM settings WHERE key=?').get(key);
 if(prior)return JSON.parse(prior.value);
 const backupDir=path.join(root,'backups');fs.mkdirSync(backupDir,{recursive:true});
 const backupName='before-reset-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.sqlite';
 // Backup must succeed before any business data is removed.
 sql.prepare('VACUUM INTO ?').run(path.join(backupDir,backupName));
 sql.exec('BEGIN IMMEDIATE');
 try{
  const returnsRemoved=Number(sql.prepare('DELETE FROM returns').run().changes);
  const samplesRemoved=Number(sql.prepare('DELETE FROM samples').run().changes);
  const result={ok:true,backup:'data/backups/'+backupName,samplesRemoved,returnsRemoved};
  sql.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('initialized','1')").run();
  sql.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key,JSON.stringify(result));
  sql.exec('COMMIT');return result;
 }catch(e){sql.exec('ROLLBACK');throw e}
}
export function snapshot(){
 const rows=sql.prepare('SELECT s.*,COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.sample_id=s.id),0) returned FROM samples s ORDER BY s.id').all().map(r=>({...JSON.parse(r.data),id:r.id,quantity:r.quantity,returned:r.returned}));
 return {rows,returns:sql.prepare('SELECT * FROM returns ORDER BY returned_on DESC,id').all()};
}
