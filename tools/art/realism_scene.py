"""Assemble a photographic interior from the actual revised game models in Blender."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/liweng/Downloads/3D/BaTian Congee');OUT=ROOT/'美术源文件/写实改造_20261005';LIB=bpy.data.scenes['BaTian_Realism_Assets']
scene=bpy.data.scenes.new('粥霸天_晨光写实店铺');bpy.context.window.scene=scene;scene.unit_settings.system='METRIC'
def find(name):
 o=LIB.objects.get(name)
 if o is None:raise ValueError(name)
 return o
def prop(name,pos,rot=0,scale=1):
 old=find(name);o=old.copy();o.data=old.data;scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(0,0,math.radians(rot));o.scale=(scale,)*3;o.hide_set(False);return o
def solid(name,pos,size,col,rough=.8):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);m=bpy.data.materials.new(name);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;o.data.materials.append(m);b=o.modifiers.new('Worn edges','BEVEL');b.width=.008;b.segments=3;return o
# Ground and full back/side architecture, with independently positioned game props.
solid('Foundation',(0,.5,-.10),(8.7,7.5,.19),(.25,.235,.205))
for x in range(-5,6):
 for y in range(-5,4):
  solid('Worn stone paving',(x*.82,y*.82,.002),(.809,.809,.025),(.36+.015*((x*7+y*3)%4),.34,.30),.87)
prop('ENV_WarmWood_Wall_Back',(0,3.12,0));prop('ENV_WarmWood_Wall_Side',(-4.12,1.08,0),90);prop('ENV_WarmWood_Wall_Side',(4.12,1.08,0),-90)
for x in [-4.12,4.12]:
 for y in [-1.1,3.12]:prop('ENV_WarmWood_Post_A',(x,y,0))
prop('PROP_Common_BackCounter_A',(0,2.05,0));prop('PROP_WarmWood_FrontCounter_A',(-.2,-.55,0));prop('PROP_WarmWood_Sign_A',(.5,3.025,1.97));prop('PROP_WarmWood_Shelf_Jars',(-.3,2.92,1.55));prop('PROP_Common_PrepBoard_A',(-3.2,2.05,.87));prop('PROP_Common_BowlStack_A',(3.25,2.05,.87))
for i,x in enumerate([-1.95,-.65,.65,1.95]):
 prop('PROP_Common_CharcoalStove_A',(x,2.05,.870),scale=.9);prop('PROP_Common_Pot_Open',(x,2.05,1.239),scale=.9);prop('FOOD_Common_PlainCongee',(x,2.05,1.485),scale=.9);prop('FOOD_Common_RiceGrains',(x,2.05,1.49),scale=.9)
for x in [-1.5,0,1.5]:prop('PROP_WarmWood_Tray_A',(x,-.55,1))
for x,y in [(-2.8,-2.0),(-.35,-2.2),(2.1,-2.0)]:
 prop('PROP_WarmWood_Table_A',(x,y,0));prop('PROP_WarmWood_Stool_A',(x,y-.6,0));prop('PROP_Common_Bowl_A',(x,y,.766),scale=.40);prop('FOOD_Common_PlainCongee',(x,y,.834),scale=.40)
for x,y,s in [(-3.5,-1.1,1),(3.5,-1.1,1),(-3.6,2.45,.6),(2.6,2.5,.55)]:prop('PROP_WarmWood_Plant_A',(x,y,0 if s==1 else .87),scale=s)
prop('PROP_WarmWood_Curtain_A',(-3.45,-1.15,1.80));prop('PROP_MorningWhite_Window_Morning',(-3.99,1.0,1.3),90);prop('PROP_WarmWood_Scallion_Sill',(-3.83,.85,1.12),scale=.7);prop('PROP_MorningWhite_Pot_Mint',(-3.76,1.9,1.12),scale=.5)
for x in [-3,2.7]:prop('PROP_Common_WallLamp_A',(x,2.80,2.45),scale=.7)
prop('PROP_WarmWood_Lamp_Paper',(-2,-.05,2.15),scale=.65);prop('PROP_NightBlue_Chime_Brass',(-3.4,-.95,2.6));prop('PROP_NightBlue_MenuBoard_A',(2.9,-.55,1),scale=.8);prop('PROP_MorningWhite_Vase_Porcelain',(-2.65,-.55,1),scale=.6)
for name,x in [('PROP_Season_Stand_Yam',-2.8),('PROP_Season_Stand_Pork',-2.1),('PROP_Season_Stand_Shepherd',-1.4),('PROP_Season_Stand_MungBean',-.7)]:prop(name,(x,-.55,1.01),scale=1.1)
# Natural standing customer, existing limb origin names remain animation-compatible.
for name in ['GuestCore','ArmL','ArmR','LegL','LegR']:
 old=LIB.objects.get(name)
 if not old:continue
 o=old.copy();o.data=old.data;scene.collection.objects.link(o);o.location=old.location+Vector((-1.65,-1.5,0));o.rotation_euler=old.rotation_euler;o.hide_set(False)
 if name=='ArmL':o.rotation_euler[0]=math.radians(-9)
 if name=='ArmR':o.rotation_euler[0]=math.radians(13)
# A real opening and soft morning illumination for the offline photographic view.
wall=next(o for o in scene.objects if o.name.startswith('ENV_WarmWood_Wall_Side'))
wall.data=wall.data.copy();cut=solid('Window aperture cutter',(-4.12,1,1.83),(.9,1.50,1.16),(.1,.1,.1));mod=wall.modifiers.new('Actual window opening','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
bpy.context.view_layer.objects.active=wall;wall.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);cut.hide_render=True;cut.hide_set(True)
world=bpy.data.worlds.new('Soft morning sky');world.use_nodes=True;next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.66,.75,.86,1);next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[1].default_value=.30;scene.world=world
def area(name,pos,target,power,col,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='RECTANGLE';d.size=size;d.size_y=size*.75;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
area('Window morning',(-5.5,1,3.5),(0,1,.6),1250,(1,.87,.70),2.0);area('Front soft daylight',(1,-4.0,4),(0,1,1.2),650,(.82,.89,1),5);area('Lantern bounce',(-2,-.05,2.8),(-1,1,0),90,(1,.65,.32),1.2)
d=bpy.data.lights.new('Morning sun','SUN');d.energy=2.2;d.angle=.08;d.color=(1,.88,.71);o=bpy.data.objects.new('Morning sun',d);scene.collection.objects.link(o);o.rotation_euler=(math.radians(34),math.radians(-40),math.radians(-68))
# Subtle steam; surface geometry stays visible and the full source remains editable.
for x in [-1.95,-.65,.65,1.95]:
 o=solid('Steam volume',(x,2.05,1.77),(.4,.4,.52),(1,1,1));m=bpy.data.materials.new('Steam haze');m.use_nodes=True;nt=m.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');vol=nt.nodes.new('ShaderNodeVolumePrincipled');vol.inputs['Density'].default_value=.07;vol.inputs['Color'].default_value=(.87,.86,.82,1);nt.links.new(vol.outputs['Volume'],out.inputs['Volume']);o.data.materials.clear();o.data.materials.append(m)
c=bpy.data.cameras.new('Shop photographic camera');cam=bpy.data.objects.new('Shop photographic camera',c);scene.collection.objects.link(cam);cam.location=(3.1,-5.7,2.75);target=Vector((-.35,1.2,1.45));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();c.lens=29;c.dof.use_dof=True;c.dof.focus_distance=(Vector((0,1.95,1.45))-cam.location).length;c.dof.aperture_fstop=5.6;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.cycles.adaptive_threshold=.06;scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.20;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'晨光店铺_预览.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'粥霸天_写实店铺.blend'))
result={'scene':scene.name,'objects':len(scene.objects),'file':bpy.data.filepath,'render':scene.render.filepath,'binary':bpy.app.binary_path}
