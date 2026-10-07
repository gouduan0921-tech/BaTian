"""Apply the October visual polish to existing stage assets; safe to rerun after generation.
Textures use deterministic noise, not external downloads. Gameplay anchors stay untouched.
"""
import copy, json, uuid
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
PROJECT = Path(__file__).resolve().parents[2]
NS = uuid.UUID('cb8df756-219b-4bd6-84f1-878c51a34c82')
def uid(key): return str(uuid.uuid5(NS, key))
def write(p, data): p.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
def color(r,g,b): return {'__type__':'cc.Color','r':r,'g':g,'b':b,'a':255}
texdir=PROJECT/'assets/textures/environment'; texdir.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(20261002)
noise=rng.normal(0,1,(512,512))
# Periodic filtered noise keeps all four texture edges seamless.
coarse=np.zeros_like(noise)
for dy in range(-7,8):
 for dx in range(-7,8): coarse+=np.roll(np.roll(noise,dy,0),dx,1)
coarse/=225
coarse/=coarse.std()
a=np.stack([192+coarse*5+noise*2,185+coarse*5+noise*2,172+coarse*4+noise*2],axis=-1)
file=texdir/'ENV_Common_Paving_B.png';Image.fromarray(np.uint8(np.clip(a,0,255))).save(file)
texture_id=uid('paving')
meta={'ver':'1.0.27','importer':'image','imported':True,'uuid':texture_id,'files':['.json','.png'],
'subMetas':{'6c48a':{'ver':'1.0.22','importer':'texture','imported':True,'uuid':texture_id+'@6c48a',
 'displayName':file.stem,'id':'6c48a','name':'texture','files':['.json'],'subMetas':{},
 'userData':{'wrapModeS':'repeat','wrapModeT':'repeat','minfilter':'linear','magfilter':'linear','mipfilter':'linear','anisotropy':4,'isUuid':True,'imageUuidOrDatabaseUri':texture_id}}},
'userData':{'type':'texture','hasAlpha':False,'redirect':texture_id+'@6c48a'}}
write(file.with_suffix('.png.meta'),meta)
# A neutral rice base preserves recipe colors under the warm shop lighting.
rice=np.stack([199+coarse*3+noise,198+coarse*3+noise,189+coarse*3+noise],axis=-1)
rice_image=Image.fromarray(np.uint8(np.clip(rice,0,255)))
draw=ImageDraw.Draw(rice_image)
for i in range(170):
 x,y=rng.integers(0,512,2);w,h=rng.integers(3,6),rng.integers(5,10)
 for sx in (-512,0,512):
  for sy in (-512,0,512):
   draw.ellipse((x+sx-w,y+sy-h,x+sx+w,y+sy+h),fill=(222,220,207))
   draw.ellipse((x+sx-w+1,y+sy-h,x+sx+w-1,y+sy+h-2),fill=(232,231,221))
rice_file=PROJECT/'assets/textures/food/FOOD_Common_Congee_B.png'
rice_image.save(rice_file)
rice_id=uid('congee-rice')
rice_meta=copy.deepcopy(meta);rice_meta['uuid']=rice_id;rice_meta['userData']['redirect']=rice_id+'@6c48a'
rice_sub=rice_meta['subMetas']['6c48a'];rice_sub['uuid']=rice_id+'@6c48a';rice_sub['displayName']=rice_file.stem;rice_sub['userData']['imageUuidOrDatabaseUri']=rice_id
write(rice_file.with_suffix('.png.meta'),rice_meta)
soup_file=PROJECT/'assets/materials/M_Soup.mtl';soup=json.loads(soup_file.read_text())
soup['_props'][0].update(mainTexture={'__uuid__':rice_id+'@6c48a','__expectedType__':'cc.Texture2D'},roughness=.72,normalStrength=.12,
 normalMap={'__uuid__':'c00f1fbc-366c-4dba-b263-bb96447be38a@3c318','__expectedType__':'cc.Texture2D'},
 emissive=color(0,0,0),albedoScale={'__type__':'cc.Vec3','x':.8,'y':.83,'z':.87})
