"""Run in the connected Blender through MCP. All exported origins are bottom centre."""
import bpy, bmesh, math, json, os, random
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path('/Users/liweng/Downloads/3D/BaTian Congee')
DEST = ROOT / '游戏工程/BaTian/assets/resources/models/real'
SOURCE = ROOT / '美术源文件/正式物件'
DEST.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
# Clean only scenes authored by this script on earlier attempts.
for old_scene in list(bpy.data.scenes):
    if old_scene.name.startswith('BaTian_RealProps'):
        for obj in list(old_scene.objects): bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(old_scene)
for mat in list(bpy.data.materials):
    if mat.name.startswith('BT_') and mat.users==0: bpy.data.materials.remove(mat)
scene = bpy.data.scenes.new('BaTian_RealProps')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
assets = {}
parts = []
rng = random.Random(47)

def material(name, col, rough=.65, metal=0, texture=None, glow=0):
    m = bpy.data.materials.new('BT_' + name)
    m.diffuse_color = (*col, 1)
    m.use_nodes = True
    p = next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if p is None:
        p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out=m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*col,1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if glow:
        p.inputs['Emission Color'].default_value = (*col,1)
        p.inputs['Emission Strength'].default_value = glow
    if texture:
        n = 256
        yy, xx = np.mgrid[0:n,0:n] / n
        noise = np.random.default_rng(71).random((n,n))
        if texture == 'wood':
            v = .8 + .11*np.sin(xx*180 + 3*np.sin(yy*14)) + .06*np.sin(xx*520 + np.sin(yy*40)) + .04*noise
        elif texture == 'cloth':
            v = .84 + .1*np.sin(xx*math.pi*120)*np.sin(yy*math.pi*120) + .06*noise
        else:
            v = .87 + .12*noise + .025*np.sin(xx*120)*np.sin(yy*80)
        pixels = np.ones((n,n,4),dtype=np.float32)
        for i in range(3): pixels[:,:,i]=col[i]*v
        im = bpy.data.images.new('BT_'+name+'_B',width=n,height=n)
        im.pixels.foreach_set(pixels.ravel())
        im.filepath_raw = str(SOURCE/(name+'_B.png'))
        im.file_format = 'PNG'
        im.save()
        im.pack()
        t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=im
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    return m

wood = material('WornOak',(.42,.235,.105),.68,texture='wood')
lightwood = material('HoneyOak',(.64,.405,.19),.6,texture='wood')
darkwood = material('SmokedOak',(.115,.083,.065),.65,texture='wood')
plaster = material('LimePlaster',(.75,.68,.53),.95,texture='stone')
tile = [material('JadeTile'+str(i),(.10+i*.012,.22+i*.012,.165+i*.009),.4) for i in range(4)]
grout = material('Grout',(.27,.31,.25),.97,texture='stone')
iron = material('SeasonedIron',(.037,.032,.026),.78,.38,texture='stone')
steel = material('BrushedSteel',(.36,.36,.32),.52,.66)
brass = material('AgedBrass',(.48,.29,.10),.47,.7)
ceramic = material('CeladonGlaze',(.53,.65,.49),.24)
white = material('WarmPorcelain',(.83,.8,.69),.19)
terra = material('Terracotta',(.48,.255,.135),.88,texture='stone')
blue = material('IndigoGlaze',(.035,.073,.14),.22)
cloth = material('Linen',(.60,.41,.22),.95,texture='cloth')
bluecloth = material('IndigoLinen',(.07,.13,.20),.96,texture='cloth')
paper = material('RicePaper',(.84,.69,.40),.87,texture='cloth',glow=.18)
leaf = material('Leaf',(.11,.27,.065),.75)
leaf2 = material('YoungLeaf',(.23,.40,.105),.78)
soil = material('Soil',(.06,.035,.018),1)
gold = material('LetterGold',(.73,.53,.23),.5,.3,glow=.22)
ember = material('CoalEmber',(.45,.11,.02),1,glow=.4)
chalk = material('Chalk',(.76,.73,.59),1)

