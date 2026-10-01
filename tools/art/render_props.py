import bpy, math
from mathutils import Vector
from pathlib import Path
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee')
library=bpy.data.scenes['BaTian_RealProps']
for old in list(bpy.data.scenes):
    if old.name.startswith('BaTian_ShopPreview'):
        for obj in list(old.objects): bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(old)
scene=bpy.data.scenes.new('BaTian_ShopPreview')
bpy.context.window.scene=scene
scene.world=bpy.data.worlds.new('ShopNight'); scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.055,.095,.10,1); bg.inputs[1].default_value=.45
def prop(name,pos,rot=0,scale=1):
    original=library.objects[name]
    o=original.copy(); o.data=original.data; scene.collection.objects.link(o)
    o.location=pos; o.rotation_euler=(0,0,math.radians(rot)); o.scale=(scale,scale,scale); o.hide_set(False)
    return o
def box(name,pos,dim,col):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object; o.name=name; o.scale=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); p.inputs['Base Color'].default_value=(*col,1); p.inputs['Roughness'].default_value=.8
    o.data.materials.append(m)
    b=o.modifiers.new('Worn edge','BEVEL'); b.width=.015; b.segments=2
    return o
box('Platform',(0,0,-.17),(11,8,.3),(.11,.14,.13))
for x in range(-5,6):
    for y in range(-4,4): box('Paving',(x,y,-.012),(.97,.97,.034),(.16,.18,.16))
box('Oak floor',(0,1.2,.022),(8.2,3.9,.05),(.20,.10,.04))
prop('ENV_WarmWood_Wall_Back',(0,3.12,0))
prop('ENV_WarmWood_Wall_Side',(-4.12,1.08,0),90)
prop('ENV_WarmWood_Wall_Side',(4.12,1.08,0),-90)
for x in [-4.12,4.12]:
    for y in [-.95,3.12]: prop('ENV_WarmWood_Post_A',(x,y,0))
prop('PROP_Common_BackCounter_A',(0,2.05,0))
prop('PROP_WarmWood_FrontCounter_A',(-.2,-.55,0))
prop('PROP_WarmWood_Sign_A',(.5,3.02,1.97))
prop('PROP_WarmWood_Shelf_Jars',(-.3,2.92,1.755))
prop('PROP_Common_PrepBoard_A',(-3.2,2.05,.87))
prop('PROP_Common_BowlStack_A',(3.25,2.05,.87))
for i,x in enumerate([-1.95,-.65,.65,1.95]):
    prop('PROP_Common_CharcoalStove_A',(x,2.05,.870),scale=.9)
    prop('PROP_Common_Pot_Open',(x,2.05,1.239),scale=.9)
    prop('FOOD_Common_PlainCongee',(x,2.05,1.485),scale=.9)
for x in [-1.5,0,1.5]: prop('PROP_WarmWood_Tray_A',(x,-.55,1))
for x in [-3,-.6,1.8]:
    prop('PROP_WarmWood_Table_A',(x,-2.05,0))
    prop('PROP_WarmWood_Stool_A',(x,-2.55,0))
    prop('PROP_Common_Bowl_A',(x,-2.05,.765),scale=.4)
    prop('FOOD_Common_PlainCongee',(x,-2.05,.834),scale=.4)
for x,y,s in [(-4.6,-1.4,1),(4.6,-1.6,1.1),(-3.6,2.45,.6),(2.6,2.5,.55)]: prop('PROP_WarmWood_Plant_A',(x,y,0 if s>=1 else .87),scale=s)
for x in [-4.12,4.12]: prop('PROP_WarmWood_Lamp_Paper',(x,-1.08,1.75),scale=.5)
for x in [-2.3,2.6]: prop('PROP_Common_WallLamp_A',(x,2.77,2.50),scale=.7)
def light(name,pos,energy,color,size=3):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.color=color; data.shape='DISK'; data.size=size
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o); o.location=pos
    o.rotation_euler=(Vector((0,.6,.8))-o.location).to_track_quat('-Z','Y').to_euler()
light('Warm softbox',(-3,-4,8),1700,(1,.68,.38),6)
light('Cool evening',(7,3,7),1400,(.42,.68,1),6)
light('Lantern bounce',(0,2,5),1100,(1,.78,.48),4)
camera=bpy.data.cameras.new('PreviewCamera'); o=bpy.data.objects.new('PreviewCamera',camera); scene.collection.objects.link(o)
o.location=(10,-14,12); o.rotation_euler=(Vector((0,.25,1))-o.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO'; camera.ortho_scale=14.8; scene.camera=o
scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=1500; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'效果图/模型验收/Blender店铺预览.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'美术源文件/正式物件/BaTian_RealProps.blend'))
# Render is deferred so MCP keeps responding during a long render.
def render():
    bpy.ops.render.render(write_still=True)
    return None
bpy.app.timers.register(render,first_interval=1)
result={'preview':scene.render.filepath,'scene':scene.name,'objects':len(scene.objects)}
