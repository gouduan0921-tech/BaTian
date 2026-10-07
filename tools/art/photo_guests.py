"""Build licensed scanned guests, including idle, walk and seated animation."""
import bpy, math, json, shutil, numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee')
OUT=ROOT/'美术源文件/照片级改造_20261006'
GAME=ROOT/'游戏工程/BaTian/assets/resources/models/real'
S=bpy.data.scenes['PhotoScannedGuests']; bpy.context.window.scene=S
def orient(rig, name, direction):
    b=rig.pose.bones.get(name)
    if not b:return
    rest=b.bone.matrix_local
    inherited=b.parent.matrix @ b.parent.bone.matrix_local.inverted() @ rest if b.parent else rest.copy()
    turn=(inherited.to_3x3() @ Vector((0,1,0))).rotation_difference(Vector(direction).normalized())
    mat=(turn.to_matrix() @ inherited.to_3x3()).to_4x4();mat.translation=inherited.translation
    b.matrix=mat
    bpy.context.view_layer.update()
def pose(rig, mode, t):
    for b in rig.pose.bones:
        b.rotation_mode='QUATERNION';b.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    hip=rig.pose.bones['hip']; dz=48-hip.bone.head_local.z if mode=='Sit' else (math.cos(t*math.tau*2)*.5 if mode=='Walk' else math.sin(t*math.tau)*.15); hip.location=hip.bone.matrix_local.to_3x3().inverted() @ Vector((0,0,dz))
    bpy.context.view_layer.update()
    for side,sign in [('l',1),('r',-1)]:
        swing=math.sin(t*math.tau)*sign if mode=='Walk' else 0
        if mode=='Sit':
            orient(rig,'upperleg_'+side,(sign*.04,-1,.06))
            orient(rig,'lowerleg_'+side,(0,.12,-1))
            b=rig.pose.bones['foot_'+side];mat=b.bone.matrix_local.copy();mat.translation=b.matrix.translation;b.matrix=mat;bpy.context.view_layer.update()
            orient(rig,'upperarm_'+side,(sign*.12,-.30,-1))
            orient(rig,'lowerarm_'+side,(sign*-.2,-1,.4))
            orient(rig,'hand_'+side,(sign*.03,-1,-.12))
        else:
            orient(rig,'upperleg_'+side,(sign*.015,-swing*.32,-1))
            orient(rig,'lowerleg_'+side,(0,max(0,swing)*.36-swing*.12,-1))
            b=rig.pose.bones['foot_'+side];mat=b.bone.matrix_local.copy();mat.translation=b.matrix.translation;b.matrix=mat;bpy.context.view_layer.update()
            orient(rig,'upperarm_'+side,(sign*.095,swing*.19-.035,-1))
            orient(rig,'lowerarm_'+side,(sign*.03,swing*.20-.19,-1))
            orient(rig,'hand_'+side,(sign*.015,swing*.13-.13,-1))
    bpy.context.view_layer.update()
def pixels(im):
    a=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(a);return a.reshape(im.size[1],im.size[0],4)
