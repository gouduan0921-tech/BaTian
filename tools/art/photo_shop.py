"""Photographic surfaces with coherent grain scale, plus a real mineral floor."""
import bpy, numpy as np, json, shutil
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/照片级改造_20261006';PH=OUT/'来源/PolyHaven';L=bpy.data.scenes['BaTian_Realism_Assets'];PHOTO=bpy.data.scenes['粥霸天_晨光写实店铺.001']
cache={};changed=[]
def load(asset,kind):
    key=asset+'_'+kind
    if key not in cache:
        im=bpy.data.images.load(str(PH/(key+'.jpg')),check_existing=True);im.colorspace_settings.name='sRGB' if kind=='Diffuse' else 'Non-Color';im.pack();cache[key]=im
    return cache[key]
for m in list(bpy.data.materials):
    if not m.use_nodes:continue
    k=m.get('physical_surface');name=m.name
    asset='wood_cabinet_worn_long' if name=='BT2_WornOak' else 'fine_grained_wood' if k=='wood' and 'Bamboo' not in name and name!='BT2_Ash' else 'brown_brick_02' if name.startswith('BT2_KilnBrick') else 'grey_plaster_02' if name in ['BT2_LimePlaster','BT2_StoneBase','BT2_Grout'] else None
    if not asset:continue
    nt=m.node_tree;p=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
    for link in list(nt.links):
        if link.to_socket in [p.inputs['Base Color'],p.inputs['Roughness'],p.inputs['Metallic'],p.inputs['Normal']]:nt.links.remove(link)
    tex=nt.nodes.new('ShaderNodeTexImage');tex.image=load(asset,'Diffuse')
    if k=='wood':
        # Keep a real wood's measured color variations instead of normalizing each channel.
        tint=(.30,.24,.18,1) if name=='BT2_SmokedOak' else (1.4,1.27,1.07,1) if name in ['BT2_HoneyOak','BT2_PaleAsh'] else (1,1,1,1)
        mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=tint;nt.links.new(tex.outputs['Color'],mix.inputs[1]);nt.links.new(mix.outputs[0],p.inputs['Base Color'])
    else:nt.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    norm=nt.nodes.new('ShaderNodeTexImage');norm.image=load(asset,'nor_gl');nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.4 if k=='wood' else .55;nt.links.new(norm.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs[0],p.inputs['Normal'])
    rough=nt.nodes.new('ShaderNodeTexImage');rough.image=load(asset,'arm');sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(rough.outputs['Color'],sep.inputs[0]);nt.links.new(sep.outputs['Green'],p.inputs['Roughness']);p.inputs['Metallic'].default_value=0
    m['photo_surface_source']='https://polyhaven.com/a/'+asset;m['surface_license']='CC0';m['photo_revision']='20261006';changed.append(name)
# Physical coordinates keep grain running along long boards, with no face-by-face restart.
for o in L.objects:
    if o.type!='MESH':continue
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for f in o.data.polygons:
        mat=o.data.materials[f.material_index] if f.material_index<len(o.data.materials) else None
        if not mat or not mat.get('photo_revision'):continue
        co=[o.data.vertices[i].co for i in f.vertices];axes=sorted(range(3),key=lambda a:max(v[a] for v in co)-min(v[a] for v in co),reverse=True)
        # Texture grain runs in V. Set that direction to the board's longer axis.
        for i in f.loop_indices:
            v=o.data.vertices[o.data.loops[i].vertex_index].co;uv.data[i].uv=(v[axes[1]]/1.2+.31,v[axes[0]]/1.8+.17)
# A floor replaces the flat placeholder surface in the actual game.
bpy.context.window.scene=L
o=L.objects.get('ENV_Photo_Floor')
if o is None:
    bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name='ENV_Photo_Floor';o.scale=(8.2,3.9,.06);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(bpy.data.materials['BT2_StoneBase'])
    for f in o.data.polygons:
        for i in f.loop_indices:
            v=o.data.vertices[o.data.loops[i].vertex_index].co;o.data.uv_layers.active.data[i].uv=(v.x/1.1,v.y/1.1)
