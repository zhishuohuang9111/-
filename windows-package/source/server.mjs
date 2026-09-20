import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {GET,POST} from '../../rdimm-app/app/api/samples/route.ts';
import {parseReport,maxReportSize,problem} from './reports.mjs';
import {createInterface} from 'node:readline';
import {exportWorkbook} from './export.mjs';
import {root,close,deleteSample,resetSamples,snapshot,saveReturn,readReport} from './storage.mjs';
const identity=createHash('sha256').update(path.resolve(root)).digest('hex').slice(0,16);
const publicDir=path.resolve('public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
let stopping=false;
const server=http.createServer(async(req,res)=>{
 try{
  const port=server.address().port;
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403).end('Forbidden');return}
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'rdimm-windows',identity}));return}
  if(stopping){res.writeHead(503).end(JSON.stringify({error:'程序正在退出'}));return}
  if(url.pathname.startsWith('/api/reports/')){
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
   const report=readReport(decodeURIComponent(url.pathname.slice('/api/reports/'.length)));
   if(!report){res.writeHead(404).end('报告不存在或已删除');return}
   res.setHeader('Content-Type',report.mime);
   res.setHeader('Content-Disposition',`${report.inline?'inline':'attachment'}; filename="report"; filename*=UTF-8''${encodeURIComponent(report.name).replace(/'/g,'%27')}`);
   res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");
   res.setHeader('Content-Length',report.data.length);
   res.end(req.method==='HEAD'?undefined:Buffer.from(report.data));return;
  }
  if(url.pathname==='/api/returns'){
   res.setHeader('Content-Type','application/json; charset=utf-8');
   try{
    if(req.method!=='POST')throw problem('不支持的请求方式',405);
    if(req.headers.origin!==url.origin)throw problem('请求来源无效',403);
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxReportSize+65536)throw problem('测试报告不能超过 20 MB',413);chunks.push(chunk)}
    const form=await new Request(url,{method:'POST',headers:{'Content-Type':req.headers['content-type']||''},body:Buffer.concat(chunks)}).formData();
    const file=await parseReport(form.get('report_file'));
    const values=Object.fromEntries(form);delete values.report_file;
    if(!['return','report'].includes(values.action))throw problem('不支持的操作');
    res.end(JSON.stringify(saveReturn(values,file,values.action==='report')));
   }catch(e){console.error(e);res.writeHead(e.status||500).end(JSON.stringify({error:e.status?e.message:'保存失败，归还和报告均未保存，请重试'}))}
   return;
  }
  if(url.pathname==='/api/export'||url.pathname==='/api/shutdown'){
   res.setHeader('Content-Type','application/json; charset=utf-8');
   if(req.method!=='POST'){res.writeHead(405).end();return}
   if(req.headers.origin!==url.origin){res.writeHead(403).end(JSON.stringify({error:'请求来源无效'}));return}
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024){res.writeHead(413).end();return}chunks.push(chunk)}
   let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString())}catch{res.writeHead(400).end(JSON.stringify({error:'请求内容无效'}));return}
   const quitting=url.pathname==='/api/shutdown';
   if(quitting&&(payload.confirm!==true||typeof payload.export!=='boolean')){res.writeHead(400).end(JSON.stringify({error:'请先确认退出方式'}));return}
   try{
    const result=(!quitting||payload.export)?exportWorkbook(snapshot()):{ok:true};
    if(quitting){stopping=true;res.once('finish',stop)}
    res.end(JSON.stringify(result));
   }catch(e){console.error(e);res.writeHead(500).end(JSON.stringify({error:'Excel 导出失败，请检查 back_up 文件夹是否可写及磁盘空间。程序仍在运行，请重试。'}))}
   return;
  }
  if(url.pathname==='/api/samples'){
   let response;
   if(req.method==='GET')response=await GET();
   else if(req.method==='POST'){
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end('Request too large');return}chunks.push(chunk)}
    const body=Buffer.concat(chunks);let payload;
    try{payload=JSON.parse(body.toString('utf8'))}catch{res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:'请求内容无效'}));return}
    if(payload?.action==='reset'){
     if(req.headers.origin&&new URL(req.headers.origin).host!==url.host){response=Response.json({error:'请求来源无效'},{status:403})}
     else if(payload.confirm!==true||typeof payload.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.requestId)){response=Response.json({error:'请先确认删除全部数据'},{status:400})}
     else {try{response=Response.json(resetSamples(payload.requestId))}catch(e){console.error(e);response=Response.json({error:'备份或删除失败，台账未被删除。请检查 back_up 和 data 文件夹是否可写、磁盘空间是否充足后重试。'},{status:500})}}
    }else if(payload?.action==='delete'){
     if(req.headers.origin&&new URL(req.headers.origin).host!==url.host){response=Response.json({error:'请求来源无效'},{status:403})}
     else if(typeof payload.id!=='string'||!payload.id.trim()||payload.id.length>200||payload.confirm!==true){response=Response.json({error:'请先选择并确认要删除的记录'},{status:400})}
     else response=Response.json(deleteSample(payload.id));
    }else if(payload?.action==='return'){
     if(req.headers.origin&&new URL(req.headers.origin).host!==url.host)response=Response.json({error:'请求来源无效'},{status:403});
     else try{response=Response.json(saveReturn(payload))}catch(e){response=Response.json({error:e.message},{status:e.status||500})}
    }else response=await POST(new Request(url,{method:'POST',headers:req.headers,body}));
   }else{res.writeHead(405).end();return}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
  const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file=path.resolve(publicDir,name);
  if(!file.startsWith(publicDir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end('Not found');return}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'本地服务处理失败，请重试'}))}
});
function open(url){if(process.argv.includes('--open')&&process.platform==='win32'){const p=spawn('cmd.exe',['/d','/c','start','',url],{stdio:'ignore',windowsHide:true});p.on('error',()=>console.log('Please open the URL above in your browser.'))}}
const preferred=Number(process.env.RDIMM_PORT||18736);
server.on('error',async e=>{
 if(e.code==='EADDRINUSE'){
  try{const r=await fetch(`http://127.0.0.1:${preferred}/health`,{signal:AbortSignal.timeout(1500)});const data=await r.json();if(data.app==='rdimm-windows'&&data.identity===identity){open(`http://127.0.0.1:${preferred}/`);close();process.exit(0)}}catch{}
  server.listen(0,'127.0.0.1');
 }else{console.error(e);close();process.exit(1)}
});
server.listen(preferred,'127.0.0.1',()=>{
 const url=`http://127.0.0.1:${server.address().port}/`;
 console.log('\nRDIMM Sample Manager\n\n'+url+'\n\nKeep this window open while using the app.\nUse the Exit button in the webpage to back up and exit. Ctrl+C also prompts for backup.\n\nData: '+root+'\n');open(url);
});
function stop(){server.close(()=>{close();process.exit(0)});setTimeout(()=>process.exit(0),2000).unref()}
let prompting=false;
process.on('SIGINT',()=>{
 if(prompting||stopping)return;
 if(!process.stdin.isTTY){console.log('Backup before exit...');try{exportWorkbook(snapshot());stop()}catch(e){console.error(e)}return}
 prompting=true;
 const prompt=createInterface({input:process.stdin,output:process.stdout});
 prompt.question('Export ALL records to back_up before exit? [Y] export and exit / [N] exit / [C] cancel: ',answer=>{
  prompt.close();prompting=false;
  if(answer.trim().toLowerCase()==='n')stop();
  else if(answer.trim().toLowerCase()==='y'){try{console.log(exportWorkbook(snapshot()).path);stop()}catch(e){console.error('Export failed. App remains running.',e)}}
 });
});
process.on('SIGHUP',()=>{try{exportWorkbook(snapshot())}catch(e){console.error(e)}stop()});
process.on('SIGTERM',stop);
