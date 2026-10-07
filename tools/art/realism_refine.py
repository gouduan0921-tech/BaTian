"""Refine the authored asset library without changing game asset paths or limb names."""
import bpy, math, numpy as np, bmesh, json, shutil
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/写实改造_20261005'
LIB=bpy.data.scenes['BaTian_Realism_Assets'];PREVIEW=bpy.context.scene;bpy.context.window.scene=LIB
parts=[]
def ell(pos,scale,mat,seg=32,rings=20):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=pos)
 o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(bpy.data.materials[mat]);parts.append(o)
 for p in o.data.polygons:p.use_smooth=True
 return o
def profile(rows,mat,seed=1,segments=32):
 verts=[];faces=[]
 for j,(x,y,z,rx,ry) in enumerate(rows):
  for k in range(segments):
   a=k*math.tau/segments;crease=1+.013*math.sin(a*9+j*1.8+seed)+.009*math.cos(a*13-j*2)
   verts.append((x+math.cos(a)*rx*crease,y+math.sin(a)*ry*crease,z))
 for j in range(len(rows)-1):
  for k in range(segments):a=j*segments+k;b=j*segments+(k+1)%segments;faces.append((a,b,b+segments,a+segments))
 faces.extend([tuple(reversed(range(segments))),tuple(range((len(rows)-1)*segments,len(rows)*segments))])
 me=bpy.data.meshes.new('Anatomical cloth surface');me.from_pydata(verts,[],faces);me.materials.append(bpy.data.materials[mat]);me.update();o=bpy.data.objects.new('Authored part',me);LIB.collection.objects.link(o);parts.append(o)
 for p in me.polygons:p.use_smooth=True
 sub=o.modifiers.new('Soft tailored fabric','SUBSURF');sub.levels=2;bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=sub.name);o.select_set(False)
 return o
def replace(name):
 old=LIB.objects[name];oldmesh=old.data;slots=list(oldmesh.materials)
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();joined=parts[0]
 # Keep imported object transforms and material order; only the mesh changes.
 for v in joined.data.vertices:v.co=old.matrix_world.inverted()@(joined.matrix_world@v.co)
 material_indices=[slots.index(joined.data.materials[p.material_index]) if joined.data.materials[p.material_index] in slots else -1 for p in joined.data.polygons]
 assert min(material_indices)>=0,(name,'unexpected material')
 joined.data.materials.clear()
 for m in slots:joined.data.materials.append(m)
 for p,i in zip(joined.data.polygons,material_indices):p.material_index=i
 me=joined.data;me.name=name+'_Realistic'
 # Fine UV projection supports cloth weave and skin detail on every face.
 for layer in list(me.uv_layers):me.uv_layers.remove(layer)
 uv=me.uv_layers.new(name='SurfaceUV')
 for p in me.polygons:
  axis=max(range(3),key=lambda a:abs(p.normal[a]));axes=[a for a in range(3) if a!=axis]
  for i in p.loop_indices:
   co=me.vertices[me.loops[i].vertex_index].co;uv.data[i].uv=(co[axes[0]]*2,co[axes[1]]*2)
 for o in bpy.data.objects:
  if o.type=='MESH' and o.data==oldmesh:o.data=me
 bpy.data.objects.remove(joined,do_unlink=True);parts.clear();return old
# Adult proportions, shaped jacket, visible collar/seams and a small anatomical face.
profile([(0,0,.74,.175,.105),(0,0,.80,.183,.112),(0,0,.91,.170,.110),(0,0,1.04,.169,.119),(0,0,1.16,.192,.125),(0,0,1.29,.219,.109),(0,0,1.35,.180,.092),(0,0,1.38,.078,.067)],'BT3_Cloth')
ell((0,0,1.415),(.052,.051,.082),'BT3_Skin')
head=ell((0,0,1.585),(.087,.092,.129),'BT3_Skin',48,32)
for v in head.data.vertices:
 z=v.co.z/.129
 if z<-.1:v.co.x*=1+.22*z;v.co.y*=1+.13*z
 # Cheekbones and an anatomically narrower chin.
 v.co.y-=.003*math.exp(-((z-.05)/.35)**2)
