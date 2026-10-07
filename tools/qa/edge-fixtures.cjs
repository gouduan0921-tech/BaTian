/* 明确标记的本机边界场景。生产规则生成；不进入游戏交付包。 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),dir=path.resolve(root,'../../开发记录/发布验收_20261002/候选构建');
const req=p=>require(path.join(root,'temp/rule-tests',p));
const {parseConfig,CONFIG_FILES}=req('core/Config.js'),{Progress,newProfile}=req('rules/Progress.js'),{Shift,newShiftState}=req('rules/Shift.js'),{SeededRng}=req('simulation/SeededRng.js'),{defaultSettings,validateSave}=req('save/SaveModel.js');
const cfg=parseConfig(Object.fromEntries(CONFIG_FILES.map(f=>[f,JSON.parse(fs.readFileSync(path.join(root,'assets/resources/data/rules',f+'.json')))])));
let fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'))).filter(x=>!x.label.startsWith('边界 ')&&!x.label.startsWith('升级 ')&&!x.label.startsWith('性能 ')&&!x.label.startsWith('刷新 '));
function step(s,t){for(let i=0;i<Math.round(t/.05);i++)s.step(.05);}
function profile(){const p=new Progress(cfg,newProfile(cfg,1234));p.state.completedDays=6;p.state.wallet=5000;p.morning();return p;}
function stock(p){for(const i of cfg.ingredients)p.pantry.add(i.id,4);for(const b of p.pantry.state.batches){b.ready+=b.raw;b.raw=0;}}
function shift(p,a=[]){const s=new Shift(cfg,newShiftState(cfg,{...p.shiftSetup(),goals:[]},a),p.pantry,new SeededRng(1));s.open();return s;}
function file(p,s){return {format:1,version:cfg.balance.version,serial:0,profile:p.state,shift:s?.state??null,rngStep:0,settings:{...defaultSettings(),tutorialDone:true},report:null};}
function add(label,f){assert.equal(validateSave(f,cfg).ok,true,label);fixtures.push({label,file:JSON.parse(JSON.stringify(f))});}
const p=profile();const s=shift(p);s.finish();const report=p.closeDay(s);const f=file(p,null);f.report=report;add('升级 八项购买与次日效果',f);
const p2=profile();p2.state.upgrades=['U01','U02','U03'];stock(p2);const s2=shift(p2);for(let i=0;i<4;i++)assert.equal(s2.startCooking(i,['R01','R02','R04','R07'][i],'low'),null);step(s2,2);add('性能 四锅文火与蒸汽',file(p2,s2));
const p3=profile();stock(p3);const s3=shift(p3,[{time:1,customerId:'C01',wave:'morning',onlyRecipe:'R01'},{time:2,customerId:'C02',wave:'morning',onlyRecipe:'R01'},{time:3,customerId:'C03',wave:'morning',onlyRecipe:'R01'}]);s3.startCooking(0,'R01','mid');let n=0;while(s3.state.pots[0].doneness<.8){s3.step(.05);if(++n%80===0&&!s3.busy)s3.stir(0);}while(s3.busy)s3.step(.05);s3.season(0,'plain');s3.setHeat(0,'low');s3.plate(0);step(s3,7);s3.state.arrivals=[{time:s3.state.t+.05,customerId:'C02',wave:'morning',onlyRecipe:'R01'},{time:s3.state.t+.1,customerId:'C03',wave:'morning',onlyRecipe:'R01'},{time:s3.state.t+.15,customerId:'C04',wave:'morning',onlyRecipe:'R01'}];s3.state.nextArrival=0;step(s3,.2);s3.startCooking(0,'R01','low');add('刷新 锅碗订单满座队列',file(p3,s3));
const p4=profile();stock(p4);const s4=shift(p4,Array.from({length:6},(_,i)=>({time:1+i*.1,customerId:'C07',wave:'morning',onlyRecipe:'R01'})));add('边界 低氛围食评',file(p4,s4));
const p5=profile();p5.pantry.add('I01',4);for(const b of p5.pantry.state.batches){b.ready+=b.raw;b.raw=0;}const s5=shift(p5,[{time:1,customerId:'C02',wave:'morning',onlyRecipe:'R02'}]);step(s5,2);add('边界 缺配料仍可下锅',file(p5,s5));
fixtures.push({label:'边界 超过1MB原档保护',rawPrimary:JSON.stringify({...f,note:'粥'.repeat(350000)}),file:JSON.parse(JSON.stringify(f))});
fixtures.push({label:'边界 损坏原档及有效备份',rawPrimary:'{"format":1,"profile":',file:JSON.parse(JSON.stringify(f))});const newer=JSON.parse(JSON.stringify(f));newer.format=99;fixtures.push({label:'边界 较新格式原档保护',rawPrimary:JSON.stringify(newer),rawBackup:JSON.stringify(newer),file:JSON.parse(JSON.stringify(f))});
fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify(fixtures));console.log(fixtures.length+' 明确标记的场景');
