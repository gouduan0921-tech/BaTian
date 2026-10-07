"""Replace the remaining simple hero shapes with licensed professional props."""
import bpy, json, math, numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/照片级改造_20261006';PH=OUT/'来源/PolyHaven';LIB=bpy.data.scenes['BaTian_Realism_Assets'];PHOTO=bpy.data.scenes['粥霸天_晨光写实店铺.001'];S=bpy.data.scenes.new('ProfessionalProps');bpy.context.window.scene=S
records=[]
for asset,name in [('chinese_tea_table','PROP_WarmWood_Table_A'),('chinese_stool','PROP_WarmWood_Stool_A'),('potted_plant_01','PROP_WarmWood_Plant_A'),('ceramic_vase_02','PROP_MorningWhite_Vase_Porcelain')]:
    bpy.context.window.scene=S;old=LIB.objects[name];old_data=old.data;target=old.dimensions.copy();before=set(S.objects)
    bpy.ops.import_scene.gltf(filepath=str(PH/asset/(asset+'_2k.gltf')))
    objs=[o for o in S.objects if o not in before];object_names=[o.name for o in objs];meshes=[o for o in objs if o.type=='MESH']
    for o in meshes:
        matrix=o.matrix_world.copy();o.parent=None;o.data.transform(matrix);o.matrix_world=Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();new=bpy.context.object
    co=[v.co.copy() for v in new.data.vertices];low=Vector([min(v[i] for v in co) for i in range(3)]);hi=Vector([max(v[i] for v in co) for i in range(3)]);dims=hi-low
    base_height=max(v.co.z for f in old_data.polygons if old_data.materials[f.material_index].name in ['BT2_WarmPorcelain','BT2_CobaltGlaze'] for v in [old_data.vertices[i] for i in f.vertices]) if 'Vase' in name else target.z
    scale=Vector((target.x/dims.x,target.y/dims.y,base_height/dims.z))
    if asset=='potted_plant_01':scale=Vector((target.z/dims.z,)*3)
    for v in new.data.vertices:v.co=Vector(((v.co.x-(low.x+hi.x)/2)*scale.x,(v.co.y-(low.y+hi.y)/2)*scale.y,(v.co.z-low.z)*scale.z))
    if 'Vase' in name:
        import bmesh
        bm=bmesh.new();bm.from_mesh(old_data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if old_data.materials[f.material_index].name not in ['BT2_Stem','BT2_SmallFlower']],context='FACES')
        data=bpy.data.meshes.new('Original flower branches');bm.to_mesh(data);bm.free()
        for m in old_data.materials:data.materials.append(m)
        flowers=bpy.data.objects.new('Vase flowers retained',data);S.collection.objects.link(flowers);bpy.ops.object.select_all(action='DESELECT');flowers.select_set(True);new.select_set(True);bpy.context.view_layer.objects.active=new;bpy.ops.object.join()
    new.data.name=old_data.name+'_Professional';new['source']='https://polyhaven.com/a/'+asset;new['license']='CC0'
    for m in new.data.materials:m['source']='https://polyhaven.com/a/'+asset;m['license']='CC0'
    for o in list(bpy.data.objects):
        if o.type=='MESH' and o.data==old_data:o.data=new.data
    old['professional_model_source']='https://polyhaven.com/a/'+asset;old['surface_license']='CC0'
    records.append({'asset':name,'source':old['professional_model_source'],'sourceTriangles':sum(len(f.vertices)-2 for f in new.data.polygons),'dimensions':list(old.dimensions)})
    for oname in object_names:
        o=bpy.data.objects.get(oname)
        if o is not None and o!=new:bpy.data.objects.remove(o,do_unlink=True)
    S.collection.objects.unlink(new)
    # Preserve the detailed editable object in the library and the photographic scene.
    replaced=[];copies={}
    for m in new.data.materials:
        if not m.node_tree:continue
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE' and n.image and max(n.image.size)>1024:
                original=n.image;k=original.as_pointer()
                if k not in copies:
                    im=original.copy();im.scale(1024,1024);im.pack();copies[k]=im
                n.image=copies[k];replaced.append((n,original))
    ex=bpy.data.scenes.new('PhotoProp export');ex.name='BT2_Export';bpy.context.window.scene=ex;ex.collection.objects.link(old);old.select_set(True);bpy.context.view_layer.objects.active=old
    mod=None;tris=sum(len(f.vertices)-2 for f in old.data.polygons)
    if tris>18000:mod=old.modifiers.new('Game plant detail budget','DECIMATE');mod.ratio=18000/tris;mod.use_collapse_triangulate=True
    p=OUT/'游戏模型'/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_apply=True,export_tangents=True,export_extras=True,export_image_format='AUTO',export_jpeg_quality=92,export_cameras=False,export_lights=False)
    (ROOT/'游戏工程/BaTian/assets/resources/models/real'/p.name).write_bytes(p.read_bytes());records[-1]['gameBytes']=p.stat().st_size
    if mod:old.modifiers.remove(mod)
    for n,im in replaced:n.image=im
    bpy.context.window.scene=S;bpy.data.scenes.remove(ex)
bpy.context.window.scene=PHOTO;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_照片级店铺.blend'))
(OUT/'专业陈设替换记录.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
result={'professionalProps':records}
