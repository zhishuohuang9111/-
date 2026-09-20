import path from 'node:path';
export const maxReportSize=20*1024*1024;
const types={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.txt':'text/plain'};
export function problem(message,status=400){return Object.assign(new Error(message),{status})}
export async function parseReport(file){
 if(!file||typeof file==='string'||file.size===0)return null;
 if(file.size>maxReportSize)throw problem('测试报告不能超过 20 MB');
 const name=path.basename(file.name.replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,180);
 const ext=path.extname(name).toLowerCase();if(!types[ext])throw problem('支持 PDF、PNG、JPG、Word、Excel 和 TXT 文件');
 const data=Buffer.from(await file.arrayBuffer());
 const inline=ext==='.pdf'&&data.subarray(0,5).toString()==='%PDF-'||ext==='.png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||['.jpg','.jpeg'].includes(ext)&&data[0]===255&&data[1]===216&&data[2]===255;
 return {name,data,mime:types[ext],inline:!!inline};
}
