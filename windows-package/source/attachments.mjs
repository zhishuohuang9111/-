import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
// One directory per return avoids collisions between customers with equal filenames.
export function saveAttachment(id,report){
 const key=createHash('sha256').update(String(id)).digest('hex').slice(0,20);
 const directory=path.join(process.cwd(),'Attachment',key);
 const original=String(report.name).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').slice(0,160)||'report';
 const name='报告_'+original;
 fs.mkdirSync(directory,{recursive:true});
 for(let index=0;;index++){
  const ext=path.extname(name),base=path.basename(name,ext);
  const file=path.join(directory,index?`${base}_${index}${ext}`:name);
  let fd;
  try{fd=fs.openSync(file,'wx')}catch(e){
   if(e.code!=='EEXIST')throw e;
   if(fs.lstatSync(file).isFile()&&fs.readFileSync(file).equals(Buffer.from(report.data)))return {file,created:false};
   continue;
  }
  try{fs.writeFileSync(fd,report.data);fs.fsyncSync(fd);fs.closeSync(fd);return {file,created:true}}
  catch(e){try{fs.closeSync(fd)}catch{}try{fs.unlinkSync(file)}catch{}throw e}
 }
}
export function discardAttachment(copy){if(copy?.created)try{fs.unlinkSync(copy.file)}catch{}}
