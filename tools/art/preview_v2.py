"""v2 物件的近景预览：按「熬粥特写」的构图摆一口锅、炉子、碗与托盘，Cycles 渲染。"""
import bpy, math
from mathutils import Vector

ROOT = '/Users/liweng/Downloads/3D/BaTian Congee/美术源文件/正式物件/预览/'
lib = bpy.data.scenes['BaTian_RealProps_v2']
NAME = globals().get('PREVIEW', 'cook')
OUT = globals().get('OUT', ROOT + 'v2_熬粥特写.png')

sc = bpy.data.scenes.get('BT2_Preview')
if sc:
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
else:
    sc = bpy.data.scenes.new('BT2_Preview')
bpy.context.window.scene = sc


def inst(name, pos, rot=0, scale=1.0, tint=None):
    src = lib.objects.get(name) or bpy.data.objects.get(name)
    o = bpy.data.objects.new(name + '_pv', src.data)
    sc.collection.objects.link(o)
    o.location = pos; o.rotation_euler = (0, 0, math.radians(rot)); o.scale = (scale,) * 3
    return o


def plane(name, pos, size, col, rough=.8):
    me = bpy.data.meshes.new(name)
    s = size / 2
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.location = pos
    m = bpy.data.materials.new(name + '_m'); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Roughness'].default_value = rough
    me.materials.append(m)
    return o


def light(kind, pos, energy, col, size=.5, rot=(0, 0, 0)):
    d = bpy.data.lights.new(kind, kind); d.energy = energy; d.color = col
    if kind == 'AREA': d.size = size
    if kind == 'POINT': d.shadow_soft_size = size
    o = bpy.data.objects.new(kind, d); sc.collection.objects.link(o); o.location = pos; o.rotation_euler = rot
    return o


def camera(pos, look, lens=40):
    c = bpy.data.cameras.new('cam'); c.lens = lens
    o = bpy.data.objects.new('cam', c); sc.collection.objects.link(o); o.location = pos
    d = Vector(look) - Vector(pos)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = o


sc.world = bpy.data.worlds.get('BT2_World') or bpy.data.worlds.new('BT2_World')
sc.world.use_nodes = True
bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (.03, .055, .06, 1); bg.inputs[1].default_value = .6

if NAME == 'cook':
    # 台面（暖木）
    counter = plane('Counter', (0, 0, 0), 4.0, (.42, .25, .13), .55)
    if 'BT2_WornOak' in bpy.data.materials:
        counter.data.materials[0] = bpy.data.materials['BT2_WornOak']
        counter.data.uv_layers.new()
    inst('PROP_Common_CharcoalStove_A', (0, 0, 0))
    inst('PROP_Common_Pot_Open', (0, 0, 0.39))
    # 锅里的粥：粥面 + 米粒（游戏里同样是这两层）
    inst('FOOD_Common_PlainCongee', (0, 0, 0.39 + 0.29), scale=1.11)
    inst('FOOD_Common_RiceGrains', (0, 0, 0.39 + 0.302), scale=1.05)
    inst('PROP_Common_Bowl_A', (-0.85, -0.45, 0.0), scale=0.55)
    inst('FOOD_Common_PlainCongee', (-0.85, -0.45, 0.172 * 0.55 * 0.62), scale=0.55 * 0.62)
    if lib.objects.get('PROP_WarmWood_Tray_A'):
        inst('PROP_WarmWood_Tray_A', (0.95, -0.5, 0), rot=-12, scale=0.8)
    light('AREA', (1.4, -1.2, 2.2), 260, (1.0, .82, .62), size=1.4, rot=(math.radians(40), 0, math.radians(45)))
    light('POINT', (0, -0.30, 0.12), 14, (1.0, .45, .15), size=.1)
    light('AREA', (-2, 1.5, 1.6), 80, (.6, .75, .9), size=2, rot=(math.radians(60), 0, math.radians(-130)))
    camera((0.55, -2.7, 1.85), (0.0, 0.0, 0.32), lens=40)
else:
    # 物件总览：一排排摆开
    names = [o.name for o in lib.objects if o.type == 'MESH']
    for i, n in enumerate(sorted(names)):
        inst(n, ((i % 6) * 2.0 - 5, (i // 6) * 2.0, 0))
    plane('Floor', (0, 3, 0), 30, (.25, .22, .2))
    light('SUN', (0, 0, 10), 3.5, (1, .92, .82), rot=(math.radians(50), 0, math.radians(30)))
    rows = max(1, (len(names) + 5) // 6)
    camera((0, -8, 10), (0, rows, 0), lens=30)

r = sc.render
r.engine = 'CYCLES'
sc.cycles.samples = 48
sc.cycles.use_denoising = True
try:
    sc.cycles.device = 'GPU'
except Exception:
    pass
r.resolution_x, r.resolution_y, r.resolution_percentage = 1280, 720, int(globals().get('PCT', 75))
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
r.filepath = OUT
bpy.ops.render.render(write_still=True)
result = {'out': OUT}
