// Full generated-site browser audit. No publishing or production changes.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const ROOT = path.resolve('_site');
const OUT = path.resolve('site-audit');
const BASE = 'http://127.0.0.1:4173';
const DOMAIN = 'jeongmochoi.github.io';
const PUBLIC = new Set(['/', '/ko/', '/publications/', '/ko/publications/', '/books/', '/ko/books/', '/ko/books/alchemia/', '/media/', '/ko/media/', '/teaching/', '/ko/teaching/']);
const DEVICES = [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}];

function walk(dir, base=dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full,base):[path.relative(base,full).replace(/\\/g,'/')];
  });
}
function routeOf(file){return file==='index.html'?'/':file.endsWith('/index.html')?'/'+file.slice(0,-10):'/'+file;}
function target(value,route){
  if(!value || /^(data:|mailto:|javascript:|tel:|blob:|#)/i.test(value)) return null;
  try{
    const u=new URL(value,'https://'+DOMAIN+route);
    if(u.host!==DOMAIN) return null;
    const rel=decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if(rel.split('/').includes('..'))return null;
    const full=path.resolve(ROOT,rel);
    if(full!==ROOT&&!full.startsWith(ROOT+path.sep))return null;
    return {url:u.pathname,full};
  }catch{return null;}
}
function exists(t){return fs.existsSync(t.full)&&fs.statSync(t.full).isFile()||fs.existsSync(path.join(t.full,'index.html'))||fs.existsSync(t.full+'.html');}
async function run(){
  fs.mkdirSync(path.join(OUT,'screenshots'),{recursive:true});
  const all=walk(ROOT), html=all.filter(x=>x.endsWith('.html')).sort(), pdf=all.filter(x=>/\.pdf$/i.test(x));
  const browser=await chromium.launch({headless:true});
  const contexts={};for(const d of DEVICES)contexts[d.name]=await browser.newContext({viewport:{width:d.width,height:d.height},reducedMotion:'reduce'});
  const tasks=html.flatMap(file=>DEVICES.map(device=>({file,device,route:routeOf(file)})));
  const report=new Array(tasks.length);let cursor=0;
  async function worker(){
    while(cursor<tasks.length){
      const idx=cursor++, {file,device,route}=tasks[idx];
      const row={route,device:device.name,type:PUBLIC.has(route)?'public':'other',issues:[],images:0,localLinks:0,pdfLinks:0,screenshot:''};
      let page;
      try{
        page=await contexts[device.name].newPage();
        page.on('pageerror',e=>row.issues.push({type:'runtime',detail:String(e.message).slice(0,190)}));
        page.on('requestfailed',r=>{if(r.url().startsWith(BASE))row.issues.push({type:'network-local',detail:r.url()})});
        const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:25000});
        if(!response||!response.ok()){row.issues.push({type:'http',detail:String(response?.status()||'no response')});continue;}
        const dom=await page.evaluate(()=>{
          const root=document.documentElement,w=root.clientWidth;
          const attrs=[];
          for(const el of document.querySelectorAll('[href],[src],[srcset]')){
            for(const k of ['href','src']){const v=el.getAttribute(k);if(v)attrs.push({tag:el.tagName,k,value:v});}
            const set=el.getAttribute('srcset');if(set)for(const part of set.split(',')){let v=part.trim().split(/\s+/)[0];if(v)attrs.push({tag:el.tagName,k:'srcset',value:v});}
          }
          const offenders=[];
          if(root.scrollWidth-w>6){for(const el of document.querySelectorAll('body *')){
            const b=el.getBoundingClientRect(),s=getComputedStyle(el);
            if(b.right>w+6&&b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden'){
              offenders.push({tag:el.tagName,className:String(el.className).slice(0,45),right:Math.round(b.right)});
              if(offenders.length>=6)break;
            }
          }}
          return {attrs,offenders,overflow:root.scrollWidth-w,text:(document.querySelector('main')||document.body).innerText.trim().length,images:document.querySelectorAll('img').length,robots:document.querySelector('meta[name=robots]')?.content||'',height:root.scrollHeight};
        });
        row.images=dom.images;row.textLength=dom.text;row.overflowPx=Math.max(0,dom.overflow);row.robots=dom.robots;
        if(dom.overflow>6)row.issues.push({type:'horizontal-overflow',detail:dom.overflow+'px; '+JSON.stringify(dom.offenders)});
        if(row.type==='public'&&!dom.robots.startsWith('index,follow'))row.issues.push({type:'public-noindex',detail:dom.robots});
        if(row.type==='public'&&dom.text<90)row.issues.push({type:'empty-content',detail:String(dom.text)});
        const missing=new Set();for(const a of dom.attrs){const t=target(a.value,route);if(!t)continue;
          if(a.tag==='A'&&a.k==='href')row.localLinks++;
          if(/\.pdf$/i.test(t.url))row.pdfLinks++;
          if(!exists(t)&&!missing.has(t.url)){missing.add(t.url);row.issues.push({type:a.tag==='IMG'?'missing-image':'missing-asset-or-link',detail:a.k+' '+t.url});}
        }
        const slug=(route.replace(/[^a-z0-9-]+/gi,'-').replace(/^-|-$/g,'')||'root')+'-'+device.name+'.png';
        row.screenshot='screenshots/'+slug;
        try{await page.screenshot({path:path.join(OUT,row.screenshot),fullPage:row.type==='public'&&dom.height<28000,animations:'disabled',timeout:30000});}
        catch(e){row.screenshot='';row.issues.push({type:'screenshot',detail:String(e.message).slice(0,150)});}
        if((route==='/'||route==='/ko/')&&device.name==='mobile'){
          const b=page.locator('.navbar-toggler-main');
          if(await b.count()&&await b.isVisible()){
            try{await b.click({timeout:5000});row.menuExpanded=(await b.getAttribute('aria-expanded'))==='true';if(!row.menuExpanded)row.issues.push({type:'menu',detail:'mobile menu did not expand'});}
            catch(e){row.issues.push({type:'menu',detail:String(e.message).slice(0,180)});}
          }
        }
      }catch(e){row.issues.push({type:'navigation-error',detail:String(e.message).slice(0,190)});}
      finally{if(page)await page.close().catch(()=>{});report[idx]=row;}
    }
  }
  try{await Promise.all(Array.from({length:4},()=>worker()));}
  finally{await Promise.all(Object.values(contexts).map(c=>c.close()));await browser.close();}
  const issues=report.flatMap(row=>row.issues.map(e=>({route:row.route,device:row.device,...e})));
  const counts={};for(const issue of issues)counts[issue.type]=(counts[issue.type]||0)+1;
  const summary={htmlCount:html.length,pdfCount:pdf.length,pageLoads:report.length,expectedLoads:tasks.length,issueCounts:counts,issues,report,limitations:['External destinations and external image hosts are not checked','PDF contents and links inside PDFs not scanned','Dynamic interactions beyond mobile menu not fully tested','Only 11 important pages have full-height screenshots; other pages are first viewport']};
  fs.writeFileSync(path.join(OUT,'audit.json'),JSON.stringify(summary,null,2));
  const notes=['# Full generated-site audit','','HTML documents: '+html.length,'Browser renders: '+report.length+'/'+tasks.length,'PDF files preserved: '+pdf.length,'','## Findings'];
  for(const [k,v] of Object.entries(counts))notes.push('- '+k+': '+v);
  notes.push('','## Issues');for(const x of issues)notes.push('- '+x.route+' ['+x.device+'] '+x.type+': '+x.detail);
  notes.push('','## Limits',...summary.limitations.map(x=>'- '+x));
  fs.writeFileSync(path.join(OUT,'audit.md'),notes.join('\n'));
  console.log('SITE_AUDIT_SUMMARY '+JSON.stringify({html:html.length,pdf:pdf.length,renders:report.length,issueCounts:counts}));
  for(const i of issues.slice(0,30))console.log('SITE_AUDIT_ISSUE '+JSON.stringify(i));
}
run().catch(e=>{console.error('SITE_AUDIT_FATAL',e);process.exitCode=1});