write(soup_file,soup)
normal_file=PROJECT/'assets/textures/food/Congee_A_N.png.meta'
normal_meta=json.loads(normal_file.read_text());normal_meta['userData']['redirect']=normal_meta['uuid']+'@3c318';write(normal_file,normal_meta)
steam_file=PROJECT/'assets/materials/M_Steam.mtl';steam=json.loads(steam_file.read_text())
steam['_effectAsset']={'__uuid__':'65012067-3904-4f56-bd42-d388f663281b'};steam['_techIdx']=0
steam['_defines']=[{}];steam['_props']=[{'mainColor':{'__type__':'cc.Color','r':255,'g':249,'b':237,'a':70}}]
write(steam_file,steam)
mat=copy.deepcopy(json.loads((PROJECT/'assets/materials/M_Matte.mtl').read_text()))
mat['_name']='ENV_Common_Paving';mat['_defines']=[{'USE_ALBEDO_MAP':True}]
mat['_props'][0].update(mainTexture={'__uuid__':texture_id+'@6c48a','__expectedType__':'cc.Texture2D'},roughness=.91)
material_id=uid('paving-material')
write(PROJECT/'assets/materials/ENV_Common_Paving.mtl',mat)
write(PROJECT/'assets/materials/ENV_Common_Paving.mtl.meta',{'ver':'1.0.21','importer':'material','imported':True,'uuid':material_id,'files':['.json'],'subMetas':{},'userData':{}})
lidmat=copy.deepcopy(json.loads((PROJECT/'assets/materials/M_Matte.mtl').read_text()))
lidmat['_name']='PROP_Common_ReservedLid';lidmat['_props'][0].update(roughness=.5,metallic=.12)
lid_id=uid('reserved-lid')
write(PROJECT/'assets/materials/PROP_Common_ReservedLid.mtl',lidmat)
write(PROJECT/'assets/materials/PROP_Common_ReservedLid.mtl.meta',{'ver':'1.0.21','importer':'material','imported':True,'uuid':lid_id,'files':['.json'],'subMetas':{},'userData':{}})
p=PROJECT/'assets/prefabs/stage/Store.prefab';data=json.loads(p.read_text())
street=next(i for i,o in enumerate(data) if o.get('_name')=='Street')
for ref in data[street]['_children']:
 n=data[ref['__id__']]
 if n['_name']=='Base':
  for c in n['_components']:
   o=data[c['__id__']]
   if 'color' in o: o['color']=color(141,139,126)
 elif n['_name'].startswith('T'):
  n['_lscale']['x']=.978;n['_lscale']['z']=.978
  x=int(n['_lpos']['x']);z=int(n['_lpos']['z']-.5);k=(x*31+z*17)%5
  for c in n['_components']:
   o=data[c['__id__']]
   if o['__type__']=='cc.MeshRenderer': o['_materials']=[{'__uuid__':material_id,'__expectedType__':'cc.Material'}]
   if 'color' in o: o['color']=color(226+k*3,225+k*3,215+k*3)
for o in data:
 if all(k in o for k in ['rise','life','startScale','endScale','tone']): o.update(rise=1.05,life=1.9,startScale=.10,endScale=.44)
for o in data:
 if o.get('__type__')!='cc.Node' or o.get('_name')!='LockedCover':continue
 for ref in o['_children']:
  n=data[ref['__id__']]
  if n['_name']=='Tag': n['_lpos'].update(y=.095,z=0);n['_lscale'].update(x=.22,y=.07,z=.055)
  for ref in n['_components']:
   c=data[ref['__id__']]
   if c.get('__type__')=='cc.MeshRenderer':c['_materials']=[{'__uuid__':lid_id,'__expectedType__':'cc.Material'}]
   if 'color' in c:c['color']=color(91,85,73) if n['_name']=='Lid' else color(67,55,42)
# The old full-sized wooden frame covered its own glass. Keep only border strips.
frame=next(i for i,o in enumerate(data) if o.get('_name')=='PlainFrame')
pane=next(i for i,o in enumerate(data) if o.get('_name')=='PlainWindow')
f=data[frame];f['_lpos'].update(x=.115,y=1.25,z=0);f['_lscale'].update(x=.065,y=.075,z=1.4)
for c in data[pane]['_components']:
 o=data[c['__id__']]
 if 'color' in o: o['color']=color(163,189,181)
def window_bar(name,y,z,h,w):
 if any(o.get('_name')==name for o in data): return
 n=copy.deepcopy(f);idx=len(data);n['_name']=name;n['_id']=uid(name);n['_prefab']=None
 n['_lpos'].update(y=y,z=z);n['_lscale'].update(y=h,z=w);n['_components']=[];data.append(n)
 for ref in f['_components']:
  c=copy.deepcopy(data[ref['__id__']]);c['node']={'__id__':idx};c['__prefab']=None;c['_id']=uid(name+str(len(data)))
  n['_components'].append({'__id__':len(data)});data.append(c)
 data[f['_parent']['__id__']]['_children'].append({'__id__':idx})
window_bar('LatticeTop',2.25,0,.075,1.4)
for name,z in [('LatticeLeft',-.67),('LatticeRight',.67)]: window_bar(name,1.75,z,1,.065)
for name,z in [('LatticeInnerLeft',-.22),('LatticeInnerRight',.22)]: window_bar(name,1.75,z,.92,.025)
window_bar('LatticeMiddle',1.75,0,.028,1.3)
write(p,data)
# Restore the authored character if the base prefab generator was run again.
guest_model=PROJECT/'assets/resources/models/real/CHAR_Common_Guest_A.glb.meta'
if guest_model.exists():
 guest_id=json.loads(guest_model.read_text())['uuid']
 p=PROJECT/'assets/prefabs/stage/Guest.prefab';guest=json.loads(p.read_text())
 for o in guest:
  if 'model' in o and 'placeholder' in o and guest[o['node']['__id__']].get('_name')=='Model':
   o['model']={'__uuid__':guest_id+'@3abda','__expectedType__':'cc.Prefab'}
 write(p,guest)
# Keep saved editor appearance consistent with the default runtime preset.
p=PROJECT/'assets/scenes/Store.scene';data=json.loads(p.read_text())
for o in data:
 if o.get('__type__')=='cc.ShadowsInfo': o.update(_enabled=True,_type=1,_size={'__type__':'cc.Vec2','x':2048,'y':2048})
 if o.get('__type__')=='cc.DirectionalLight': o.update(_shadowEnabled=True,_shadowPcf=2,_shadowBias=.0002,_shadowNormalBias=.025,_shadowDistance=30,_csmLevel=1)
 if o.get('__type__')=='cc.SkyboxInfo':
  o['_envLightingType']=1
  o['_envmapHDR']={'__uuid__':'d032ac98-05e1-4090-88bb-eb640dcb5fc1@b47c0','__expectedType__':'cc.TextureCube'}
write(p,data)
print('Updated paving texture, stage materials and scene lighting.')
