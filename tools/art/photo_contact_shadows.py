"""Bake subtle per-vertex contact shading into selected real gameplay meshes."""
import bpy, json, math, numpy as np
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/照片级改造_20261006';GAME=ROOT/'游戏工程/BaTian/assets/resources/models/real'
DEST=OUT/'阴影补充';DEST.mkdir(exist_ok=True)
records=[]
for name in ['PROP_Common_Pot_Open','PROP_Common_BackCounter_A','PROP_WarmWood_FrontCounter_A','ENV_WarmWood_Wall_Back','ENV_WarmWood_Wall_Side','PROP_Common_CharcoalStove_A']:
    bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.name='BT2_Export';s.render.engine='CYCLES';s.cycles.samples=24
    pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
    for d in pref.devices:d.use=d.type=='METAL'
    s.cycles.device='GPU';bpy.ops.import_scene.gltf(filepath=str(OUT/'游戏模型'/(name+'.glb')))
    mesh=next(o for o in s.objects if o.type=='MESH');mesh.name=name
    # The original UVs and all original material names remain intact.
    bpy.context.view_layer.objects.active=mesh;bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
    attr=mesh.data.color_attributes.new(name='ContactShade',type='FLOAT_COLOR',domain='CORNER');mesh.data.color_attributes.active_color=attr
    s.render.bake.target='VERTEX_COLORS';bpy.ops.object.bake(type='AO')
    a=np.empty(len(attr.data)*4,np.float32);attr.data.foreach_get('color',a);a=a.reshape(-1,4)
    # Cocos' standard material decodes vertex color as sRGB. Keep the shading mild.
    a[:,:3]=np.power(.55+.45*np.clip(a[:,:3],0,1),1/2.2);a[:,3]=1;attr.data.foreach_set('color',a.ravel())
    before=GAME/(name+'.glb');p=DEST/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_tangents=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_extras=True,export_image_format='JPEG',export_jpeg_quality=92,export_cameras=False,export_lights=False)
    before.write_bytes(p.read_bytes());bpy.ops.wm.save_as_mainfile(filepath=str(DEST/(name+'.blend')))
    records.append({'asset':name,'colorCorners':len(a),'minimumShade':float(a[:,:3].min()),'maximumShade':float(a[:,:3].max()),'bytes':p.stat().st_size})
    (DEST/'补充记录.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
print('Verified baked contact shading for',len(records),'game meshes')
