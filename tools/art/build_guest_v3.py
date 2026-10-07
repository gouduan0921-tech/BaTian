"""Build a small, rounded, rig-free neighborhood guest. Metres, feet at origin, facing -Y.
Only limbs stay separate for runtime walking. Shared materials, no external textures.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4]
SOURCE=ROOT/'美术源文件/正式物件'; DEST=ROOT/'游戏工程/BaTian/assets/resources/models/real'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system='METRIC'
def mat(name,col,rough=.75):
 m=bpy.data.materials.new('BT3_'+name);m.diffuse_color=(*col,1);m.use_nodes=True
 p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if p is None:
  p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
 p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough
 return m
cloth=mat('Cloth',(.63,.66,.64));skin=mat('Skin',(.70,.48,.32));hair=mat('Hair',(.075,.062,.053));pants=mat('Trousers',(.12,.15,.16));shoe=mat('Shoes',(.055,.046,.037));eye=mat('Eyes',(.028,.025,.022));collar=mat('Collar',(.65,.62,.52));button=mat('Button',(.22,.18,.12))
parts=[]
def use(o,m):
 o.data.materials.append(m);parts.append(o);return o
def ell(name,pos,scale,m,segments=16,rings=8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos)
 o=bpy.context.object;o.name=name;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for p in o.data.polygons:p.use_smooth=True
 return use(o,m)
def box(name,pos,scale,m,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('SoftEdges','BEVEL');mod.width=bevel;mod.segments=2
 bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
 return use(o,m)
def join(group,name,pivot=(0,0,0)):
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.context.scene.cursor.location=pivot;bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o
# Soft tunic silhouette, readable collar, buttons and a friendly face.
box('Tunic',(0,0,1.03),(.40,.27,.60),cloth,.055)
ell('Shoulders',(0,0,1.25),(.24,.145,.12),cloth)
ell('Neck',(0,0,1.34),(.075,.075,.11),skin)
ell('Head',(0,-.005,1.52),(.215,.185,.235),skin,20,12)
ell('Hair',(0,.015,1.655),(.218,.182,.114),hair,20,10)
ell('EarL',(-.213,0,1.51),(.034,.035,.057),skin)
ell('EarR',(.213,0,1.51),(.034,.035,.057),skin)
ell('Nose',(0,-.187,1.49),(.027,.044,.03),skin,10,6)
for x in [-.067,.067]:ell('Eye',(x,-.177,1.545),(.013,.007,.019),eye,8,6)
box('Smile',(0,-.181,1.448),(.048,.006,.007),hair,.003)
for x,angle in [(-.058,-.4),(.058,.4)]:
 o=box('Collar',(x,-.14,1.27),(.095,.015,.09),collar,.008);o.rotation_euler[1]=angle
for z in [1.17,1.05,.93]:ell('Button',(0,-.142,z),(.012,.009,.012),button,8,6)
core=join(parts[:],'GuestCore');parts=[]
for side,x in [('L',-.11),('R',.11)]:
 box('Trouser',(x,0,.40),(.16,.20,.66),pants,.045)
 box('Shoe',(x,-.035,.062),(.175,.30,.125),shoe,.045)
 join(parts[:],'Leg'+side,(x,0,.72));parts=[]
for side,x in [('L',-.25),('R',.25)]:
 box('Sleeve',(x,0,1.095),(.15,.21,.34),cloth,.048)
 ell('Hand',(x,-.005,.855),(.068,.074,.09),skin,12,8)
 join(parts[:],'Arm'+side,(x,0,1.25));parts=[]
# Keep asset transforms predictable; apply transforms to geometry.
for o in list(bpy.context.scene.objects):
 if o.type=='MESH':
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
  o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'CHAR_Common_Guest_A.blend'))
bpy.ops.export_scene.gltf(filepath=str(DEST/'CHAR_Common_Guest_A.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=False)
print('Guest asset exported.')
