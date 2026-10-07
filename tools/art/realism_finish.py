"""Final photo-scene fixes and safe re-export of the menu label."""
import bpy,math,bmesh,shutil,json
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/写实改造_20261005';LIB=bpy.data.scenes['BaTian_Realism_Assets'];S=bpy.data.scenes['粥霸天_晨光写实店铺.001']
bpy.context.window.scene=LIB;o=LIB.objects['PROP_NightBlue_MenuBoard_A'];bm=bmesh.new();bm.from_mesh(o.data);chalk=next(i for i,m in enumerate(o.data.materials) if 'Chalk' in m.name)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index==chalk and .10<f.calc_center_median().z<.43],context='FACES');bm.to_mesh(o.data);bm.free()
font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Songti.ttc',check_existing=True);texts=[]
for j,label in enumerate(['白粥','青菜瘦肉','鸡丝粥']):
 c=bpy.data.curves.new('Menu lettering','FONT');c.body=label;c.font=font;c.size=.040;c.align_x='CENTER';c.align_y='CENTER';c.extrude=.0007;c.resolution_u=2;c.materials.append(o.data.materials[chalk]);t=bpy.data.objects.new('Menu lettering',c);LIB.collection.objects.link(t);t.location=(0,-.091,.37-j*.09);t.rotation_euler=(math.pi/2,0,0);bpy.ops.object.select_all(action='DESELECT');t.select_set(True);bpy.context.view_layer.objects.active=t;bpy.ops.object.convert(target='MESH');texts.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
for t in texts:t.select_set(True)
bpy.context.view_layer.objects.active=o;bpy.ops.object.join();o.data=o.data.copy()
for mod in list(o.modifiers):o.modifiers.remove(mod)
mod=o.modifiers.new('Reliable menu tangents','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
for q in S.objects:
 if q.name.startswith('PROP_NightBlue_MenuBoard_A'):q.data=o.data
# The boolean of the multi-piece old wall produced a false panel. Build the photo
# wall as actual jambs, lintel and sill; game wall meshes remain unchanged.
bpy.context.window.scene=S
bad=next(q for q in S.objects if q.name.startswith('ENV_WarmWood_Wall_Side') and q.location.x<0);bad.hide_render=True;bad.hide_set(True)
def cube(name,pos,size,mat,bevel=.006):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);q=bpy.context.object;q.name=name;q.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);q.data.materials.append(bpy.data.materials[mat]);b=q.modifiers.new('Worn edges','BEVEL');b.width=bevel;b.segments=2
 uv=q.data.uv_layers.active
 for p in q.data.polygons:
  a=max(range(3),key=lambda i:abs(p.normal[i]));ax=[i for i in range(3) if i!=a]
  for i in p.loop_indices:
   co=q.data.vertices[q.data.loops[i].vertex_index].co;uv.data[i].uv=(co[ax[0]],co[ax[1]])
 return q
cube('Left wall lower',(-4.12,1.05,.64),(.13,4.2,1.28),'BT2_LimePlaster')
cube('Left wall lintel',(-4.12,1.05,2.75),(.13,4.2,.70),'BT2_LimePlaster')
cube('Left wall front jamb',(-4.12,-.425,1.84),(.13,1.25,1.12),'BT2_LimePlaster')
cube('Left wall back jamb',(-4.12,2.475,1.84),(.13,1.35,1.12),'BT2_LimePlaster')
cube('Left wall beam',(-4.12,1.05,3.10),(.24,4.35,.18),'BT2_SmokedOak')
for j in range(6):
 for k in range(20):cube('Worn left wall tile',(-4.044,-.95+k*.21,.09+j*.19),(.021,.20,.18),'BT2_CeladonGlaze',.003)
cube('Left wall trim',(-4.05,1.05,1.20),(.06,4.20,.06),'BT2_WornOak')
# A softly focused courtyard beyond the real glazed window, with plant silhouettes.
cube('Courtyard wall',(-5.4,1.1,1.4),(.12,4.5,2.8),'BT2_LimePlaster')
for q in list(S.objects):
 if q.name.startswith('PROP_WarmWood_Plant_A') and q.location.z==0:
  p=q.copy();p.data=q.data;S.collection.objects.link(p);p.location=(-4.9,.6,0);p.scale=(1.8,)*3;break
# Steam uses noise with a soft silhouette rather than a visibly rectangular fog box.
for q in S.objects:
 if not q.name.startswith('Steam volume'):continue
 nt=q.data.materials[0].node_tree;vol=next(n for n in nt.nodes if n.type=='PRINCIPLED_VOLUME');noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=7;noise.inputs['Detail'].default_value=3;tc=nt.nodes.new('ShaderNodeTexCoord');nt.links.new(tc.outputs['Generated'],noise.inputs['Vector']);r=nt.nodes.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.43;r.color_ramp.elements[1].position=.68;r.color_ramp.elements[1].color=(.38,.38,.38,1);nt.links.new(noise.outputs['Fac'],r.inputs['Fac']);nt.links.new(r.outputs['Color'],vol.inputs['Density'])
S.render.filepath=str(OUT/'晨光店铺_最终复核.png')
ex=bpy.data.scenes.new('Menu_export');bpy.context.window.scene=ex;ex.name='BT2_Export';ex.collection.objects.link(o);o.select_set(True);bpy.context.view_layer.objects.active=o;p=OUT/'游戏模型/PROP_NightBlue_MenuBoard_A.glb';bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=91);ex.collection.objects.unlink(o);shutil.copy2(p,ROOT/'游戏工程/BaTian/assets/resources/models/real'/p.name)
bpy.context.window.scene=S;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_写实店铺.blend'))
result={'menu':'corrected front lettering','photoWindow':'reconstructed opening','file':bpy.data.filepath}
