"""Apply licensed photographic surfaces to the owned Blender library and re-export."""
import bpy,numpy as np,json,shutil
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/写实改造_20261005';PH=OUT/'PolyHaven';LIB=bpy.data.scenes['BaTian_Realism_Assets'];PHOTO=bpy.data.scenes['粥霸天_晨光写实店铺.001']
cache={};updated=[]
def pixels(im):
 a=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(a);return a.reshape(im.size[1],im.size[0],4)
def load(asset,kind):
 key=asset+'_'+kind
 if key not in cache:
  im=bpy.data.images.load(str(PH/(key+'.jpg')),check_existing=True);im.colorspace_settings.name='sRGB' if kind=='Diffuse' else 'Non-Color';im.pack();cache[key]=im
 return cache[key]
for m in list(bpy.data.materials):
 if not m.get('surface_revision') or not m.use_nodes:continue
 name=m.name;k=m.get('physical_surface');asset='wood_table_worn' if k=='wood' and 'Bamboo' not in name else 'denim_fabric' if k=='cloth' else 'clay_plaster' if name in ['BT2_LimePlaster','BT2_Grout','BT2_StoneBase','BT2_Terracotta','BT2_UnglazedClay'] or name.startswith('BT2_KilnBrick') else None
 if not asset:continue
 nt=m.node_tree;p=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');col=np.array(m.diffuse_color[:3]);raw=pixels(load(asset,'Diffuse'));rgb=raw[:,:,:3].copy()
 if asset=='denim_fabric':
  l=np.mean(rgb,axis=2);rgb=np.stack([l*c for c in col],-1)/max(l.mean(),.01)
 else:rgb*=col/np.maximum(rgb.mean(axis=(0,1)),.01)
 rgb=np.clip(rgb,.005,.98);rgba=np.ones(raw.shape,np.float32);rgba[:,:,:3]=rgb;im=bpy.data.images.new('Photo_'+name,width=raw.shape[1],height=raw.shape[0],alpha=False);im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(OUT/'贴图'/('Photo_'+name+'.png'));im.file_format='PNG';im.save();im.pack()
 for link in list(nt.links):
  if link.to_socket in [p.inputs['Base Color'],p.inputs['Roughness'],p.inputs['Metallic']]:nt.links.remove(link)
 t=nt.nodes.new('ShaderNodeTexImage');t.image=im;nt.links.new(t.outputs['Color'],p.inputs['Base Color'])
 nm=next(n for n in nt.nodes if n.type=='NORMAL_MAP');tn=nt.nodes.new('ShaderNodeTexImage');tn.image=load(asset,'nor_gl');nt.links.new(tn.outputs['Color'],nm.inputs['Color']);nm.inputs['Strength'].default_value=.45 if k=='wood' else .65 if k=='cloth' else .55
 tr=nt.nodes.new('ShaderNodeTexImage');tr.image=load(asset,'arm');sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(tr.outputs['Color'],sep.inputs['Color']);nt.links.new(sep.outputs['Green'],p.inputs['Roughness']);p.inputs['Metallic'].default_value=0;nt.links.new(sep.outputs['Blue'],p.inputs['Metallic'])
 m['photo_surface_source']='https://polyhaven.com/a/'+asset;m['surface_license']='CC0';updated.append(name)
# The offline floor uses the same licensed fine mineral surface, rather than flat squares.
for o in PHOTO.objects:
 if o.type=='MESH' and o.name.startswith('Worn stone paving'):
  o.data.materials.clear();o.data.materials.append(bpy.data.materials['BT2_StoneBase'])
# Selection is limited to each asset's own objects. Imported node names are retained.
export=bpy.data.scenes.new('Photo_export');queue=sorted(p.stem for p in (OUT/'游戏模型').glob('*.glb'));status={'phase':'exporting-photo-surfaces','materials':updated,'completed':[],'errors':[]}
def checkpoint(): (OUT/'实拍材质进度.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
def next_asset():
 try:
  name=queue.pop(0);bpy.context.window.scene=export;export.name='Scene' if name.startswith('CHAR') else 'BT2_Export';group=[LIB.objects[n] for n in ['ArmL','ArmR','GuestCore','LegL','LegR']] if name.startswith('CHAR') else [LIB.objects[name]]
  for o in group:export.collection.objects.link(o);o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];p=OUT/'游戏模型'/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=88)
  for o in group:export.collection.objects.unlink(o)
  shutil.copy2(p,ROOT/'游戏工程/BaTian/assets/resources/models/real'/p.name);status['completed'].append(name);checkpoint()
  if queue:return .1
  status['phase']='complete';checkpoint();bpy.context.window.scene=PHOTO;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_写实店铺.blend'));return None
 except Exception as e:status['errors'].append(str(e));checkpoint();raise
checkpoint();bpy.app.timers.register(next_asset,first_interval=.1)
result={'photoMaterials':len(updated),'sources':3,'exporting':len(queue),'progress':str(OUT/'实拍材质进度.json')}
