"""Author realism revision in Blender, stage GLBs before replacing runtime files.
The live Blender scene is preserved; all edits target appended or imported copies.
"""
import bpy, bmesh, numpy as np, math, json, random, re
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee')
OUT=ROOT/'美术源文件/写实改造_20261005';STAGE=OUT/'游戏模型';TEX=OUT/'贴图'
for p in [OUT,STAGE,TEX]:p.mkdir(parents=True,exist_ok=True)
RUNTIME=ROOT/'游戏工程/BaTian/assets/resources/models/real'
status={'phase':'authoring','completed':[],'errors':[]}
def checkpoint(): (OUT/'进度.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
source=bpy.data.scenes.get('BaTian_RealProps_v2')
if source is None:
 with bpy.data.libraries.load(str(ROOT/'美术源文件/正式物件/BaTian_RealProps.blend'),link=False) as (a,b): b.scenes=['BaTian_RealProps_v2']
 source=b.scenes[0]
scene=bpy.data.scenes.new('BaTian_Realism_Assets');bpy.context.window.scene=scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
assets={};stats={};mat_cache={};tex_cache={}
# Source aliases retain their original datablocks; new meshes remain editable independently.
for old in list(source.objects):
 name=old.name;old.name=name+'_source';o=old.copy();o.data=old.data.copy();o.name=name;o.data.name=name;scene.collection.objects.link(o)
 o.location=(0,0,0);o.hide_set(False);assets[name]=[o]
for p in sorted(RUNTIME.glob('*.glb')):
 if p.stem in assets:continue
 previous=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(p));group=[o for o in bpy.data.objects if o not in previous and o.type=='MESH']
 assert group,p.stem
 # Same exported node names keep all importer references and limb animation bindings.
 assets[p.stem]=group
# Seamless physical surface maps: base colour in sRGB, micro normal and roughness in linear.
def noise(n,cells,seed):
 r=np.random.default_rng(seed);g=r.random((cells,cells)).astype(np.float32);v=np.arange(n)*cells/n;i=np.floor(v).astype(int)%cells;j=(i+1)%cells;f=(v-np.floor(v)).astype(np.float32);f=f*f*(3-2*f)
 return (g[np.ix_(i,i)]*(1-f[None,:])+g[np.ix_(i,j)]*f[None,:])*(1-f[:,None])+(g[np.ix_(j,i)]*(1-f[None,:])+g[np.ix_(j,j)]*f[None,:])*f[:,None]
def fbm(n,s):return sum(noise(n,k,s+k)*w for k,w in [(3,.42),(9,.28),(27,.18),(81,.12)])
def image(name,rgb,linear=False):
 n=rgb.shape[0];im=bpy.data.images.new('BT4_'+name,width=n,height=n,alpha=False);im.colorspace_settings.name='Non-Color' if linear else 'sRGB';px=np.ones((n,n,4),np.float32);px[:,:,:3]=np.clip(rgb,0,1);im.pixels.foreach_set(px.ravel());im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
PALETTE={'WornOak':(.43,.27,.14),'HoneyOak':(.62,.43,.24),'SmokedOak':(.18,.13,.095),'PaleAsh':(.73,.61,.43),'Terracotta':(.63,.40,.27),'LimePlaster':(.78,.74,.64),'BlackGlaze':(.036,.032,.027),'AgedBrass':(.57,.40,.19),'Copper':(.61,.31,.16),'Congee':(.92,.91,.86),'CeladonGlaze':(.52,.67,.60),'WarmPorcelain':(.87,.87,.83),'Linen':(.57,.47,.34),'IndigoLinen':(.105,.16,.23),'CuredLean':(.36,.095,.075),'CuredFat':(.86,.77,.65),'YamFlesh':(.9,.89,.79),'ShepherdPurse':(.09,.26,.065),'MungBean':(.18,.29,.085),'Cloth':(.66,.66,.61)}
def kind(name):
 if any(x in name for x in ['Oak','Ash','Bamboo']) and 'Coal'not in name:return 'wood'
 if any(x in name for x in ['Linen','Burlap','Cloth','Trousers']):return 'cloth'
 if any(x in name for x in ['Brass','Copper']):return 'copper'
 if any(x in name for x in ['Steel','Metal','Iron']):return 'metal'
 if any(x in name for x in ['Porcelain','Glaze','Tile','Jar']):return 'ceramic'
 if any(x in name for x in ['YamFlesh','Cured','Pork','Mung','Congee','RiceGrain']):return 'food'
 if any(x in name for x in ['Leaf','Shepherd','Scallion','Stem']):return 'leaf'
 if 'Paper'in name:return 'paper'
 if 'Skin'in name:return 'skin'
 return 'stone'
