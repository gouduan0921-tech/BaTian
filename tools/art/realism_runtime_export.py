"""Retain the detailed source; export a lighter version for actual gameplay."""
import bpy,json,shutil
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/写实改造_20261005';L=bpy.data.scenes['BaTian_Realism_Assets'];S=bpy.context.scene
replaced=[];copies={};mods=[]
for m in bpy.data.materials:
 if not m.get('surface_revision') or not m.node_tree:continue
 for n in m.node_tree.nodes:
  if n.type!='TEX_IMAGE' or not n.image or max(n.image.size)<=512:continue
  original=n.image;key=original.as_pointer()
  if key not in copies:
   im=original.copy();im.name=original.name+'_Game512';im.scale(512,512);im.pack();copies[key]=im
  n.image=copies[key];replaced.append((n,original))
for o in L.objects:
 if o.type!='MESH':continue
 tris=sum(len(p.vertices)-2 for p in o.data.polygons)
 target=16000 if o.name=='GuestCore' else 5000 if o.name.startswith(('Arm','Leg')) else 18000 if 'Pot_Open' in o.name else 8000 if 'Bowl' in o.name or 'RiceGrains' in o.name else 20000 if 'Curtain' in o.name else None
 if target and tris>target:
  m=o.modifiers.new('Game detail budget','DECIMATE');m.ratio=target/tris;m.use_collapse_triangulate=True;mods.append((o,m))
ex=bpy.data.scenes.new('RuntimeOptimizedExport');queue=sorted(p.stem for p in (OUT/'游戏模型').glob('*.glb'));status={'phase':'exporting','texturesResized':len(copies),'geometryBudgeted':len(mods),'completed':[],'errors':[]}
def check(): (OUT/'游戏优化进度.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
def next_asset():
 try:
  name=queue.pop(0);bpy.context.window.scene=ex;ex.name='Scene' if name.startswith('CHAR') else 'BT2_Export';group=[L.objects[n] for n in ['ArmL','ArmR','GuestCore','LegL','LegR']] if name.startswith('CHAR') else [L.objects[name]]
  for o in group:ex.collection.objects.link(o);o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];p=OUT/'游戏模型'/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_extras=True,export_apply=True,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=88)
  for o in group:ex.collection.objects.unlink(o)
  shutil.copy2(p,ROOT/'游戏工程/BaTian/assets/resources/models/real'/p.name);status['completed'].append(name);check()
  if queue:return .1
  for n,original in replaced:n.image=original
  for o,m in mods:o.modifiers.remove(m)
  bpy.context.window.scene=S;status['phase']='complete';check();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_写实店铺.blend'));return None
 except Exception as e:status['errors'].append(str(e));check();raise
check();bpy.app.timers.register(next_asset,first_interval=.1)
result={'gameTextureCopies':len(copies),'geometryBudgets':len(mods),'sourcePreserved':True}