# Make source shop guests from evaluated scan poses, retaining the real store objects.
ns={};exec(compile(open(ROOT/'游戏工程/BaTian/tools/art/photo_guests.py').read().split('records=[]')[0],'posehelpers','exec'),ns)
for old in list(PHOTO.objects):
    if old.name.startswith(('GuestCore','ArmL','ArmR','LegL','LegR','PhotoScan_')):PHOTO.collection.objects.unlink(old)
for short,mode,pos,yaw in [('Eric','Idle',(-2,-1.2,0),0),('Carla','Sit',(-.35,-2.8,0),3.14159265)]:
    bpy.context.window.scene=bpy.data.scenes['PhotoScannedGuests'];rig=bpy.data.objects['PhotoGuest_'+short];ns['pose'](rig,mode,0);mesh=bpy.data.objects['PhotoGuest_'+short+'_Mesh'];d=bpy.data.meshes.new_from_object(mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()));n=bpy.data.objects.new('PhotoScan_'+short,d);PHOTO.collection.objects.link(n);n.matrix_world=mesh.matrix_world.copy();n.location=pos;n.rotation_euler.z=yaw
# Restore studio illumination appropriate to real clothes and skin; avoid orange overexposure.
for n in PHOTO.objects:
    if n.type=='LIGHT':
        if n.name=='Morning sun':n.data.energy=1.25;n.data.angle=.12
        elif n.name=='Window morning':n.data.energy=900;n.data.size=2.7;n.data.color=(1,.93,.84)
        elif n.name=='Front soft daylight':n.data.energy=400
PHOTO.view_settings.exposure=-.05;PHOTO.camera.data.lens=31;PHOTO.camera.data.dof.aperture_fstop=6.3
PHOTO.render.resolution_x=2560;PHOTO.render.resolution_y=1440;PHOTO.cycles.samples=48;PHOTO.render.filepath=str(OUT/'店铺照片效果')
# Lighten only exported copies. Keep source surfaces at 2K for future close views.
replaced=[];copies={};mods=[]
for m in bpy.data.materials:
    if not m.get('surface_revision') or not m.node_tree:continue
    for node in m.node_tree.nodes:
        if node.type!='TEX_IMAGE' or not node.image or max(node.image.size)<=1024:continue
        original=node.image;key=original.as_pointer()
        if key not in copies:
            im=original.copy();im.scale(1024,1024);im.pack();copies[key]=im
        node.image=copies[key];replaced.append((node,original))
for o in L.objects:
    if o.type!='MESH':continue
    tris=sum(len(f.vertices)-2 for f in o.data.polygons);target=18000 if 'Pot_Open' in o.name else 8000 if 'Bowl' in o.name or 'RiceGrains' in o.name else 20000 if 'Curtain' in o.name else None
    if target and tris>target:
        mod=o.modifiers.new('Game detail budget','DECIMATE');mod.ratio=target/tris;mod.use_collapse_triangulate=True;mods.append((o,mod))
ex=bpy.data.scenes.new('PhotoPropsExport');ex.name='BT2_Export';status=[]
for name in sorted([p.stem for p in (OUT/'替换前/模型').glob('*.glb') if not p.name.startswith('CHAR')]+['ENV_Photo_Floor']):
    bpy.context.window.scene=ex;o=L.objects[name];ex.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    p=OUT/'游戏模型'/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_apply=True,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=92,export_extras=True,export_cameras=False,export_lights=False)
    shutil.copy2(p,ROOT/'游戏工程/BaTian/assets/resources/models/real'/p.name);ex.collection.objects.unlink(o);status.append({'file':p.name,'bytes':p.stat().st_size})
for node,im in replaced:node.image=im
for o,mod in mods:o.modifiers.remove(mod)
bpy.context.window.scene=PHOTO;bpy.data.scenes.remove(ex);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_照片级店铺.blend'))
(OUT/'店铺替换记录.json').write_text(json.dumps({'materials':changed,'props':status},ensure_ascii=False,indent=2))
result={'materials':len(changed),'props':len(status),'file':bpy.data.filepath}
