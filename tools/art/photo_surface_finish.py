"""Retain the scan detail while removing the excessive wet-looking highlights."""
import bpy, numpy as np, json, shutil
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/照片级改造_20261006';GAME=ROOT/'游戏工程/BaTian/assets/resources/models/real'
S=bpy.data.scenes['PhotoScannedGuests'];bpy.context.window.scene=S
changed=set()
for m in bpy.data.materials:
 if not m.name.startswith(('Scanned_','PhotoFull8K_')) or not m.node_tree:continue
 for n in m.node_tree.nodes:
  if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.4
  if n.type!='TEX_IMAGE' or not n.image or 'rough' not in n.image.name:continue
  im=n.image
  if im.name in changed:continue
  a=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(a);a=a.reshape(-1,4);a[:,:3]=np.clip(.45+.55*a[:,:3],.50,.97);im.pixels.foreach_set(a.ravel());im.update();im.pack();changed.add(im.name)
records=[]
for short,filename in [('Eric','CHAR_Common_Guest_A.glb'),('Carla','CHAR_Photo_Guest_B.glb'),('Claudia','CHAR_Photo_Guest_C.glb')]:
 rig=bpy.data.objects['PhotoGuest_'+short];mesh=bpy.data.objects['PhotoGuest_'+short+'_Mesh'];S.frame_set(1)
 ex=bpy.data.scenes.new('Scan finish export');bpy.context.window.scene=ex;ex.name='Scene';ex.render.fps=30;ex.collection.objects.link(rig);ex.collection.objects.link(mesh)
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
 target=OUT/'游戏模型'/filename
 bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_rest_position_armature=False,export_apply=False,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=92,export_cameras=False,export_lights=False,export_extras=True)
 shutil.copy2(target,GAME/filename);records.append({'file':filename,'bytes':target.stat().st_size});bpy.context.window.scene=S;bpy.data.scenes.remove(ex)
bpy.context.window.scene=bpy.data.scenes['粥霸天_晨光写实店铺.001'];bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_照片级店铺.blend'))
(OUT/'人物表面补充记录.json').write_text(json.dumps({'images':sorted(changed),'normalStrength':.4,'roughnessTransform':'clamp(.45+.55*original,.5,.97)','exports':records},ensure_ascii=False,indent=2)+'\n')
