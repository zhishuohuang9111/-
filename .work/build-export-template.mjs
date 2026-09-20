import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const cols=JSON.parse(await fs.readFile('windows-package/source/export-columns.json','utf8'));
const wb=Workbook.create();
for(let i=0;i<cols.length;i++){
 const sh=wb.worksheets.add(['送样记录','归还明细'][i]);sh.showGridLines=false;
 const last=col(cols[i].length-1);
 sh.getRange(`A1:${last}5`).format.font={name:'Microsoft YaHei',size:11,color:'#223047'};
 sh.getRange(`A1:${last}1`).format.fill='#16324F';sh.getRange(`A1:${last}1`).format.font={bold:true,color:'#FFFFFF',size:16};
 sh.getRange('A1').values=[['RDIMM · '+sh.name]];sh.getRange('A2').values=[['导出时间（北京时间）']];
 sh.getRange(`A4:${last}4`).values=[cols[i].map(c=>c[1])];sh.getRange(`A4:${last}4`).format.fill='#DDEAF4';sh.getRange(`A4:${last}4`).format.font.bold=true;
 sh.getRange(`A1:${last}5`).format.columnWidth=20;sh.getRange(`A1:${last}5`).format.rowHeight=28;
 sh.getRange(`A4:${last}5`).format.wrapText=true;
 for(let j=0;j<cols[i].length;j++){const cell=sh.getRange(`${col(j)}5`);cell.values=[[cols[i][j][2]==='n'?0:cols[i][j][2]==='d'?new Date('2026-09-17T00:00:00Z'):'示例']];cell.setNumberFormat(cols[i][j][2]==='d'?'yyyy-mm-dd':cols[i][j][2]==='n'?'0':'@');}
 sh.freezePanes.freezeRows(4);
}
function col(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
wb.recalculate();console.log((await wb.inspect({kind:'sheet',include:'id,name',maxChars:1500})).ndjson);
await (await SpreadsheetFile.exportXlsx(wb)).save('.work/export-template.xlsx');
await fs.writeFile('windows-package/source/export-template.json',JSON.stringify((await fs.readFile('.work/export-template.xlsx')).toString('base64')));
const preview=await wb.render({sheetName:'归还明细',range:'A1:I5',scale:1,format:'png'});await fs.writeFile('.work/export-preview.png',new Uint8Array(await preview.arrayBuffer()));