def material(mesh, person):
    folder=OUT/'来源/人物'/('rp_'+person+'_FBX')/'tex'
    m=mesh.data.materials[0];m.name='Scanned_'+person;m.use_nodes=True
    nt=m.node_tree;nt.nodes.clear();p=nt.nodes.new('ShaderNodeBsdfPrincipled');out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(p.outputs[0],out.inputs['Surface'])
    for suffix,colorspace,socket in [('dif','sRGB','Base Color'),('norm','Non-Color','Normal')]:
        im=bpy.data.images.load(str(folder/('rp_'+person+'_'+suffix+'.jpg')),check_existing=True)
        im=im.copy();im.name='Photo2048_'+person+'_'+suffix;im.colorspace_settings.name=colorspace;im.scale(2048,2048);im.pack()
        tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im
        if suffix=='norm':
            n=nt.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.65;nt.links.new(tex.outputs['Color'],n.inputs['Color']);nt.links.new(n.outputs['Normal'],p.inputs[socket])
        else:nt.links.new(tex.outputs['Color'],p.inputs[socket])
    gloss=bpy.data.images.load(str(folder/('rp_'+person+'_gloss.jpg')),check_existing=True).copy();gloss.colorspace_settings.name='Non-Color';gloss.scale(2048,2048);gloss.pack()
    a=pixels(gloss);a[:,:,:3]=np.clip(1-a[:,:,:3],.23,.92)
    rough=bpy.data.images.new('Photo2048_'+person+'_rough',2048,2048,alpha=False);rough.colorspace_settings.name='Non-Color';rough.pixels.foreach_set(a.ravel());rough.pack()
    tx=nt.nodes.new('ShaderNodeTexImage');tx.image=rough;nt.links.new(tx.outputs['Color'],p.inputs['Roughness']);p.inputs['Metallic'].default_value=0
    m['source']='https://renderpeople.com/free-3d-people/';m['license']='Renderpeople free model; game use under sections 2.5 and 4.1(b)'
    mesh['scanned_person']=person
def build(person, short, filename):
    rig=bpy.data.objects.get('PhotoGuest_'+short)
    if rig is None:
        old=set(S.objects);f=next((OUT/'来源/人物').rglob('rp_'+person+'_zup_a.fbx'))
        bpy.ops.import_scene.fbx(filepath=str(f),automatic_bone_orientation=True)
        new=[o for o in S.objects if o not in old];rig=next(o for o in new if o.type=='ARMATURE');rig.name='PhotoGuest_'+short
        mesh=next(o for o in new if o.type=='MESH');mesh.name='PhotoGuest_'+short+'_Mesh'
    else:mesh=bpy.data.objects['PhotoGuest_'+short+'_Mesh']
    material(mesh,person);rig.hide_render=False;rig.hide_set(False);mesh.hide_render=False;mesh.hide_set(False)
    rig.animation_data_clear();rig.animation_data_create();S.render.fps=30
    for mode,length in [('Idle',60),('Walk',30),('Sit',60)]:
        action=bpy.data.actions.new('Guest'+mode+'_'+short);rig.animation_data.action=action
        for frame in range(1,length+2,3):
            S.frame_set(frame);pose(rig,mode,(frame-1)/length)
            for b in rig.pose.bones:
                b.rotation_mode='QUATERNION';b.keyframe_insert(data_path='rotation_quaternion',frame=frame);b.keyframe_insert(data_path='location',frame=frame)
        track=rig.animation_data.nla_tracks.new();track.name='Guest'+mode
        strip=track.strips.new('Guest'+mode,1,action);track.mute=True
    rig.animation_data.action=None;pose(rig,'Idle',0);S.frame_set(1)
    ex=bpy.data.scenes.new('Scan export');bpy.context.window.scene=ex;ex.name='Scene';ex.render.fps=30
    ex.collection.objects.link(rig);ex.collection.objects.link(mesh)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
    path=OUT/'游戏模型'/filename;path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_rest_position_armature=False,export_apply=False,export_tangents=True,export_image_format='JPEG',export_jpeg_quality=92,export_cameras=False,export_lights=False,export_extras=True)
    shutil.copy2(path,GAME/filename)
    bpy.context.window.scene=S;bpy.data.scenes.remove(ex)
    return {'person':person,'rig':rig.name,'file':filename,'bytes':path.stat().st_size,'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons)}
records=[]
for p,short,file in [('eric_rigged_001','Eric','CHAR_Common_Guest_A.glb'),('carla_rigged_001','Carla','CHAR_Photo_Guest_B.glb'),('claudia_rigged_002','Claudia','CHAR_Photo_Guest_C.glb')]:records.append(build(p,short,file))
(OUT/'人物导入记录.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_照片级店铺.blend'))
result={"guests":records}