ell((0,-.080,1.597),(.015,.025,.050),'BT3_Skin')
ell((0,-.112,1.576),(.017,.020,.012),'BT3_Skin')
for x in [-.013,.013]:ell((x,-.105,1.571),(.012,.012,.007),'BT3_Skin',20,12)
for x in [-.091,.091]:ell((x,.002,1.581),(.013,.020,.030),'BT3_Skin')
for x in [-.038,.038]:
 ell((x,-.086,1.615),(.016,.008,.007),'BT3_Collar',24,12)
 ell((x,-.093,1.615),(.005,.002,.005),'BT3_Eyes',20,12)
 ell((x,-.088,1.622),(.022,.004,.005),'BT3_Skin')
 ell((x,-.087,1.634),(.020,.003,.003),'BT3_Hair')
ell((0,-.086,1.543),(.025,.009,.006),'BT3_Skin')
ell((0,-.094,1.541),(.022,.001,.0015),'BT3_Hair',24,10)
# A swept hair cap with an irregular hairline, instead of a spherical toy cap.
hair=ell((0,.009,1.633),(.089,.088,.087),'BT3_Hair',48,24)
for v in hair.data.vertices:
 if v.co.y<0 and v.co.z<.005:v.co.z+=.026*(-v.co.y/.088)
 v.co.x+=.006*math.sin(v.co.z*40);v.co.z+=.002*math.sin(v.co.x*170)
for x in [-.048,.048]:
 o=ell((x,-.103,1.331),(.045,.012,.043),'BT3_Collar');o.rotation_euler[1]=-.45 if x<0 else .45
for z in [.89,1.01,1.13,1.24]:ell((0,-.120,z),(.004,.003,.004),'BT3_Button',12,8)
profile([(0,-.120,.79,.004,.002),(0,-.124,1.29,.004,.002)],'BT3_Collar')
replace('GuestCore')
for side,x in [('L',-.11),('R',.11)]:
 profile([(x,-.003,.08,.050,.065),(x,0,.17,.056,.063),(x,.006,.30,.062,.067),(x,-.006,.43,.065,.075),(x,.003,.57,.070,.080),(x,0,.70,.078,.081),(x,0,.81,.085,.088)],'BT3_Trousers',2 if side=='L' else 4)
 ell((x,-.035,.065),(.070,.125,.056),'BT3_Shoes');ell((x,-.048,.022),(.071,.126,.012),'BT3_Shoes')
 replace('Leg'+side)
for side,sign in [('L',-1),('R',1)]:
 x=sign*.25
 profile([(x,-.016,.85,.047,.052),(x,-.010,.93,.048,.056),(x,-.004,1.02,.052,.061),(sign*.25,0,1.12,.065,.068),(sign*.242,0,1.23,.079,.077),(sign*.219,0,1.30,.071,.076)],'BT3_Cloth',3)
 ell((x,-.016,.827),(.036,.027,.040),'BT3_Skin')
 for i in range(4):ell((x+(i-1.5)*.014,-.021,.785-abs(i-1.5)*.003),(.0065,.012,.030),'BT3_Skin',16,10)
 ell((x-sign*.034,-.027,.816),(.011,.014,.029),'BT3_Skin',20,12)
 replace('Arm'+side)
# Matte, granular black sandpot, with no polished clearcoat.
m=bpy.data.materials['BT2_BlackGlaze'];nt=m.node_tree;p=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
for link in list(nt.links):
 if link.to_socket==p.inputs['Roughness']:nt.links.remove(link)
