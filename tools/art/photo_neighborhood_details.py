"""Detail food and lamps without changing existing model names or pivots."""
import bpy, math, random, json, numpy as np
from pathlib import Path
from mathutils import Matrix
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee')
OUT=ROOT/'美术源文件/照片级改造_20261006'; GAME=ROOT/'游戏工程/BaTian/assets/resources/models/real'
QA=ROOT/'开发记录/街坊细节完善_20261007'; QA.mkdir(exist_ok=True)
LIB=bpy.data.scenes['BaTian_Realism_Assets']; PHOTO=bpy.data.scenes['粥霸天_晨光写实店铺.001']
assert 'NeighborhoodDetails' not in bpy.data.scenes, 'Use the preserved source in 续修前; this authoring revision is already applied.'
S=bpy.data.scenes.new('NeighborhoodDetails'); bpy.context.window.scene=S
records=[]
def export(objects,name):
 bpy.context.window.scene=S; bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 p=OUT/'游戏模型'/(name+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_apply=True,export_tangents=True,export_extras=True,export_image_format='AUTO',export_jpeg_quality=92,export_cameras=False,export_lights=False)
 (GAME/p.name).write_bytes(p.read_bytes())
 records.append({'asset':name,'bytes':p.stat().st_size,'triangles':sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects if o.type=='MESH')})
def mat(name,col,rough=.45,fiber=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Roughness'].default_value=rough
 n=256;y,x=np.mgrid[0:n,0:n]/n;rng=np.random.default_rng(sum(map(ord,name)));fine=rng.random((n,n));v=.89+.13*fine+.08*np.sin(x*15+y*9)
 if fiber:v-=.13*(.5+.5*np.sin(y*280+np.sin(x*18)*3))**8
 a=np.ones((n,n,4),np.float32);a[:,:,:3]=np.array(col)*v[:,:,None]
 im=bpy.data.images.new(name+'_Base',width=n,height=n,alpha=False);im.pixels.foreach_set(a.ravel());im.pack()
 t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 h=.015*fine+(.06*(.5+.5*np.sin(y*280+np.sin(x*18)*3))**8 if fiber else .008*np.sin(x*44));dx=np.roll(h,-1,1)-np.roll(h,1,1);dy=np.roll(h,-1,0)-np.roll(h,1,0)
 a[:,:,:3]=np.stack([.5-dx,.5-dy,np.ones_like(dx)],-1)
 im=bpy.data.images.new(name+'_Normal',width=n,height=n,alpha=False);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(a.ravel());im.pack()
 t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;nm=m.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45
 m.node_tree.links.new(t.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],p.inputs['Normal']);return m
class Geo:
 def __init__(self):self.v=[];self.f=[];self.mi=[];self.uv=[]
 def face(self,ids,m):self.f.append(ids);self.mi.append(m)
 def ell(self,pos,size,a=0,m=0,seed=0,seg=12,rings=6):
  b=len(self.v);c,s=math.cos(a),math.sin(a)
  for j in range(rings+1):
   t=math.pi*j/rings
   for i in range(seg+1):
    q=math.tau*i/seg;r=1+.035*math.sin(q*3+t*2+seed);x=math.cos(t)*size[0]*.5;y=math.sin(t)*math.cos(q)*size[1]*.5*r;z=math.sin(t)*math.sin(q)*size[2]*.5*r
    self.v.append((pos[0]+x*c-y*s,pos[1]+x*s+y*c,pos[2]+z));self.uv.append((j/rings,i/seg))
  for j in range(rings):
   for i in range(seg):
    k=b+j*(seg+1)+i
    if j==0:self.face((k,k+seg+1,k+seg+2),m)
    elif j==rings-1:self.face((k,k+seg+1,k+1),m)
    else:self.face((k,k+seg+1,k+seg+2,k+1),m)
 def leaf(self,pos,length,width,a,m=0):
  b=len(self.v);c,s=math.cos(a),math.sin(a)
  for j in range(9):
   u=j/8;half=width*.5*max(.04,math.sin(math.pi*u))**.7
   for i in range(5):
    t=(i-2)/2;x=(u-.5)*length;y=t*half;z=.003*math.sin(u*math.pi)+.003*abs(t)+.0014*math.sin(u*26+t*3)
    self.v.append((pos[0]+x*c-y*s,pos[1]+x*s+y*c,pos[2]+z));self.uv.append((u,(t+1)/2))
  for j in range(8):
   for i in range(4):
    k=b+j*5+i;self.face((k,k+5,k+6,k+1),m)
 def box(self,pos,size,m=0):
  b=len(self.v)
  for z in [-1,1]:
   for y in [-1,1]:
    for x in [-1,1]:self.v.append(tuple(pos[k]+[x,y,z][k]*size[k]/2 for k in range(3)));self.uv.append((x*.5+.5,y*.5+.5))
  for f in [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]:self.face(tuple(b+i for i in f),m)
 def mesh(self,name,mats,smooth=True):
  me=bpy.data.meshes.new(name);me.from_pydata(self.v,[],self.f);me.update()
  for m in mats:me.materials.append(m)
  uv=me.uv_layers.new(name='DetailUV')
  for p,mi in zip(me.polygons,self.mi):
   p.material_index=mi;p.use_smooth=smooth
   for i in p.loop_indices:uv.data[i].uv=self.uv[me.loops[i].vertex_index]
  o=bpy.data.objects.new(name,me);S.collection.objects.link(o);return o
