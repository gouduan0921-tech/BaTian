"""Attach real GLBs to existing stage nodes without rebuilding unrelated UI."""
import copy, json, math, sys, uuid
from pathlib import Path

PROJECT=Path(__file__).resolve().parents[2]
ROOT=PROJECT.parents[1]
NS=uuid.UUID('b726082f-5d9e-4186-b0cf-88d127e28847')

def cls(name):
    h=json.loads((PROJECT/f'assets/scripts/view/{name}.ts.meta').read_text())['uuid'].replace('-','')
    b64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    return h[:5]+''.join(b64[(int(h[i],16)<<2)|(int(h[i+1],16)>>2)]+b64[((int(h[i+1],16)&3)<<4)|int(h[i+2],16)] for i in range(5,32,3))

def model_id(name):
    meta=json.loads((PROJECT/f'assets/resources/models/real/{name}.glb.meta').read_text())
    found=[v for v in meta['subMetas'].values() if v['importer']=='gltf-scene' and v['userData']['gltfIndex']==0]
    if len(found)>1:  # 重新导入后编辑器可能留下旧的子资源键，只认已生成到 library 的那个
        found=[v for v in found if (PROJECT/'library'/v['uuid'][:2]/(v['uuid']+'.json')).exists()] or found[-1:]
    assert len(found)==1,name
    return found[0]['uuid']

SEASON_GARNISH={'I13':'FOOD_Season_Yam','I14':'FOOD_Season_CuredPork','I15':'FOOD_Season_Shepherd','I16':'FOOD_Season_MungBean'}
SEASON_STAND={'I13':'PROP_Season_Stand_Yam','I14':'PROP_Season_Stand_Pork','I15':'PROP_Season_Stand_Shepherd','I16':'PROP_Season_Stand_MungBean'}

