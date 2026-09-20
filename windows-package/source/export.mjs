import fs from 'node:fs';
import path from 'node:path';
import {zipSync,unzipSync,strFromU8,strToU8} from 'fflate';
import template from './export-template.json' with {type:'json'};
import columns from './export-columns.json' with {type:'json'};
const xml=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
export function exportWorkbook(snapshot,now=new Date(),directory=path.join(process.cwd(),'back_up')){
 const stamp=new Date(now.getTime()+8*3600000).toISOString().slice(0,16);
 const day=stamp.slice(0,10);
 const state=r=>{if(!r.sent)return '待送样';if(r.returned>=r.quantity)return '已归还';if(!r.due)return '待约定日期';const d=(Date.parse(r.due.slice(0,10))-Date.parse(day))/86400000;return d<0?'已逾期':d===0?'今日到期':d<=7?'即将到期':r.returned?'部分归还':'借出中'};
 const byId=new Map(snapshot.rows.map(r=>[r.id,r]));
 const data=[snapshot.rows.map(r=>({...r,sentQuantity:r.sent?r.quantity:0,remaining:r.sent?r.quantity-r.returned:0,status:state(r)})),snapshot.returns.map(r=>({...byId.get(r.sample_id),...r,report_status:r.report_provided==='yes'?'已提供':r.report_provided==='no'?'未提供':'未登记'}))];
 const files=unzipSync(Buffer.from(template,'base64'));
 for(let i=0;i<2;i++){
  if(data[i].length>1048572)throw Error('记录数量超过 Excel 单表上限');
  const file=`xl/worksheets/sheet${i+1}.xml`;let sheet=strFromU8(files[file]);
  const proto=sheet.match(/<x:row r="5"[^>]*>.*?<\/x:row>/s)[0];
  const styles=columns[i].map((_,j)=>proto.match(new RegExp(`<x:c r="${col(j)}5" s="(\\d+)"`))[1]);
  const rows=data[i].map((r,index)=>`<x:row r="${index+5}">${columns[i].map(([key,,type],j)=>{
   const value=r[key],ref=col(j)+(index+5),style=styles[j];if(value==null||value==='')return `<x:c r="${ref}" s="${style}"/>`;
   if(type==='n'&&Number.isFinite(Number(value)))return `<x:c r="${ref}" s="${style}" t="n"><x:v>${Number(value)}</x:v></x:c>`;
   if(type==='d'&&/^\d{4}-\d{2}-\d{2}/.test(String(value))&&Number.isFinite(Date.parse(String(value).slice(0,10))))return `<x:c r="${ref}" s="${style}" t="n"><x:v>${Date.parse(String(value).slice(0,10))/86400000+25569}</x:v></x:c>`;
   return `<x:c r="${ref}" s="${style}" t="inlineStr"><x:is><x:t xml:space="preserve">${xml(value)}</x:t></x:is></x:c>`;
  }).join('')}</x:row>`).join('');
  sheet=sheet.replace(proto,rows).replace(/<x:c r="B2"[^>]*\/>/,`<x:c r="B2" s="1" t="inlineStr"><x:is><x:t>${stamp.replace('T',' ')}</x:t></x:is></x:c>`);
  sheet=sheet.replace('</x:sheetData>',`</x:sheetData><x:autoFilter ref="A4:${col(columns[i].length-1)}${Math.max(4,data[i].length+4)}"/>`);
  files[file]=strToU8(sheet);
 }
 const bytes=zipSync(files,{level:6});fs.mkdirSync(directory,{recursive:true});
 const base=stamp.replace('T','_').replace(':','-');
 for(let index=0;;index++){
  const filename=base+(index?'_'+String(index).padStart(2,'0'):'')+'.xlsx';const target=path.join(directory,filename);let fd;
  try{fd=fs.openSync(target,'wx')}catch(e){if(e.code==='EEXIST')continue;throw e}
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd)}catch(e){try{fs.closeSync(fd)}catch{}try{fs.unlinkSync(target)}catch{}throw e}
  return {ok:true,filename,path:'back_up/'+filename,samples:snapshot.rows.length,returns:snapshot.returns.length};
 }
}