# Professional lamp: mount flush to the original back wall, retain root/pivot.
bpy.ops.import_scene.gltf(filepath=str(OUT/'来源/PolyHaven/industrial_wall_lamp/industrial_wall_lamp_1k.gltf'))
lamp=next(o for o in S.objects if o.type=='MESH');lamp.data.transform(lamp.matrix_world);lamp.matrix_world=Matrix.Identity(4)
for v in lamp.data.vertices:v.co*=1.12;v.co.z+=.175;v.co.y-=.17
for m in lamp.data.materials:
 m['license']='CC0';m['source']='https://polyhaven.com/a/industrial_wall_lamp'
 if 'glass' in m.name.lower():
  m.name='BT5_FrostedLamp';p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Color'].default_value=(1,.66,.31,1);p.inputs['Emission Strength'].default_value=.45
for name in ['PROP_Common_WallLamp_A','PROP_NightBlue_Lamp_Brass']:
 old=LIB.objects[name];data=old.data;new=lamp.data.copy()
 if 'Brass' in name:
  for i,m in enumerate(new.materials):
   if 'Frosted' not in m.name:
    m=m.copy();m.name='BT5_AgedBrassLamp';new.materials[i]=m
    t=next((n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name=='sRGB'),None)
    if t:
     im=t.image.copy();a=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(a);a=a.reshape(-1,4);a[:,:3]*=(1.08,.91,.62);im.pixels.foreach_set(np.clip(a,0,1).ravel());im.pack();t.image=im
 for o in bpy.data.objects:
  if o.type=='MESH' and o.data==data:o.data=new
 old['professional_model_source']='https://polyhaven.com/a/industrial_wall_lamp'
 S.collection.objects.link(old);export([old],name);S.collection.objects.unlink(old)