def upgrade(a,kind):
    a=copy.deepcopy(a)
    if any(x.get('_name')=='RealPropsInstalled' for x in a): return a
    vec=lambda x,y,z:{'__type__':'cc.Vec3','x':x,'y':y,'z':z}
    def node(name,parent,pos=(0,0,0),euler=(0,0,0),scale=(1,1,1),children=None):
        q=math.radians(euler[1])/2
        idx=len(a)
        n={'__type__':'cc.Node','_name':name,'_objFlags':0,'__editorExtras__':{},'_parent':{'__id__':parent},'_children':children or [],'_active':True,'_components':[],
           '_prefab':None,'_lpos':vec(*pos),'_lrot':{'__type__':'cc.Quat','x':0,'y':math.sin(q),'z':0,'w':math.cos(q)},'_lscale':vec(*scale),'_mobility':0,'_layer':1073741824,'_euler':vec(*euler),'_id':str(uuid.uuid5(NS,str(idx)+name))}
        a.append(n)
        n['_prefab']={'__id__':len(a)}
        a.append({'__type__':'cc.PrefabInfo','root':{'__id__':1},'asset':{'__id__':0},'fileId':n['_id'],'instance':None,'targetOverrides':None,'nestedPrefabInstanceRoots':None})
        a[parent]['_children'].append({'__id__':idx})
        return idx
    def children(i): return [r['__id__'] for r in a[i]['_children']]
    def child(i,name): return next(j for j in children(i) if a[j]['_name']==name)
    def attach(i,key,pos=(0,0,0),scale=(1,1,1),euler=(0,0,0),exclude=()):
        old=[r for r in a[i]['_children'] if a[r['__id__']]['_name'] not in exclude]
        a[i]['_children']=[r for r in a[i]['_children'] if a[r['__id__']]['_name'] in exclude]
        ph=node('GrayboxFallback',i,children=old)
        for r in old: a[r['__id__']]['_parent']={'__id__':ph}
        n=node('RealModel',i,pos,euler,scale)
        cid=len(a); a[n]['_components'].append({'__id__':cid})
        a.append({'__type__':cls('ModelSlot'),'_name':'','_objFlags':0,'__editorExtras__':{},'node':{'__id__':n},'_enabled':True,'__prefab':{'__id__':cid+1},'_id':str(uuid.uuid5(NS,key+str(cid))),
                  'model':{'__uuid__':model_id(key),'__expectedType__':'cc.Prefab'},'placeholder':{'__id__':ph},'offset':vec(0,0,0),'scale':vec(1,1,1),'hide':[]})
        a.append({'__type__':'cc.CompPrefabInfo','fileId':str(uuid.uuid5(NS,key+str(cid)))})
        return n
    # Existing hook positions and fallback references stay intact.
    bowls=[]
    for comp in a:
        if comp.get('__type__')!=cls('ModelSlot'): continue
        node_name=a[comp['node']['__id__']]['_name']
        old=comp.get('model',{}).get('__uuid__','')
        key=None
        if old.startswith('06f9ff17'): key='PROP_Common_Pot_Open'
        elif old.startswith('42d3593b'): key='PROP_WarmWood_Lamp_Paper'
        elif old.startswith('924a9f9c'): key='PROP_Common_Bowl_A'
        if key: comp['model']={'__uuid__':model_id(key),'__expectedType__':'cc.Prefab'}
        if key=='PROP_Common_Bowl_A':
            comp['variantIds']=['D10','D13','D25','D14']
            comp['variants']=[{'__uuid__':model_id(k),'__expectedType__':'cc.Prefab'} for k in ['PROP_Common_Bowl_Coarse','PROP_WarmWood_Bowl_Glaze','PROP_MorningWhite_Bowl_Porcelain','PROP_NightBlue_Bowl_Deep']]
            bowls.append((comp['node']['__id__'],comp['scale']['x']))
    for n,s in bowls:
        food=node('CongeeInBowl',n,(0,.172*s,0))
        attach(food,'FOOD_Common_PlainCongee',scale=(s,s,s))
    if kind=='Guest':
        node('RealPropsInstalled',1)
        return a
    fixed={'BackWall':('ENV_WarmWood_Wall_Back',(0,0,0),(0,0,0)),
           'LeftWall':('ENV_WarmWood_Wall_Side',(0,0,0),(0,90,0)),
           'RightWall':('ENV_WarmWood_Wall_Side',(0,0,0),(0,-90,0)),
           'BackCounter':('PROP_Common_BackCounter_A',(0,0,0),(0,0,0)),
           'FrontCounter':('PROP_WarmWood_FrontCounter_A',(0,0,0),(0,0,0)),
           'Sign':('PROP_WarmWood_Sign_A',(0,-.48,0),(0,0,0)),
           'Rack':('PROP_WarmWood_Shelf_Jars',(0,-.025,0),(0,0,0)),
           'PrepCounter':('PROP_Common_PrepBoard_A',(0,0,0),(0,0,0)),
           'BowlStack':('PROP_Common_BowlStack_A',(0,0,0),(0,0,0))}
    original_nodes=[i for i,x in enumerate(a) if x.get('__type__')=='cc.Node']
    for i in original_nodes:
        name=a[i]['_name']
        if name in fixed:
            key,pos,rot=fixed[name]; attach(i,key,pos,euler=rot)
        elif name.startswith('Post') and a[i]['_parent']=={'__id__':1}: attach(i,'ENV_WarmWood_Post_A')
        elif name.startswith('Plant') and a[i]['_parent']=={'__id__':1}: attach(i,'PROP_WarmWood_Plant_A')
        elif name.startswith('WallLamp') and a[i]['_parent']=={'__id__':1}: attach(i,'PROP_Common_WallLamp_A',(0,0,.18),(.7,.7,.7),exclude=('Light',))
        elif name.startswith('Dirty') and name[5:].isdigit():
            n=attach(i,'PROP_Common_Bowl_A',scale=(.35,.35,.35),exclude=('Spoon',))
            comp=a[a[n]['_components'][0]['__id__']]
            comp['variantIds']=['D10','D13','D25','D14']
            comp['variants']=[{'__uuid__':model_id(k),'__expectedType__':'cc.Prefab'} for k in ['PROP_Common_Bowl_Coarse','PROP_WarmWood_Bowl_Glaze','PROP_MorningWhite_Bowl_Porcelain','PROP_NightBlue_Bowl_Deep']]
        elif name in ['Tray1','Tray2','Tray3']: attach(i,'PROP_WarmWood_Tray_A',exclude=('Bowl1','Bowl2','Bowl3'))
        elif name.startswith('SeatProp'):
            ids=children(i)
            table_ids=[j for j in ids if a[j]['_name']=='Table' or a[j]['_name'].startswith('Leg')]
            stool_ids=[j for j in ids if a[j]['_name'].startswith('Stool')]
            a[i]['_children']=[{'__id__':j} for j in ids if j not in table_ids+stool_ids]
            ti=node('TableArt',i,children=[{'__id__':j} for j in table_ids]); si=node('StoolArt',i,children=[{'__id__':j} for j in stool_ids])
            for j in table_ids: a[j]['_parent']={'__id__':ti}
            for j in stool_ids: a[j]['_parent']={'__id__':si}
            attach(ti,'PROP_WarmWood_Table_A',(0,0,-.5)); attach(si,'PROP_WarmWood_Stool_A')
        elif name in ['Pot1','Pot2','Pot3','Pot4']:
            # Countertop is at 0.87 m; the stove bottom must sit above it.
            a[i]['_lpos']['y']=1.221
            ids=children(i); stove_ids=[j for j in ids if a[j]['_name'] in ['StoveBase','Rim','Mouth'] or a[j]['_name'].startswith('Brick')]
            a[i]['_children']=[{'__id__':j} for j in ids if j not in stove_ids]
            st=node('StoveArt',i,children=[{'__id__':j} for j in stove_ids])
            for j in stove_ids: a[j]['_parent']={'__id__':st}
            attach(st,'PROP_Common_CharcoalStove_A',(0,-.39,0))
            for part,height in [('Soup',.300),('Garnish',.311),('Steam',.34),('Ring',.335)]:
                a[child(i,part)]['_lpos']['y']=height
            rice=node('RiceGrains',i,(0,.304,0)); attach(rice,'FOOD_Common_RiceGrains')
            view=next(a[c['__id__']] for c in a[i]['_components'] if a[c['__id__']]['__type__']==cls('PotView'))
            view['riceGrains']={'__id__':rice}
            # 时令食材的正式配料（文档 30）：PotView 按下锅的食材点亮对应的一件
            sg=node('SeasonGarnish',i,(0,.311,0))
            for ing,key in SEASON_GARNISH.items():
                c=node(ing,sg); attach(c,key); a[c]['_active']=False
            view['seasonGarnish']={'__id__':sg}
    decor=json.loads((PROJECT/'assets/resources/data/rules/decor.json').read_text())
    for d in decor:
        if d['kind']=='tableware' or d['id']=='D01': continue
        i=next(i for i,x in enumerate(a) if x.get('__type__')=='cc.Node' and x.get('_name')==d['id'])
        slot=d['slot']
        if d['kind']=='small':
            pos={'window':(.35,1,1.85),'counter':(2.9,0,.0),'door':(-.7,1.65,0),'hall':(3.45,1,-1.85)}[slot]
            a[i]['_lpos']=vec(*pos); attach(i,d['mesh'])
        elif slot=='hall':
            attach(i,d['mesh'],(-3,0,-.35))
            # Six distinct anchors remain independently hidden when seats are unowned.
            for k,x in enumerate([-1.9,-.6,.5,1.8,2.9],1):
                t=node('DecorTable'+str(k),i,(x,0,-.35)); attach(t,d['mesh'])
            a[child(i,'RealModel')]['_name']='DecorTable0'
        elif slot=='door': attach(i,d['mesh'],(0,1.30,0),scale=(.5,.5,.5) if 'Lamp' in d['mesh'] else (1,1,1))
        elif slot=='counter': attach(i,d['mesh'],(0,-.425,0))
        elif slot=='kitchen': attach(i,d['mesh'],(0,1.20,-.86))
        elif slot=='window':
            if d['id']=='D02':
                attach(i,d['mesh'],(.98,.77,3.35),exclude=('Light',))
                a[child(i,'RealModel')]['_name']='BrassLamp0'
                for k,x in enumerate([3.38,5.78],1):
                    t=node('BrassLamp'+str(k),i,(x,.77,3.35)); attach(t,d['mesh'])
            else: attach(i,d['mesh'],(.08,1.2,0),euler=(0,90,0),exclude=('Light',))
    # 备料台与一号锅之间的时令陈列，StoreView 只亮当季那件
    stand=node('SeasonStand',1,(-2.6,.87,-1.72),(0,-10,0),(1.2,1.2,1.2))
    for ing,key in SEASON_STAND.items():
        c=node(ing,stand); attach(c,key); a[c]['_active']=False
    store=next(x for x in a if x.get('__type__')==cls('StoreView'))
    store['seasonStand']={'__id__':stand}
    node('RealPropsInstalled',1)
    return a

def main():
    backup=ROOT/'美术源文件/正式物件/替换前备份'
    backup.mkdir(exist_ok=True)
    for kind in ['Store','Guest']:
        path=PROJECT/f'assets/prefabs/stage/{kind}.prefab'
        before=backup/(kind+'.prefab')
        if not before.exists(): before.write_bytes(path.read_bytes())
        a=json.loads(before.read_text())
        upgraded=upgrade(a,kind)
        path.write_text(json.dumps(upgraded,ensure_ascii=False,indent=2)+'\n')
        print(kind,len(upgraded))

if __name__=='__main__': main()
