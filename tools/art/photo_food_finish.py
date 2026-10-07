import bpy,math,random,json,numpy as np
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/照片级改造_20261006';GAME=ROOT/'游戏工程/BaTian/assets/resources/models/real';S=bpy.data.scenes['NeighborhoodDetails'];bpy.context.window.scene=S;records=[]
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

o=S.objects['I09'];rng=random.Random(780);g=Geo()
for i in range(10):
 a=rng.uniform(0,math.tau);r=.265*math.sqrt(rng.random());x,y=math.cos(a)*r,math.sin(a)*r;a=rng.uniform(0,math.tau)
 for j in range(5):g.ell((x-j*.003*math.sin(a),y+j*.003*math.cos(a),.006),(.056*rng.uniform(.82,1.1),.0048,.005),a+rng.uniform(-.09,.09),0,i*23)
new=g.mesh('Beef detail',[mat('BT5_Food_Beef',(.43,.25,.15),.4,True)]);o.data=new.data;bpy.data.objects.remove(new,do_unlink=True)
root=S.objects['FOOD_BaseGarnish'];export([root,*root.children],'FOOD_BaseGarnish');bpy.context.window.scene=bpy.data.scenes['粥霸天_晨光写实店铺.001'];bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_照片级店铺.blend'))
