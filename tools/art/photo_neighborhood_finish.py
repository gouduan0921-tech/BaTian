import bpy,json
from pathlib import Path
R=Path('/Users/liweng/Downloads/3D/BaTian Congee');S=bpy.data.scenes['NeighborhoodDetails'];bpy.context.window.scene=S;o=S.objects['ENV_Neighborhood_Lane'];replaced=[];copies={}
uv=o.data.uv_layers.active
for f in o.data.polygons:
 if len(f.vertices)!=4 or max(abs(v) for v in f.normal)<.999:continue
 axes=sorted(range(3),key=lambda k:abs(f.normal[k]))[:2]
 for i in f.loop_indices:
  v=o.data.vertices[o.data.loops[i].vertex_index].co;uv.data[i].uv=(v[axes[0]]/1.8,v[axes[1]]/1.8)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'美术源文件/照片级改造_20261006/粥霸天_照片级店铺.blend'))
for m in o.data.materials:
 for n in m.node_tree.nodes:
  if n.type=='TEX_IMAGE' and n.image and max(n.image.size)>512:
   original=n.image;k=original.as_pointer()
   if k not in copies:im=original.copy();im.scale(512,512);im.pack();copies[k]=im
   n.image=copies[k];replaced.append((n,original))
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
p=R/'美术源文件/照片级改造_20261006/游戏模型/ENV_Neighborhood_Lane.glb'
bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=90,export_cameras=False,export_lights=False)
(R/'游戏工程/BaTian/assets/resources/models/real'/p.name).write_bytes(p.read_bytes());print('Lane optimized',p.stat().st_size)