p.inputs['Roughness'].default_value=.82;p.inputs['Coat Weight'].default_value=0
normal=next(n for n in nt.nodes if n.type=='NORMAL_MAP');normal.inputs['Strength'].default_value=1.3
# Thin glazing lets light through the authored window.
m=bpy.data.materials['BT2_MorningGlass'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Alpha'].default_value=.16;p.inputs['Roughness'].default_value=.18;p.inputs['Emission Strength'].default_value=0;m.surface_render_method='DITHERED';m.diffuse_color=(.78,.87,.86,.16)
# Remove obsolete decorative prices: actual selling price depends on the recipe/rules.
o=LIB.objects['PROP_NightBlue_MenuBoard_A'];bm=bmesh.new();bm.from_mesh(o.data)
chalk=next(i for i,m in enumerate(o.data.materials) if 'Chalk' in m.name)
faces=[f for f in bm.faces if f.material_index==chalk and .10<f.calc_center_median().z<.43]
bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(o.data);bm.free()
font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Songti.ttc',check_existing=True)
new=[]
for j,label in enumerate(['白粥','青菜瘦肉','鸡丝粥']):
 c=bpy.data.curves.new('Handwritten menu','FONT');c.body=label;c.font=font;c.size=.040;c.align_x='CENTER';c.extrude=.0007;c.materials.append(o.data.materials[chalk]);t=bpy.data.objects.new('Menu text',c);LIB.collection.objects.link(t);t.location=(0,-.036,.37-j*.09);t.rotation_euler=(math.pi/2,0,0);bpy.ops.object.select_all(action='DESELECT');t.select_set(True);bpy.context.view_layer.objects.active=t;bpy.ops.object.convert(target='MESH');new.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
for t in new:t.select_set(True)
bpy.context.view_layer.objects.active=o;bpy.ops.object.join()
# Refresh all copied menu meshes in the photo scene after join.
for q in PREVIEW.objects:
 if q.name.startswith('PROP_NightBlue_MenuBoard_A'):q.data=o.data
# Ceiling and dark timber rafters give the offline interior believable light falloff.
bpy.context.window.scene=PREVIEW
def cube(name,pos,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);q=bpy.context.object;q.name=name;q.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);q.data.materials.append(bpy.data.materials[mat]);b=q.modifiers.new('Worn rounded edges','BEVEL');b.width=.006;b.segments=3;return q
cube('Timber ceiling',(0,1.0,3.26),(8.4,4.35,.10),'BT2_WornOak')
for x in [-3,-1.5,0,1.5,3]:cube('Ceiling rafter',(x,1,3.10),(.12,4.35,.20),'BT2_SmokedOak')
for q in PREVIEW.objects:
 if q.type=='LIGHT':
  if q.name=='Front soft daylight':q.data.energy=210
  if q.name=='Window morning':q.data.energy=1100
  if q.name=='Morning sun':q.data.energy=1.0
PREVIEW.view_settings.exposure=0;PREVIEW.render.filepath=str(OUT/'晨光店铺_复核.png')
# Export only changed mesh assets; shared pot material affects one sandpot asset.
export=bpy.data.scenes.new('Realism_refine_export');changed=['CHAR_Common_Guest_A','PROP_Common_Pot_Open','PROP_MorningWhite_Window_Morning','PROP_NightBlue_MenuBoard_A']
for name in changed:
 bpy.context.window.scene=export;export.name='Scene_RealismGuest' if name.startswith('CHAR') else 'BT2_Export'
 group=[LIB.objects[n] for n in ['ArmL','ArmR','GuestCore','LegL','LegR']] if name.startswith('CHAR') else [LIB.objects[name]]
 for q in group:export.collection.objects.link(q);q.select_set(True)
 bpy.context.view_layer.objects.active=group[0]
 path=OUT/'游戏模型'/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=91)
 for q in group:export.collection.objects.unlink(q)
 shutil.copy2(path,ROOT/'游戏工程/BaTian/assets/resources/models/real'/path.name)
bpy.context.window.scene=PREVIEW;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_写实店铺.blend'))
result={'refined':changed,'guestVertices':sum(len(LIB.objects[n].data.vertices) for n in ['GuestCore','ArmL','ArmR','LegL','LegR']),'file':bpy.data.filepath}