bpy.data.objects.remove(lamp,do_unlink=True)
root=bpy.data.objects.new('FOOD_BaseGarnish',None);S.collection.objects.link(root);foods=[]
specs={'I02':('Millet',(.77,.58,.16),64),'I03':('Pork',(.66,.48,.38),12),'I04':('CenturyEgg',(.13,.085,.035),8),'I05':('Pumpkin',(.92,.46,.045),9),'I06':('Vegetable',(.15,.34,.07),15),'I07':('Shrimp',(.89,.47,.28),5),'I08':('Fish',(.9,.86,.74),7),'I09':('Beef',(.43,.25,.15),10),'I10':('RedBean',(.33,.075,.06),28),'I11':('Sesame',(.06,.045,.032),90),'I12':('Chicken',(.87,.76,.54),23)}
for id,(name,col,count) in specs.items():
 rng=random.Random(771+int(id[1:]));g=Geo();mats=[mat('BT5_Food_'+name,col,.38 if id in ['I03','I04','I07'] else .5,id in ['I03','I08','I09','I12'])]
 if id=='I04':mats.append(mat('BT5_EggYolk',(.35,.34,.18),.65))
 if id=='I06':mats.append(mat('BT5_LeafVein',(.31,.48,.13),.5))
 for i in range(count):
  a=rng.uniform(0,math.tau);r=.265*math.sqrt(rng.random());x,y=math.cos(a)*r,math.sin(a)*r;a=rng.uniform(0,math.tau);size=rng.uniform(.75,1.22);z=.006+rng.uniform(-.002,.003)
  def ell(dx,dy,dz,sz,angle=a,m=0):g.ell((x+dx,y+dy,z+dz),tuple(k*size for k in sz),angle,m,i*23)
  if id=='I02':ell(0,0,0,(.009,.007,.005))
  elif id=='I03':
   for j in range(4):ell(j*.004*math.cos(a+math.pi/2),j*.004*math.sin(a+math.pi/2),0,(.055,.006,.006),a+rng.uniform(-.09,.09))
  elif id=='I04':ell(0,0,0,(.052,.040,.018));ell(.005*math.cos(a),.005*math.sin(a),.009,(.027,.024,.005),m=1)
  elif id=='I05':ell(0,0,0,(.053,.046,.021));ell(0,0,.006,(.034,.035,.013))
  elif id=='I06':g.leaf((x,y,z),.059*size,.028*size,a);ell(0,0,.004,(.046,.0015,.0016),m=1)
  elif id=='I07':
   for j in range(8):
    q=a-1.1+j*.31;ell(math.cos(q)*.029,math.sin(q)*.029,0,(.019-j*.0013,.017-j*.0011,.013-j*.0007),q+math.pi/2)
   q=a+1.07
   for k in [-.4,0,.4]:ell(math.cos(q)*.038,math.sin(q)*.038,0,(.02,.006,.004),q+k)
  elif id=='I08':
   for j in range(4):ell(-j*.006*math.sin(a),j*.006*math.cos(a),-.0003*j,(.078-j*.008,.011,.008),a+rng.uniform(-.06,.06))
  elif id=='I09':ell(0,0,0,(.061,.022,.013));ell(0,0,.004,(.047,.01,.009))
  elif id=='I10':ell(0,0,0,(.027,.018,.011))
  elif id=='I11':ell(0,0,0,(.01,.004,.003))
  elif id=='I12':
   for j in range(3):ell(-j*.0018*math.sin(a),j*.0018*math.cos(a),.0008*j,(.088-j*.008,.0028,.0035),a+.08*math.sin(i+j))
 o=g.mesh(id,mats);o.parent=root;o['ingredient_id']=id;foods.append(o)
export([root,*foods],'FOOD_BaseGarnish');LIB.collection.objects.link(root)
for o in foods:LIB.collection.objects.link(o)
# Old lane beyond the store; no foreground walls across the player's work area.
g=Geo();mats=[bpy.data.materials['BT2_LimePlaster'],bpy.data.materials['BT2_SmokedOak'],bpy.data.materials['BT2_BlackMetal'],mat('BT5_LanePaving',(.29,.29,.27),.94),bpy.data.materials['BT2_KilnBrick1']]
g.box((0,1,-.09),(26,28,.06),3)
for x,width,height in [(-8.8,5.5,4.6),(-2.7,5.4,4.9),(3.8,6.7,4.5),(10,4.7,5.1)]:
 y=9.3;g.box((x,y,height/2),(width,2.8,height),0);g.box((x,y-1.43,.32),(width,.11,.65),4)
 for wx in [x-width*.28,x+width*.28]:
  g.box((wx,y-1.42,2.45),(.95,.045,1.45),2)
  for dx in [-.54,.54]:g.box((wx+dx,y-1.5,2.45),(.13,.16,1.65),1)
  for z in [1.66,3.24]:g.box((wx,y-1.5,z),(1.22,.16,.13),1)
  for j in range(8):g.box((wx,y-1.48,1.85+j*.16),(.86,.055,.055),1)
 g.box((x,y-1.46,1.01),(.95,.08,1.95),1)
 for j in range(8):g.box((x-.4+j*.115,y-1.52,1.01),(.08,.04,1.85),1)
 for j in range(int(width/.2)):
  for q in range(4):g.ell((x-width/2+.1+j*.2,y-1.7+q*.43,height+.16+q*.17),(.19,.53,.1),math.pi/2,4,j,seg=8,rings=4)
 g.box((x,y,height+.87),(width+.3,.22,.22),4)
 for z in [height-.18,height-.35]:g.box((x,y-1.5,z),(width+.35,.19,.08),1)
o=g.mesh('ENV_Neighborhood_Lane',mats,False);export([o],o.name);LIB.collection.objects.link(o);PHOTO.collection.objects.link(o)
bpy.context.window.scene=PHOTO;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_照片级店铺.blend'))
(QA/'新增细节资源.json').write_text(json.dumps(records,ensure_ascii=False,indent=2));print('DETAILS_COMPLETED',records)