def use(o, name, mat):
    o.name = name
    o.data.materials.append(mat)
    parts.append(o)
    return o

def box(name, pos, dim, mat, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=use(bpy.context.object,name,mat); o.scale=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft worn edges','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def lathe(name, profile, mat, pos=(0,0,0), seg=32):
    vertices=[]; faces=[]
    for r,z in profile:
        vertices.extend([(pos[0]+r*math.cos(2*math.pi*k/seg),pos[1]+r*math.sin(2*math.pi*k/seg),pos[2]+z) for k in range(seg)])
    for j in range(len(profile)-1):
        for k in range(seg):
            a=j*seg+k; b=j*seg+(k+1)%seg
            faces.append((a,b,b+seg,a+seg))
    me=bpy.data.meshes.new(name); me.from_pydata(vertices,[],faces); me.update()
    o=bpy.data.objects.new(name,me); scene.collection.objects.link(o); use(o,name,mat)
    uv=me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            vi=me.loops[li].vertex_index
            uv.data[li].uv=((vi%seg)/seg,(vi//seg)/(len(profile)-1))
    return o

def rod(name, a, b, radius, mat, verts=12):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=(b-a).length,location=(a+b)/2)
    o=use(bpy.context.object,name,mat); o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    for p in o.data.polygons: p.use_smooth=len(p.vertices)==4
    return o

def torus(name, pos, radius, minor, mat, rotation=(0,0,0), seg=32):
    bpy.ops.mesh.primitive_torus_add(major_segments=seg,minor_segments=8,location=pos,major_radius=radius,minor_radius=minor,rotation=rotation)
    o=use(bpy.context.object,name,mat)
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    for p in o.data.polygons: p.use_smooth=True
    return o

def text(body, pos, size, mat, rotation=(math.pi/2,0,0)):
    c=bpy.data.curves.new('Lettering','FONT'); c.body=body; c.size=size; c.align_x='CENTER'; c.extrude=.0015; c.resolution_u=4
    c.font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
    o=bpy.data.objects.new('Lettering',c); scene.collection.objects.link(o); o.location=pos; o.rotation_euler=rotation
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH'); o=bpy.context.object; use(o,'Lettering',mat)
    return o

def finish(name):
    global parts
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    o=bpy.context.object; o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mn=Vector((min(v.co.x for v in o.data.vertices),min(v.co.y for v in o.data.vertices),min(v.co.z for v in o.data.vertices)))
    mx=Vector((max(v.co.x for v in o.data.vertices),max(v.co.y for v in o.data.vertices),max(v.co.z for v in o.data.vertices)))
    shift=Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
    for v in o.data.vertices: v.co-=shift
    bm=bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.000001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data); bm.free()
    o.data.validate(clean_customdata=False)
    o.data.update(); bpy.context.view_layer.update()
    o.data.calc_loop_triangles()
    tri=len(o.data.loop_triangles)
    o['unit']='metre'; o['origin']='bottom centre'; o['asset_id']=name
    bpy.ops.export_scene.gltf(filepath=str(DEST/(name+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_materials='EXPORT')
    assets[name]={'triangles':tri,'dimensions':[round(x,5) for x in o.dimensions], 'file':str(DEST/(name+'.glb')),'object':o.name}
    o.hide_set(True); parts=[]
    return o

def bowl(mat, rim=ceramic, radius=.38,height=.20,seg=28):
    foot=radius*.29
    lathe('Hollow glazed bowl',[(0,0),(foot,0),(foot*1.08,height*.125),(radius*.42,height*.225),(radius*.70,height*.5),(radius,height-.014),(radius,height),(radius-.018,height),(radius*.70-.012,height*.5),(radius*.39,height*.285),(0,height*.285)],mat,seg=seg)
    torus('Glazed lip',(0,0,height-.009),radius-.005,.008,rim,seg=seg)

def table(kind, mat):
    h=.765
    if kind=='round':
        lathe('Round tabletop',[(0,h-.05),(.40,h-.05),(.42,h-.04),(.42,h-.008),(.40,h),(0,h)],mat)
        legs=[(-.25,-.25),(-.25,.25),(.25,-.25),(.25,.25)]
    else:
        w=.82 if kind=='square' else 1.02
        for i in range(4): box('Separate oak plank',(-w/2+(i+.5)*w/4,0,h-.026),(w/4-.003,.56,.052),mat,.007)
        legs=[(-w/2+.07,-.21),(-w/2+.07,.21),(w/2-.07,-.21),(w/2-.07,.21)]
    for x,y in legs:
        rod('Tapered table leg',(x*1.06,y*1.06,0),(x,y,h-.04),.029,mat,8)
    box('Apron',(0,-.22,h-.10),(.68,.045,.12),mat)
    box('Apron',(0,.22,h-.10),(.68,.045,.12),mat)

def stool():
    lathe('Oak stool seat',[(0,.425),(.17,.425),(.19,.435),(.19,.465),(.18,.47),(0,.47)],lightwood,seg=24)
    for k in range(3):
        a=k*math.tau/3
        rod('Splayed stool leg',(.15*math.cos(a),.15*math.sin(a),0),(.12*math.cos(a),.12*math.sin(a),.44),.024,wood,8)
    torus('Footrest',(0,0,.16),.13,.014,wood,seg=24)

def plant(mint=False, scallion=False, flower=False):
    mat=white if mint or flower else terra
    lathe('Hollow flowerpot',[(0,0),(.11,0),(.13,.02),(.17,.25),(.18,.25),(.18,.28),(.155,.28),(.14,.24),(0,.24)],mat,seg=24)
    lathe('Earth',[(0,.249),(.145,.249)],soil,seg=24)
    if scallion:
        for i in range(12):
            x,y=rng.uniform(-.075,.075),rng.uniform(-.075,.075)
            rod('Scallion leaf',(x,y,.24),(x+rng.uniform(-.06,.06),y+rng.uniform(-.06,.06),.52+rng.random()*.18),.008,leaf2,6)
    else:
        for k in range(8):
            a=k*2.4; z=.38+k*.055
            end=(.14*math.cos(a),.14*math.sin(a),z)
            rod('Stem',(0,0,.24),end,.006,leaf,6)
            vs=[end,(end[0]+.09*math.cos(a+.7),end[1]+.09*math.sin(a+.7),z+.07),(end[0]+.17*math.cos(a),end[1]+.17*math.sin(a),z+.09),(end[0]+.09*math.cos(a-.7),end[1]+.09*math.sin(a-.7),z+.07),(end[0]+.085*math.cos(a),end[1]+.085*math.sin(a),z+.09)]
            me=bpy.data.meshes.new('Leaf'); me.from_pydata(vs,[],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
            o=bpy.data.objects.new('Leaf',me); scene.collection.objects.link(o); use(o,'Leaf',leaf2 if k%2 else leaf)

def jar():
    lathe('Storage jar',[(0,0),(.10,0),(.13,.02),(.15,.14),(.13,.23),(.09,.26),(.09,.29),(.07,.29),(.07,.25),(.12,.20),(.12,.04),(0,.04)],ceramic,seg=24)
    lathe('Oak lid',[(0,.29),(.105,.29),(.105,.31),(.035,.315),(.035,.33),(0,.33)],wood,seg=24)

def lamp(brass_lamp=False, door=False):
    if brass_lamp:
        lathe('Copper shade',[(.05,.14),(.16,.20),(.22,.32),(.21,.34),(.04,.35)],brass,seg=32)
        rod('Lamp stem',(0,0,.0),(0,0,.28),.015,brass)
        lathe('Lamp base',[(0,0),(.09,0),(.10,.02),(.08,.04),(0,.04)],darkwood)
        lathe('Warm bulb',[(0,.16),(.045,.16),(.05,.21),(.025,.24),(0,.24)],paper,seg=16)
    else:
        profile=[(0,0),(.10,0),(.10,.06),(.19,.10),(.25,.24),(.26,.4),(.23,.55),(.13,.65),(.10,.66),(.10,.70),(0,.70)]
        lathe('Pleated rice paper',profile,paper,seg=48)
        for z,r in [(.06,.10),(.12,.2),(.22,.245),(.34,.26),(.46,.25),(.57,.22),(.65,.12)]: torus('Bamboo rib',(0,0,z),r,.006,lightwood,seg=32)
        for k in range(4):
            a=k*math.pi/2
            rod('Bamboo spine',(.12*math.cos(a),.12*math.sin(a),.05),(.12*math.cos(a),.12*math.sin(a),.65),.005,wood,8)
        torus('Suspension loop',(0,0,.74),.033,.005,iron,(math.pi/2,0,0),16)

def wall(length):
    box('Grout backing',(0,0,.56),(length,.13,1.12),grout)
    n=round(length/.55)
    for row in range(6):
        for col in range(n):
            w=length/n
            box('Hand glazed jade tile',(-length/2+(col+.5)*w,-.072,(row+.5)*1.12/6),(w-.012,.03,1.12/6-.009),tile[(row+col)%4],.004)
    box('Lime plaster',(0,0,2.065),(length,.115,1.87),plaster,.008)
    box('Oak dado rail',(0,-.018,1.16),(length,.17,.07),wood)
    box('Oak beam',(0,0,3.09),(length+.3,.24,.18),darkwood)

def counter(front=False,mat=wood,trim=tile[1],width=None):
    w=width or (7 if front else 8.05); h=1 if front else .87
    box('Counter carcass',(0,0,(h-.08)/2),(w-.06,.60 if front else .94,h-.08),trim)
    n=14 if front else 8
    for k in range(n):
        x=-w/2+(k+.5)*w/n
        if front:
            for row in range(4): box('Front glazed tile',(x,-.311,.15+row*.185),(w/n-.012,.026,.172),tile[(row+k)%4],.003)
        else:
            box('Panelled cabinet door',(x,-.481,.37),(w/n-.05,.025,.60),steel,.008)
            rod('Brass cabinet pull',(x-.13,-.508,.62),(x+.13,-.508,.62),.011,brass)
    for k in range(6 if front else 1):
        dep=.72 if front else 1
        box('Countertop',(0,-dep/2+(k+.5)*dep/(6 if front else 1),h-.035),(w,dep/(6 if front else 1)-.002,.07),mat,.009)
    box('Lower plinth',(0,-.315,.05),(w-.10,.035,.07),darkwood)

def stove(mat=terra):
    lathe('Fired clay bottom',[(0,0),(.55,0),(.55,.025),(0,.025)],mat,seg=48)
    for row in range(3):
        for k in range(20):
            angle=(k+.5)*math.tau/20+(math.pi/20 if row%2 else 0)
            if row<2 and math.sin(angle)<-.92: continue
            vs=[]
            for z in [.026+row*.117,.026+row*.117+.111]:
                for r,a in [(.435,angle-.149),(.55,angle-.149),(.55,angle+.149),(.435,angle+.149)]:
                    vs.append((r*math.cos(a),r*math.sin(a),z))
            me=bpy.data.meshes.new('Kiln brick'); me.from_pydata(vs,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]); me.update()
            o=bpy.data.objects.new('Individual fired brick',me); scene.collection.objects.link(o); use(o,'Individual fired brick',mat)
    torus('Stove top lip',(0,0,.38),.49,.028,mat,seg=40)
    for k in range(8):
        a=k*math.tau/8
        box('Charcoal',(math.cos(a)*.27,math.sin(a)*.27,.12),(.12,.10,.07),ember if k%3==0 else iron,.014)
    for k in range(3):
        a=k*math.tau/3
        box('Pot support',(.45*math.cos(a),.45*math.sin(a),.39),(.10,.10,.04),iron,.004)

def curtain(mat):
    rod('Wood curtain rod',(-.6,0,.74),(.6,0,.74),.024,wood)
    for panel in [-1,1]:
        vs=[]; fs=[]; nx=16; nz=6
        for j in range(nz+1):
            for i in range(nx+1):
                x=panel*.275+(i/nx-.5)*.52
                z=j/nz*.68+.025*math.cos(i*math.pi/4)*(1-j/nz)
                vs.append((x,.028*math.sin(i*math.pi/2),z))
        for j in range(nz):
            for i in range(nx):
                a=j*(nx+1)+i; fs.append((a,a+1,a+nx+2,a+nx+1))
        me=bpy.data.meshes.new('CurtainFold'); me.from_pydata(vs,[],fs); me.update()
        o=bpy.data.objects.new('Split linen noren',me); scene.collection.objects.link(o); use(o,'Split linen noren',mat)
        uv=me.uv_layers.new()
        for p in me.polygons:
            for li in p.loop_indices:
                vi=me.loops[li].vertex_index; uv.data[li].uv=((vi%(nx+1))/nx,(vi//(nx+1))/nz)
        box('Stitched bottom hem',(panel*.275,0,.015),(.52,.015,.025),mat,.002)
    text('粥',(-.26,-.04,.32),.18,gold)
    text('香',(.26,-.04,.32),.18,gold)

def window():
    for x in [-.75,.75]: box('White window stile',(x,0,.55),(.06,.10,1.10),white)
    for z in [.03,1.07]: box('White window rail',(0,0,z),(1.56,.10,.06),white)
    box('Morning glass',(0,.035,.55),(1.44,.02,.98),paper,.001)
    for x in [-.25,.25]: box('Slim mullion',(x,-.012,.55),(.025,.06,1.02),lightwood,.003)
    box('Window sill',(0,-.07,.02),(1.68,.23,.04),lightwood)

# Fixed store architecture and workstation objects.
wall(8.3); finish('ENV_WarmWood_Wall_Back')
wall(4.2); finish('ENV_WarmWood_Wall_Side')
box('Post',(0,0,1.60),(.26,.26,3.20),darkwood)
box('Post foot',(0,0,.06),(.34,.34,.12),wood)
box('Post capital',(0,0,3.26),(.34,.34,.12),wood)
finish('ENV_WarmWood_Post_A')
counter(False,white,steel); finish('PROP_Common_BackCounter_A')
counter(True); finish('PROP_WarmWood_FrontCounter_A')
stove(); finish('PROP_Common_CharcoalStove_A')
box('Tray floor',(0,0,.012),(1.10,.50,.024),wood)
for y in [-.235,.235]: box('Raised tray rail',(0,y,.036),(1.10,.03,.048),lightwood)
for x in [-.535,.535]: box('Raised tray end',(x,0,.036),(.03,.44,.048),lightwood)
finish('PROP_WarmWood_Tray_A')
table('square',lightwood); finish('PROP_WarmWood_Table_A')
stool(); finish('PROP_WarmWood_Stool_A')
box('Carved sign backing',(0,0,.48),(3.45,.08,.96),wood,.025)
box('Dark inset',(0,-.045,.48),(3.28,.025,.79),darkwood,.01)
for z in [.04,.92]: box('Brass line',(0,-.066,z),(3.32,.008,.012),brass,.002)
text('粥霸天',(.28,-.070,.28),.54,gold)
lathe('Bowl emblem',[(0,0),(.11,0),(.21,.13),(.22,.15),(.20,.16),(.09,.035),(0,.035)],gold,pos=(-1.1,-.02,.37),seg=20)
finish('PROP_WarmWood_Sign_A')
box('Wall shelf',(0,0,.025),(6.2,.3,.05),wood)
for x in [-2.5,0,2.5]: box('Shelf bracket',(x,.03,.015),(.05,.22,.08),iron)
for k in range(11):
    old=len(parts); jar()
    for o in parts[old:]: o.location.x+=-2.8+k*.56; o.location.z+=.05
finish('PROP_WarmWood_Shelf_Jars')
box('Chopping board',(0,0,.025),(.9,.50,.05),lightwood,.022)
box('Cleaver blade',(.1,-.1,.066),(.27,.11,.014),steel,.003)
box('Cleaver handle',(.30,-.1,.069),(.17,.036,.04),darkwood)
for k in range(3):
    old=len(parts); bowl(white,white,.095,.06)
    for o in parts[old:]: o.location.x+=-.27+k*.27; o.location.y+=.18; o.location.z+=.05
finish('PROP_Common_PrepBoard_A')
box('Bowl shelf tray',(0,0,.02),(.95,.60,.04),wood)
for x,y in [(-.24,-.08),(.18,-.08),(-.04,.2)]:
    for j in range(3):
        old=len(parts); bowl(white,ceramic,.14,.07,seg=16)
        for o in parts[old:]: o.location+=Vector((x,y,.04+j*.05))
finish('PROP_Common_BowlStack_A')
plant(); finish('PROP_WarmWood_Plant_A')
lamp(True); finish('PROP_Common_WallLamp_A')
lamp(); finish('PROP_WarmWood_Lamp_Paper')
lathe('Open black casserole',[(0,0),(.24,0),(.31,.025),(.36,.08),(.405,.245),(.42,.28),(.42,.305),(.397,.315),(.379,.30),(.379,.27),(.34,.11),(.28,.045),(0,.045)],iron,seg=48)
for x in [-.49,.49]:
    torus('Cast handle',(x,0,.23),.09,.022,iron,(math.pi/2,0,0),20)
    for y in [-.065,.065]: rod('Handle attachment',(x,y,.23),(x*.80,y,.23),.023,iron)
finish('PROP_Common_Pot_Open')
bowl(ceramic); finish('PROP_Common_Bowl_A')
rice=material('SoftRice',(.90,.83,.66),.40)
for k in range(60):
    a=k*2.39996; r=.34*math.sqrt((k+.5)/60)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=1,location=(r*math.cos(a),r*math.sin(a),.004))
    o=use(bpy.context.object,'Swollen rice grain',rice); o.scale=(.014,.006,.004); o.rotation_euler.z=a
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    for p in o.data.polygons: p.use_smooth=True
finish('FOOD_Common_RiceGrains')
lathe('Creamy congee surface',[(0,0),(.34,0),(.34,.007),(0,.007)],rice,seg=32)
for k in range(42):
    a=k*2.39996; r=.31*math.sqrt((k+.5)/42)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=1,location=(r*math.cos(a),r*math.sin(a),.010))
    o=use(bpy.context.object,'Rice in bowl',rice); o.scale=(.014,.006,.004); o.rotation_euler.z=a
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    for p in o.data.polygons: p.use_smooth=True
finish('FOOD_Common_PlainCongee')

# 25 decor assets, keeping the exact resource IDs from the game tables.
decor=json.loads((ROOT/'游戏工程/BaTian/assets/resources/data/rules/decor.json').read_text())
for d in decor:
    name=d['mesh']
    if name in assets: continue
    style=d['style']; mat=lightwood if style=='warm-wood' else darkwood if style=='night-blue' else white
    if d['kind']=='tableware':
        bmat={'D10':terra,'D13':ceramic,'D25':white,'D14':blue}[d['id']]
        bowl(bmat,brass if d['id']=='D14' else bmat)
    elif 'Curtain' in name: curtain(bluecloth if style=='night-blue' else cloth)
    elif 'Table' in name: table('round' if 'Round' in name else 'long' if 'Long' in name else 'square',mat)
    elif 'Counter' in name:
        # Veneer is placed atop the permanent counter; does not obstruct its trays.
        box('Counter finish',(0,0,.027),(6.9,.66,.054),mat,.012)
        box('Panelled fascia',(0,-.345,-.20),(6.9,.04,.45),brass if style=='night-blue' else mat)
        for k in range(12): box('Fascia trim',(-3.16+k*.575,-.373,-.20),(.018,.012,.41),wood if style!='night-blue' else brass,.002)
    elif 'Stove' in name:
        # Backsplash / utensil rail, behind the four functional stoves.
        box('Backsplash',(0,0,.25),(7.6,.05,.5),white if style=='morning-white' else iron if style=='night-blue' else terra)
        for k in range(14):
            box('Tile seam',(-3.6+k*.55,-.03,.25),(.012,.014,.49),grout,.001)
        rod('Utensil rail',(-2.5,-.13,.65),(2.5,-.13,.65),.018,brass if style=='night-blue' else steel)
        for x in [-1.8,-.9,0,.9,1.8]:
            rod('Ladle handle',(x,-.13,.60),(x,-.13,.25),.009,steel,8)
            lathe('Ladle bowl',[(0,0),(.05,0),(.065,.025),(.055,.035),(0,.035)],steel,(x,-.13,.20),seg=16)
    elif 'Window' in name: window()
    elif 'DoorLamp' in name: lamp()
    elif 'Lamp_Brass' in name: lamp(True)
    elif 'Scallion' in name: plant(scallion=True)
    elif 'Jar' in name: jar()
    elif 'Mint' in name: plant(mint=True)
    elif 'Vase' in name:
        lathe('Porcelain vase',[(0,0),(.09,0),(.11,.03),(.16,.19),(.12,.32),(.06,.41),(.06,.5),(.044,.5),(.044,.40),(.09,.31),(.13,.19),(.08,.04),(0,.04)],white,seg=32)
        for k in range(3):
            a=k*math.tau/3
            rod('Dried flower stem',(0,0,.40),(.07*math.cos(a),.07*math.sin(a),.77+k*.06),.004,wood,6)
            for j in range(3):
                box('Seed head',(.07*math.cos(a)+.018*(j-1),.07*math.sin(a),.73+k*.06+j*.025),(.03,.025,.045),paper,.004)
    elif 'Chime' in name:
        lathe('Bronze bell',[(.03,.1),(.10,.15),(.09,.2),(.06,.30),(.02,.33)],brass,seg=32)
        rod('Bell cord',(0,0,0),(0,0,.41),.004,wood,6)
        box('Wind catcher',(0,0,.04),(.06,.007,.08),paper,.002)
        torus('Hanging loop',(0,0,.43),.022,.004,brass,(math.pi/2,0,0),16)
    elif 'MenuBoard' in name:
        box('Menu frame',(0,0,.30),(.42,.05,.60),wood,.012)
        box('Chalk board',(0,-.03,.30),(.36,.014,.53),blue,.002)
        text('今日粥品',(0,-.041,.47),.064,chalk)
        for j,s in enumerate(['白粥','瘦肉粥','鸡丝粥']): text(s,(0,-.041,.35-j*.10),.052,chalk)
        rod('Easel brace',(-.16,.12,0),(-.16,0,.55),.012,wood,8)
        rod('Easel brace',(.16,.12,0),(.16,0,.55),.012,wood,8)
    else: raise ValueError(name)
    finish(name)

# A tidy editable asset library. Reposition only after exporting at bottom centre.
for i,(name,info) in enumerate(assets.items()):
    o=bpy.data.objects[info['object']]; o.hide_set(False)
    o.location=((i%6)*9,(i//6)*5,0)
scene.world=bpy.data.worlds.new('BaTian_World'); scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.12,.14,.13,1)
bg.inputs[1].default_value=.5
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'BaTian_RealProps.blend'))
(SOURCE/'manifest.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2))
result={'assets':len(assets),'triangles':sum(a['triangles'] for a in assets.values()),'source':str(SOURCE/'BaTian_RealProps.blend'),'exports':str(DEST)}