def upgrade_material(old):
 canonical=re.sub(r'_source$','',re.sub(r'\.\d+$','',old.name))
 if canonical in mat_cache:return mat_cache[canonical]
 p=next((n for n in old.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if old.use_nodes else None
 col=PALETTE.get(canonical.replace('BT2_','').replace('BT3_',''),tuple(p.inputs['Base Color'].default_value[:3]) if p else tuple(old.diffuse_color[:3]))
 # Imported texture factors may be white; recover the actual texture colour when needed.
 if max(col)-min(col)<.002 and min(col)>.98 and p:
  images=[n.image for n in old.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color']
  if images:
   im=images[0];pixels=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(pixels);col=tuple(np.mean(pixels.reshape(-1,4)[::max(1,len(pixels)//16000),:3],axis=0))
 k=kind(canonical);n=1024 if k=='wood' else 512;seed=sum(ord(c) for c in canonical);rng=np.random.default_rng(seed);y,x=np.mgrid[0:n,0:n]/n;f=fbm(n,seed);fine=rng.random((n,n)).astype(np.float32);h=f*.12;variation=.90+.18*f;rough=.55+.22*(f-.5);metal=np.zeros_like(f)
 if k=='wood':
  warp=noise(n,5,seed)*1.6;grain=(np.sin((y*34+warp+.28*np.sin(x*9))*math.tau)*.5+.5)**9;fibres=(np.sin(y*n*.37+noise(n,31,seed)*8)*.5+.5)**10
  h=.17*f+.19*grain+.07*fibres;variation=.85+.21*f-.16*grain-.06*fibres
  # Oval growth-ring knots and fine longitudinal checks.
  for cx,cy in rng.random((3,2)):
   dist=np.hypot((x-cx)*.4,y-cy);knot=np.exp(-(dist/.022)**2);rings=(np.sin(dist*740)*.5+.5)*np.exp(-(dist/.055)**2);variation-=.19*knot+.08*rings;h-=knot*.08
  rough=.55+.2*f+.05*grain
 elif k=='cloth':
  wx=np.sin(x*n*math.pi/3);wy=np.sin(y*n*math.pi/3);weave=(wx*wy)*.5+.5;h=.16*weave+.035*fine+.08*f;variation=.9+.11*f+.065*(weave-.5);rough=.86+.11*f
 elif k=='copper':
  patina=np.clip((f-.60)*7,0,.55);variation=.86+.24*f;h=.06*f+.015*fine;rough=.28+.35*f+.18*patina;metal=.92-.65*patina
 elif k=='ceramic':
  h=.02*f+.006*fine;variation=.95+.07*f;rough=.16+.13*f
  if 'BlackGlaze'in canonical:rough=.48+.18*f;h=.08*f+.018*fine
  if 'Tile'in canonical:rough=.24+.16*f
 elif k=='food':
  h=.05*f+.015*fine;rough=.22+.19*f;variation=.92+.12*f
  if 'Cured'in canonical:
   veins=(np.sin((x*18+noise(n,5,seed)*4)*math.tau)*.5+.5)**6;variation-=veins*.18;h+=veins*.04;rough=.23+.16*f
  if 'YamFlesh'in canonical:h=.025*f+.023*(fine>.995);variation=.97+.03*f
  if 'Congee'in canonical:
   rice=np.zeros_like(f)
   for a in range(900):
    cx,cy=rng.integers(0,n,2);angle=rng.random()*math.pi;yy,xx=np.mgrid[-7:8,-7:8];u=(xx*math.cos(angle)+yy*math.sin(angle))/6;v=(-xx*math.sin(angle)+yy*math.cos(angle))/2.4;blob=np.clip(1-u*u-v*v,0,1)**.6;idx=np.ix_((yy[:,0]+cy)%n,(xx[0]+cx)%n);rice[idx]=np.maximum(rice[idx],blob)
   h+=rice*.28;variation=.90+.10*rice+.035*f;rough=.24+.08*f
 elif k=='leaf':h=.04*f+.015*np.sin(y*n*.18);variation=.80+.33*f;rough=.36+.28*f
 elif k=='paper':h=.04*f+.03*fine;variation=.95+.07*f;rough=.90+.07*f
 elif k=='metal':h=.02*fine+.02*np.sin(y*n);variation=.93+.09*f;rough=.38+.30*f;metal[:]=.82
 elif k=='skin':h=.015*fine;variation=.95+.08*f;rough=.48+.18*f
 else:h=.20*f+.06*fine;rough=.78+.19*f;variation=.84+.22*f
 rgb=np.stack([variation*c for c in col],-1)
 if k=='copper':rgb=rgb*(1-patina[:,:,None])+np.array([.08,.20,.16])*patina[:,:,None]
 if k=='skin':rgb[:,:,0]+=.012*(f-.5)
 base=image(canonical+'_Base',rgb);scale=2.8 if k in ['wood','stone','cloth'] else 1.3;dx=(np.roll(h,-1,1)-np.roll(h,1,1))*scale;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*scale;l=np.sqrt(1+dx*dx+dy*dy);normal=image(canonical+'_Normal',np.stack([.5-dx/l*.5,.5-dy/l*.5,.5+.5/l],-1),True);rm=image(canonical+'_RoughMetal',np.stack([np.ones_like(f),np.clip(rough,.12,.99),metal],-1),True)
 # Preserve recognizable material names for game glow and customer-clothing logic.
 old.name=canonical+'_source';m=bpy.data.materials.new(canonical);m.use_nodes=True;nt=m.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');pnew=nt.nodes.new('ShaderNodeBsdfPrincipled');nt.links.new(pnew.outputs['BSDF'],out.inputs['Surface']);pnew.inputs['Base Color'].default_value=(*col,1)
 t=nt.nodes.new('ShaderNodeTexImage');t.image=base;nt.links.new(t.outputs['Color'],pnew.inputs['Base Color']);tn=nt.nodes.new('ShaderNodeTexImage');tn.image=normal;nm=nt.nodes.new('ShaderNodeNormalMap');nt.links.new(tn.outputs['Color'],nm.inputs['Color']);nm.inputs['Strength'].default_value=.7;nt.links.new(nm.outputs['Normal'],pnew.inputs['Normal']);tr=nt.nodes.new('ShaderNodeTexImage');tr.image=rm;sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(tr.outputs['Color'],sep.inputs['Color']);nt.links.new(sep.outputs['Green'],pnew.inputs['Roughness']);nt.links.new(sep.outputs['Blue'],pnew.inputs['Metallic'])
 if p:
  for socket in ['Emission Color','Emission Strength']:
   if socket in p.inputs and socket in pnew.inputs:pnew.inputs[socket].default_value=p.inputs[socket].default_value
  if 'Coat Weight'in pnew.inputs:pnew.inputs['Coat Weight'].default_value=.18 if k=='ceramic' else 0
 m.diffuse_color=(*col,1);m['surface_revision']=4;m['physical_surface']=k;mat_cache[canonical]=m;return m
# Capture original dimensions and fix incomplete UVs left by joining authored parts.
for name,group in assets.items():
 stats[name]={'beforeVertices':sum(len(o.data.vertices) for o in group),'dimensions':[list(o.dimensions) for o in group]}
 for o in group:
  for i,m in enumerate(o.data.materials):
   if m:o.data.materials[i]=upgrade_material(m)
  me=o.data
  if len(me.uv_layers)>1:
   layers=list(me.uv_layers);best=me.uv_layers.new(name='RealismUV')
   for poly in me.polygons:
    chosen=max(layers,key=lambda u:sum(u.data[i].uv.length_squared for i in poly.loop_indices))
    for i in poly.loop_indices:best.data[i].uv=chosen.data[i].uv
   for u in layers:me.uv_layers.remove(u)
  if not me.uv_layers:
   uv=me.uv_layers.new(name='RealismUV')
   for p in me.polygons:
    ax=max(range(3),key=lambda a:abs(p.normal[a]));axes=[a for a in range(3) if a!=ax]
    for i in p.loop_indices:
     v=me.vertices[me.loops[i].vertex_index].co;uv.data[i].uv=(v[axes[0]],v[axes[1]])
  # Add controlled rounded silhouettes where the previous model was visibly faceted.
  rounded=any(s in name for s in ['Pot_Open','Bowl_A','Bowl_Coarse','Bowl_Glaze','Bowl_Porcelain','Bowl_Deep','Stool_A','Chime_Brass'])
  if rounded:
   sub=o.modifiers.new('Smooth crafted silhouette','SUBSURF');sub.subdivision_type='CATMULL_CLARK';sub.levels=1;sub.render_levels=1
  elif 'Curtain'in name:
   sub=o.modifiers.new('Soft cloth detail','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=1;sub.render_levels=1
   t=bpy.data.textures.new(name+'_Wrinkles',type='CLOUDS');t.noise_scale=.16;dis=o.modifiers.new('Irregular cloth wrinkles','DISPLACE');dis.texture=t;dis.strength=.002;dis.mid_level=.5
  elif 'FOOD_Season_Cured'in name:
   b=o.modifiers.new('Moist sliced edges','BEVEL');b.width=.0008;b.segments=3;b.limit_method='ANGLE'
  if not rounded and not name.startswith('FOOD_'):
   weighted=o.modifiers.new('Crafted face normals','WEIGHTED_NORMAL');weighted.keep_sharp=True;weighted.weight=30
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
  for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
  # Keep all gameplay dimensions and bottom-centre pivots.
  me=o.data
  if name!='CHAR_Common_Guest_A':
   pts=np.array([v.co[:] for v in me.vertices]);mn,mx=pts.min(0),pts.max(0);target=np.array(stats[name]['dimensions'][0]);size=mx-mn;factor=target/np.maximum(size,1e-8);shift=np.array([(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,mn[2]])
   for v in me.vertices:v.co=tuple((np.array(v.co)-shift)*factor)
  me.update();o['asset_id']=name;o['revision']='realism-20261005';o['origin']='bottom centre' if name!='CHAR_Common_Guest_A' else 'existing limb pivots'
# More natural adult proportions instead of a large toy-like head; existing animation parts stay.
for o in assets['CHAR_Common_Guest_A']:
 if o.name.startswith('GuestCore'):
  for v in o.data.vertices:
   world=o.matrix_world@v.co
   if world.z>1.32:
    w=min(1,max(0,(world.z-1.32)/.08));world.x*=1-.38*w;world.y*=1-.24*w;world.z=1.32+(world.z-1.32)*.89;v.co=o.matrix_world.inverted()@world
  o.data.update()
# Staging export uses original scene and node names to preserve imported prefab IDs.
export=bpy.data.scenes.new('BT2_Export');export.unit_settings.system='METRIC';queue=list(sorted(assets));status.update(phase='exporting',total=len(queue),materials=len(mat_cache));checkpoint()
def export_next():
 try:
  name=queue.pop(0);group=assets[name];bpy.context.window.scene=export
  export.name='Scene_RealismGuest' if name=='CHAR_Common_Guest_A' else 'BT2_Export'
  for o in group:
   export.collection.objects.link(o);o.hide_set(False);o.select_set(True)
  bpy.context.view_layer.objects.active=group[0]
  # Each geometry node keeps its original name; no mesh-compression decoder dependency.
  bpy.ops.export_scene.gltf(filepath=str(STAGE/(name+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_tangents=True,export_materials='EXPORT',export_image_format='JPEG',export_jpeg_quality=91)
  for o in group:export.collection.objects.unlink(o)
  status['completed'].append(name);stats[name]['vertices']=sum(len(o.data.vertices) for o in group);stats[name]['bytes']=(STAGE/(name+'.glb')).stat().st_size;checkpoint()
  if queue:return .1
  bpy.context.window.scene=scene;status['phase']='authored';checkpoint();(OUT/'改造清单.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_写实物件.blend'));return None
 except Exception as e:
  status['errors'].append(str(e));status['phase']='failed';checkpoint();raise
bpy.app.timers.register(export_next,first_interval=.2)
result={'scene':scene.name,'models':len(assets),'materials':len(mat_cache),'staging':str(STAGE),'progress':str(OUT/'进度.json')}
