"""粥霸天 正式物件 v2（在连接的 Blender 里运行）。

目标：按设计稿「炭火暖木，青瓷小铺」把物件做得更真实细腻——
- 几何：更多段数、倒角、真实砖缝/瓷砖/木板拼缝、锅沿厚度与双耳、炉口炭火；
- 材质：1K 程序纹理烘成图片（木纹、陶土、灰泥、米粒、粗布、宣纸），带法线贴图，glTF 可直接带走；
- 约定不变：米制、Z 向上建模、导出 Y 向上；原点在底面中心；名字与尺寸与 v1 一致，游戏里的安装映射（install_props.py）无需改动。

用法（Blender 里）：
    exec(compile(open(P).read(), P, 'exec'), {'ONLY': ['PROP_Common_Pot_Open', ...]})
不给 ONLY 时全部重建。
"""
import bpy, bmesh, math, json, random
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

ROOT = Path('/Users/liweng/Downloads/3D/BaTian Congee')
DEST = ROOT / '游戏工程/BaTian/assets/resources/models/real'
SOURCE = ROOT / '美术源文件/正式物件'
TEX = SOURCE / 'tex_v2'
TEX.mkdir(parents=True, exist_ok=True)
ONLY = globals().get('ONLY') or None
LAYOUT = globals().get('LAYOUT', True)

SCENE_NAME = 'BaTian_RealProps_v2'
# v1 的同名物件和网格改名让位，v2 才能用干净的名字导出
for sc_name in ('BaTian_RealProps',):
    if sc_name in bpy.data.scenes:
        for o in bpy.data.scenes[sc_name].objects:
            if not o.name.endswith('_v1') and (o.name.startswith('PROP_') or o.name.startswith('ENV_') or o.name.startswith('FOOD_')):
                if o.data is not None and not o.data.name.endswith('_v1'):
                    o.data.name = o.name.split('.')[0] + '_v1'
                o.name = o.name.split('.')[0] + '_v1'
if SCENE_NAME in bpy.data.scenes:
    old = bpy.data.scenes[SCENE_NAME]
    for o in list(old.objects):
        base = o.name.split('.')[0]
        if ONLY is None or base in ONLY or o.name == 'part' or o.name.startswith('part.'):
            bpy.data.objects.remove(o, do_unlink=True)
    scene = old
else:
    scene = bpy.data.scenes.new(SCENE_NAME)
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
rng = random.Random(2026)
parts = []
built = {}

# ───────────────────────── 程序纹理 ─────────────────────────

def vnoise(n, cells, seed):
    """可平铺的值噪声（双线性插值）。"""
    g = np.random.default_rng(seed).random((cells, cells)).astype(np.float32)
    x = np.arange(n) * cells / n
    i0 = np.floor(x).astype(int) % cells
    i1 = (i0 + 1) % cells
    f = (x - np.floor(x)).astype(np.float32)
    f = f * f * (3 - 2 * f)
    rows = g[i0][:, None, :] if False else None
    a = g[np.ix_(i0, i0)]; b = g[np.ix_(i0, i1)]; c = g[np.ix_(i1, i0)]; d = g[np.ix_(i1, i1)]
    fy = f[:, None]; fx = f[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(n, base, octaves, seed, gain=0.5):
    out = np.zeros((n, n), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        out += amp * vnoise(n, base * 2 ** o, seed + o * 17)
        tot += amp; amp *= gain
    return out / tot


def blur(img, sigma):
    n = img.shape[0]
    k = np.fft.fftfreq(n)
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (k[:, None] ** 2 + k[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(img) * g)).astype(np.float32)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + nz * nz)
    return np.stack([(-dx / l) * .5 + .5, (-dy / l) * .5 + .5, (nz / l) * .5 + .5], -1)


_images = {}

def image(name, rgb, non_color=False):
    """rgb: (n,n,3) 0–1 → 打包进 blend 的图片，并存一份 PNG 到 tex_v2。"""
    if name in _images:
        return _images[name]
    n = rgb.shape[0]
    im = bpy.data.images.new('BT2_' + name, width=n, height=n, alpha=False)
    px = np.ones((n, n, 4), np.float32)
    px[:, :, :3] = np.clip(rgb, 0, 1)
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = str(TEX / (name + '.png'))
    im.file_format = 'PNG'
    im.save()
    im.pack()
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    _images[name] = im
    return im


def tint(v, col):
    return np.stack([v * col[0], v * col[1], v * col[2]], -1)


def tex_wood(name, col, n=1024, rings=26, seed=3):
    """顺 X 方向的木纹：年轮条带 + 细纤维 + 偶尔的节疤。"""
    yy, xx = np.mgrid[0:n, 0:n] / n
    warp = fbm(n, 3, 3, seed) * 2.2
    ring = np.sin((yy * rings + warp) * math.pi * 2) * .5 + .5
    fibre = fbm(n, 64, 2, seed + 5)
    streak = blur(np.random.default_rng(seed).random((n, n)).astype(np.float32), 0.6)
    streak = np.roll(np.repeat(streak[:, :1], n, 1), 0, 1) * .0 + blur(np.repeat(np.random.default_rng(seed + 1).random((n, 1)).astype(np.float32), n, 1), 0.8)
    v = .74 + .16 * ring ** 3 + .08 * fibre + .10 * (streak - .5)
    knots = np.zeros((n, n), np.float32)
    r = np.random.default_rng(seed + 9)
    for _ in range(3):
        cx, cy = r.random() * n, r.random() * n
        d = np.hypot((xx * n - cx) / 2.5, yy * n - cy)
        knots += np.exp(-(d / 9) ** 2) * .5
    v = v - knots * .35
    h = ring * .6 + fibre * .4 - knots
    return image(name, tint(v, col)), image(name + '_N', normal_from_height(blur(h, 1.2), 2.2), True)


def tex_noise_surface(name, col, n=1024, seed=5, speck=0.0, scale=8, var=0.14, nstrength=3.0):
    """陶土、灰泥、粗陶：多层噪声 + 小斑点。"""
    f = fbm(n, scale, 5, seed)
    v = 1 - var + var * 2 * f
    if speck:
        s = np.random.default_rng(seed + 3).random((n, n)) > (1 - speck)
        v = v - s * .25
    return image(name, tint(v, col)), image(name + '_N', normal_from_height(blur(f, 0.8), nstrength), True)


def tex_cloth(name, col, n=512, seed=8, period=6):
    yy, xx = np.mgrid[0:n, 0:n]
    w = (np.sin(xx * math.pi * 2 / period) * np.sin(yy * math.pi * 2 / period)) * .5 + .5
    f = fbm(n, 16, 3, seed)
    v = .82 + .1 * w + .1 * f
    return image(name, tint(v, col)), image(name + '_N', normal_from_height(w * .6 + f * .4, 1.4), True)


def tex_paper(name, col, n=512, seed=12):
    f = fbm(n, 24, 4, seed)
    fib = blur((np.random.default_rng(seed).random((n, n)) > .995).astype(np.float32), 1.5) * 6
    v = .9 + .08 * f + .1 * np.clip(fib, 0, 1)
    return image(name, tint(v, col)), image(name + '_N', normal_from_height(f + fib * .3, 1.0), True)


def tex_rice(name, n=1024, seed=21, cream=(.93, .89, .80), density=2600):
    """熬开的米粒：亮米粒椭圆 + 半透明米汤缝隙。"""
    r = np.random.default_rng(seed)
    h = np.zeros((n, n), np.float32)
    yy, xx = np.mgrid[0:24, 0:24] - 12
    for _ in range(density):
        a = r.random() * math.pi
        L, W = 9 + r.random() * 4, 4 + r.random() * 1.5
        ca, sa = math.cos(a), math.sin(a)
        u = (xx * ca + yy * sa) / L; v_ = (-xx * sa + yy * ca) / W
        blob = np.clip(1 - (u * u + v_ * v_), 0, 1) ** .6
        cx, cy = r.integers(0, n), r.integers(0, n)
        ys = (np.arange(24) + cy - 12) % n; xs = (np.arange(24) + cx - 12) % n
        h[np.ix_(ys, xs)] = np.maximum(h[np.ix_(ys, xs)], blob * (0.7 + 0.3 * r.random()))
    hb = blur(h, 0.7)
    gap = 1 - hb
    col = np.stack([cream[0] - gap * .10, cream[1] - gap * .13, cream[2] - gap * .18], -1)
    col *= (0.96 + 0.06 * fbm(n, 6, 3, seed + 1))[..., None]
    return image(name, col), image(name + '_N', normal_from_height(hb, 3.0), True)


def tex_brushed(name, col, n=512, seed=31):
    s = blur(np.repeat(np.random.default_rng(seed).random((n, 1)).astype(np.float32), n, 1), 0.5)
    f = fbm(n, 4, 3, seed)
    v = .86 + .1 * s + .06 * f
    return image(name, tint(v, col)), image(name + '_N', normal_from_height(s, 0.6), True)


# ───────────────────────── 材质 ─────────────────────────

def material(name, col=(.8, .8, .8), rough=.6, metal=0.0, tex=None, normal=None, nstrength=1.0, glow=0.0, coat=0.0, alpha=1.0):
    m = bpy.data.materials.get('BT2_' + name) or bpy.data.materials.new('BT2_' + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*col, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if coat:
        p.inputs['Coat Weight'].default_value = coat
    if tex is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if normal is not None:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nstrength
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if glow:
        p.inputs['Emission Color'].default_value = (*col, 1)
        p.inputs['Emission Strength'].default_value = glow
    m.diffuse_color = (*col, 1)
    return m


def build_materials():
    M = {}
    M['oak'] = material('WornOak', (.55, .33, .16), .62, tex=tex_wood('Oak_A', (.55, .33, .16), rings=22, seed=3)[0],
                        normal=_images['Oak_A_N'], nstrength=.6)
    M['honey'] = material('HoneyOak', (.78, .52, .27), .55, tex=tex_wood('Honey_A', (.78, .52, .27), rings=18, seed=7)[0],
                          normal=_images['Honey_A_N'], nstrength=.5)
    M['dark'] = material('SmokedOak', (.20, .12, .075), .58, tex=tex_wood('Smoked_A', (.24, .14, .085), rings=30, seed=11)[0],
                         normal=_images['Smoked_A_N'], nstrength=.7)
    M['plaster'] = material('LimePlaster', (.88, .80, .64), .93, tex=tex_noise_surface('Plaster_A', (.88, .80, .64), seed=5, var=.07, scale=6)[0],
                            normal=_images['Plaster_A_N'], nstrength=.5)
    M['terra'] = material('Terracotta', (.80, .62, .44), .9, tex=tex_noise_surface('Terra_A', (.80, .62, .44), seed=9, speck=.004, var=.12)[0],
                          normal=_images['Terra_A_N'], nstrength=.9)
    # 每种砖一张带颜色的贴图（贴图会直接接 Base Color，白贴图会把砖刷成白色）
    M['bricks'] = []
    for i, c in enumerate([(.66, .50, .35), (.60, .44, .30), (.70, .55, .39), (.56, .41, .28)]):
        bt = tex_noise_surface(f'Brick_{i}', c, n=512, seed=19 + i, speck=.008, var=.18, scale=10)
        M['bricks'].append(material(f'KilnBrick{i}', c, .9, tex=bt[0], normal=bt[1], nstrength=1.2))
    M['brick'] = M['bricks'][0]
    M['soot'] = material('Soot', (.05, .04, .035), .95)
    M['mortar'] = material('Mortar', (.72, .66, .55), .97, tex=tex_noise_surface('Mortar_A', (.72, .66, .55), n=512, seed=23, speck=.02, var=.1)[0])
    M['tiles'] = [material(f'JadeTile{i}', c, .22, coat=.6, normal=tex_noise_surface('TileGlaze_N', (1, 1, 1), n=512, seed=29, var=.05, scale=3, nstrength=.6)[1], nstrength=.15)
                  for i, c in enumerate([(.20, .38, .30), (.22, .41, .32), (.18, .35, .28), (.24, .43, .34), (.21, .40, .33)])]
    M['grout'] = material('Grout', (.62, .62, .55), .95)
    M['iron'] = material('BlackGlaze', (.016, .015, .014), .42, .0, coat=.35,
                         normal=tex_noise_surface('Hammered_N', (1, 1, 1), n=512, seed=41, var=.1, scale=24, nstrength=2.5)[1], nstrength=.35)
    M['iron_matte'] = material('RawIron', (.06, .055, .05), .7, .4)
    M['clay_foot'] = material('UnglazedClay', (.45, .30, .20), .92, tex=_images['Terra_A'], normal=_images['Terra_A_N'])
    M['steel'] = material('BrushedSteel', (.62, .62, .60), .35, .85, tex=tex_brushed('Steel_A', (.62, .62, .60))[0], normal=_images['Steel_A_N'], nstrength=.3)
    M['counter_top'] = material('CreamStone', (.86, .82, .72), .45, tex=tex_noise_surface('Stone_A', (.86, .82, .72), seed=51, var=.05, scale=5)[0])
    M['brass'] = material('AgedBrass', (.70, .48, .22), .35, .9)
    M['copper'] = material('Copper', (.72, .38, .20), .32, .9)
    M['celadon'] = material('CeladonGlaze', (.62, .74, .60), .12, coat=.8)
    M['porcelain'] = material('WarmPorcelain', (.93, .90, .82), .1, coat=.8)
    M['glaze_brown'] = material('BrownGlaze', (.34, .17, .07), .15, coat=.8)
    M['glaze_amber'] = material('AmberGlaze', (.62, .36, .12), .16, coat=.8)
    M['glaze_indigo'] = material('IndigoGlaze', (.06, .11, .22), .14, coat=.8)
    M['glaze_cream'] = material('CreamGlaze', (.90, .85, .72), .18, coat=.6)
    M['blue_line'] = material('CobaltLine', (.12, .22, .45), .2)
    M['green_line'] = material('CeladonLine', (.33, .52, .38), .2)
    M['coarse'] = material('CoarseStoneware', (.78, .70, .56), .5, tex=tex_noise_surface('Stoneware_A', (.78, .70, .56), n=512, seed=61, speck=.01, var=.08)[0])
    M['congee'] = material('Congee', (.88, .80, .64), .3, tex=tex_rice('Congee_A', cream=(.88, .80, .64))[0], normal=_images['Congee_A_N'], nstrength=.8)
    M['rice'] = material('RiceGrain', (.95, .92, .84), .28, coat=.4)
    M['linen'] = material('Linen', (.70, .52, .32), .95, tex=tex_cloth('Linen_A', (.70, .52, .32))[0], normal=_images['Linen_A_N'], nstrength=.6)
    M['indigo_linen'] = material('IndigoLinen', (.12, .19, .30), .95, tex=tex_cloth('Indigo_A', (.12, .19, .30), seed=9)[0], normal=_images['Indigo_A_N'], nstrength=.6)
    M['paper'] = material('RicePaper', (.98, .84, .58), .85, tex=tex_paper('Paper_A', (.98, .84, .58))[0], normal=_images['Paper_A_N'], nstrength=.4, glow=.9)
    M['paper_white'] = material('WhitePaper', (.97, .94, .86), .85, tex=tex_paper('PaperW_A', (.97, .94, .86), seed=14)[0], glow=.6)
    M['leaf'] = material('Leaf', (.16, .34, .10), .55, coat=.2)
    M['leaf2'] = material('YoungLeaf', (.30, .50, .16), .55, coat=.2)
    M['stem'] = material('Stem', (.25, .30, .12), .7)
    M['soil'] = material('Soil', (.09, .06, .04), 1)
    M['gold'] = material('LetterGold', (.86, .64, .30), .35, .85, glow=.15)
    M['ember'] = material('CoalEmber', (1.0, .30, .06), .9, glow=2.5)
    M['coal'] = material('Charcoal', (.03, .028, .026), .95)
    M['ash'] = material('Ash', (.55, .52, .48), 1)
    M['red_cord'] = material('RedCord', (.62, .12, .08), .7)
    M['chalk'] = material('Chalk', (.86, .83, .72), 1)
    M['green_veg'] = material('Greens', (.22, .48, .14), .5, coat=.3)
    M['scallion'] = material('Scallion', (.40, .66, .22), .45)
    M['pork'] = material('LeanPork', (.66, .40, .32), .55)
    M['chicken'] = material('ShreddedChicken', (.90, .80, .62), .6)
    M['egg'] = material('CenturyEgg', (.18, .14, .08), .25, coat=.5)
    M['carrot'] = material('Pumpkin', (.92, .55, .16), .5)
    M['chili'] = material('Chili', (.70, .10, .06), .35)
    M['knife'] = material('CleaverSteel', (.75, .76, .78), .25, 1.0)
    return M


# ───────────────────────── 几何工具 ─────────────────────────

def link(o):
    scene.collection.objects.link(o)
    return o


def use(o, mat):
    if mat is not None:
        o.data.materials.clear()
        o.data.materials.append(mat)
    parts.append(o)
    return o


def uv_box(o, size=1.0):
    """世界尺度的盒式投影 UV，纹理密度在所有物件上一致。"""
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            if ax == 0: u, v = c.y, c.z
            elif ax == 1: u, v = c.x, c.z
            else: u, v = c.x, c.y
            l[uv].uv = (u / size, v / size)
    bm.to_mesh(me); bm.free()


def apply_mods(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def box(pos, dim, mat, bevel=0.006, seg=2, uv=0.5, rot=(0, 0, 0)):
    me = bpy.data.meshes.new('box')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('part', me))
    o.scale = dim; o.location = pos; o.rotation_euler = rot
    bpy.context.view_layer.update()
    o.data.transform(Matrix.Diagonal((*dim, 1)))
    o.scale = (1, 1, 1)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = min(bevel, min(dim) * .45); b.segments = seg; b.limit_method = 'ANGLE'
        apply_mods(o)
    for p in o.data.polygons: p.use_smooth = bool(bevel)
    if uv: uv_box(o, uv)
    return use(o, mat)


def lathe(profile, mat, pos=(0, 0, 0), seg=48, smooth=True, uv_v=1.0, close_top=False, close_bottom=False):
    """profile: [(r, z), ...] 自下而上。"""
    verts, faces = [], []
    for r, z in profile:
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append((pos[0] + r * math.cos(a), pos[1] + r * math.sin(a), pos[2] + z))
    rows = len(profile)
    for j in range(rows - 1):
        for k in range(seg):
            a = j * seg + k; b = j * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    if close_bottom:
        faces.append(tuple(reversed(range(seg))))
    if close_top:
        faces.append(tuple(range((rows - 1) * seg, rows * seg)))
    me = bpy.data.meshes.new('lathe'); me.from_pydata(verts, [], faces); me.update()
    o = link(bpy.data.objects.new('part', me))
    uvl = me.uv_layers.new(name='UVMap')
    acc = [0]
    for j in range(1, rows):
        acc.append(acc[-1] + math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]))
    for p in me.polygons:
        p.use_smooth = smooth
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            j, k = divmod(vi, seg)
            uvl.data[li].uv = (k / seg * 2 * math.pi * max(.05, profile[j][0]) / uv_v, acc[j] / uv_v)
    return use(o, mat)


def cyl(pos, r, h, mat, seg=32, bevel=0.0, rot=(0, 0, 0)):
    me = bpy.data.meshes.new('cyl')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('part', me))
    o.location = pos; o.rotation_euler = rot
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
        apply_mods(o)
    for p in o.data.polygons: p.use_smooth = len(p.vertices) == 4 or bool(bevel)
    uv_box(o, .5)
    return use(o, mat)


def sphere(pos, r, mat, scale=(1, 1, 1), seg=16, rings=10, rot=(0, 0, 0)):
    me = bpy.data.meshes.new('sph')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('part', me))
    o.location = pos; o.scale = scale; o.rotation_euler = rot
    for p in o.data.polygons: p.use_smooth = True
    uv_box(o, .3)
    return use(o, mat)


def torus(pos, R, r, mat, rot=(0, 0, 0), seg=32, mseg=10, arc=1.0):
    verts, faces = [], []
    n_major = seg if arc >= 1 else seg + 1
    for i in range(n_major):
        a = 2 * math.pi * arc * i / seg
        for j in range(mseg):
            b = 2 * math.pi * j / mseg
            verts.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(seg if arc >= 1 else seg):
        for j in range(mseg):
            i2 = (i + 1) % n_major
            faces.append((i * mseg + j, i2 * mseg + j, i2 * mseg + (j + 1) % mseg, i * mseg + (j + 1) % mseg))
    me = bpy.data.meshes.new('tor'); me.from_pydata(verts, [], faces); me.update()
    o = link(bpy.data.objects.new('part', me))
    o.location = pos; o.rotation_euler = rot
    for p in me.polygons: p.use_smooth = True
    uv_box(o, .3)
    return use(o, mat)


def rod(a, b, r, mat, seg=10):
    a, b = Vector(a), Vector(b)
    o = cyl((a + b) / 2, r, (b - a).length, mat, seg=seg)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return o


def text_mesh(body, pos, size, mat, extrude=.012, rot=(math.pi / 2, 0, 0), bevel=.002):
    c = bpy.data.curves.new('Lettering', 'FONT'); c.body = body; c.size = size; c.align_x = 'CENTER'; c.align_y = 'CENTER'
    c.extrude = extrude; c.bevel_depth = bevel; c.bevel_resolution = 1; c.resolution_u = 6
    for path in ['/System/Library/Fonts/Supplemental/Songti.ttc', '/System/Library/Fonts/STHeiti Medium.ttc', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf']:
        try:
            c.font = bpy.data.fonts.load(path, check_existing=True); break
        except Exception:
            continue
    o = link(bpy.data.objects.new('Lettering', c)); o.location = pos; o.rotation_euler = rot
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object
    uv_box(o, .3)
    return use(o, mat)


def finish(name, target_dims=None):
    """合并、原点放底面中心、按 v1 尺寸校准、导出 GLB。"""
    global parts
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    o = bpy.context.object
    for other in (bpy.data.objects.get(name), ):
        if other is not None and other is not o:
            other.name = name + '_v1' if not other.get('version') else name + '_old'
    old_me = bpy.data.meshes.get(name)
    if old_me is not None and old_me is not o.data:
        old_me.name = name + '_v1mesh'
    o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    co = np.empty(len(o.data.vertices) * 3, np.float32); o.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    mn, mx = co.min(0), co.max(0)
    shift = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]))
    o.data.transform(Matrix.Translation(-shift))
    if target_dims:
        size = mx - mn
        sx, sy, sz = (target_dims[i] / size[i] if size[i] > 1e-6 else 1 for i in range(3))
        o.data.transform(Matrix.Diagonal((sx, sy, sz, 1)))
    o.data.update()
    o.data.calc_loop_triangles()
    tri = len(o.data.loop_triangles)
    o['unit'] = 'metre'; o['origin'] = 'bottom centre'; o['asset_id'] = name; o['version'] = 2
    # 单独的导出场景里只放这一件，避免把别的场景里选中的东西带进 GLB
    ex = bpy.data.scenes.get('BT2_Export') or bpy.data.scenes.new('BT2_Export')
    for other in list(ex.collection.objects):
        ex.collection.objects.unlink(other)
    ex.collection.objects.link(o)
    bpy.context.window.scene = ex
    for other in ex.objects: other.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=str(DEST / (name + '.glb')), export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_lights=False, export_extras=True,
                              export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=88)
    built[name] = {'triangles': tri, 'dimensions': [round(float(x), 4) for x in o.dimensions]}
    ex.collection.objects.unlink(o)
    bpy.context.window.scene = scene
    parts = []
    return o


# ───────────────────────── 物件 ─────────────────────────
M = build_materials()


def pot_open():
    """黑釉砂锅：外壁带锤纹釉光，锅沿有厚度，未上釉的陶土圈足，双耳带铆钉。"""
    outer = [(0.22, 0.0), (0.27, 0.004), (0.31, 0.02), (0.355, 0.055), (0.39, 0.10), (0.412, 0.15), (0.418, 0.20),
             (0.413, 0.25), (0.402, 0.29), (0.398, 0.318), (0.405, 0.332), (0.412, 0.338), (0.414, 0.342)]
    inner = [(0.392, 0.342), (0.386, 0.334), (0.380, 0.318), (0.384, 0.29), (0.392, 0.25), (0.396, 0.20), (0.390, 0.15),
             (0.368, 0.10), (0.33, 0.06), (0.28, 0.035), (0.20, 0.025), (0.0, 0.022)]
    lathe(outer + inner, M['iron'], seg=64)
    lathe([(0.0, 0.0), (0.22, 0.0)], M['iron'], seg=64)
    # 圈足：不上釉的陶土
    lathe([(0.225, -0.0005), (0.24, 0.0), (0.27, 0.004), (0.29, 0.012), (0.27, 0.012), (0.225, 0.004)], M['clay_foot'], seg=64)
    # 锅沿：釉积在沿口，略带一点棕
    torus((0, 0, 0.341), 0.403, 0.006, M['iron'], seg=64, mseg=8)
    for side in (1, -1):
        # 耳：设计稿是锅沿下两只横向 D 形陶耳，与锅身同釉，根部加厚
        o = torus((0.47 * side, 0, 0.29), 0.11, 0.024, M['iron'], rot=(0, 0, -math.pi / 2 if side > 0 else math.pi / 2), seg=24, mseg=12, arc=0.5)
        o.scale = (1, 1, 0.75)
        for dy in (-0.11, 0.11):
            sphere((0.43 * side, dy, 0.29), 0.034, M['iron'], scale=(1.2, 1, 0.85), seg=14, rings=8)
    return finish('PROP_Common_Pot_Open', (1.204, 0.84, 0.342))


def congee_surface(name, r, dims, bowl=False):
    """粥面：中间微鼓、边缘挂壁的米汤面，米粒纹理 + 法线。"""
    prof = [(0.0, 0.010), (r * .3, 0.0098), (r * .6, 0.0085), (r * .85, 0.006), (r * .97, 0.004), (r, 0.012 if not bowl else 0.010), (r * .995, 0.0)]
    lathe(prof, M['congee'], seg=64, uv_v=0.3)
    o = parts[-1]
    # 平面投影 UV，米粒不随半径拉伸
    me = o.data; uvl = me.uv_layers[0]
    for li, l in enumerate(me.loops):
        c = me.vertices[l.vertex_index].co
        uvl.data[li].uv = (c.x / (r * 1.2) * .5 + .5, c.y / (r * 1.2) * .5 + .5)
    return finish(name, dims)


def rice_grains():
    """粥面上浮起的米粒：约 700 粒，大小朝向各异，靠中心更密。"""
    r = random.Random(7)
    grains = []
    for i in range(420):
        a = r.random() * 2 * math.pi
        d = 0.335 * math.sqrt(r.random()) ** 0.9
        x, y = d * math.cos(a), d * math.sin(a)
        L = 0.010 + r.random() * 0.005
        o = sphere((x, y, 0.004), 1, M['rice'], scale=(L, L * .5, .0032), seg=7, rings=4, rot=(0, r.uniform(-.2, .2), r.random() * math.pi))
        o.data.transform(Matrix.Diagonal((L, L * .5, .0032, 1))); o.scale = (1, 1, 1)
    # 几片米汤泡
    for i in range(10):
        a = r.random() * 2 * math.pi; d = 0.3 * r.random()
        sphere((d * math.cos(a), d * math.sin(a), 0.004), 1, M['porcelain'], scale=(.006, .006, .003), seg=10, rings=6)
        parts[-1].data.transform(Matrix.Diagonal((.006 + r.random() * .006, .006 + r.random() * .006, .003, 1))); parts[-1].scale = (1, 1, 1)
    return finish('FOOD_Common_RiceGrains', (0.684, 0.678, 0.008))


def charcoal_stove():
    """陶土炭炉：错缝砌的窑砖、灰缝、铁箍、拱形炉口里一堆亮炭。"""
    R, H = 0.55, 0.41
    # 设计稿：5 层粗砖错缝，砖面有磕碰；顶层砖面朝上露出，锅直接坐在砖圈里；正面一个方炉口透出炭火
    courses = 5
    ch = H / courses
    depth = 0.17        # 砖的进深（墙厚）：内口小于锅腹，锅坐进砖圈
    Rm = 0.55 - depth / 2
    n = 16
    mouth = 0.40        # 炉口半角宽（弧度）
    for c in range(courses):
        off = (c % 2) * math.pi / n
        z = c * ch + ch / 2
        for k in range(n):
            a = 2 * math.pi * k / n + off
            da = abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2)))
            if c < 3 and da < mouth:
                continue  # 炉口（朝 -Y，即游戏里朝外）
            w = 2 * math.pi * (Rm + depth / 2) / n - 0.012
            box((Rm * math.cos(a), Rm * math.sin(a), z + rng.uniform(-.002, .002)),
                (depth + rng.uniform(-.006, .006), w + rng.uniform(-.006, .004), ch - 0.009 + rng.uniform(-.002, .002)),
                rng.choice(M['bricks']), bevel=0.012, seg=2, uv=0.35, rot=(rng.uniform(-.02, .02), rng.uniform(-.02, .02), a + rng.uniform(-.02, .02)))
            # 灰缝：每块砖后面一块略大的灰浆衬底，从缝里露出来（炉口处自然没有）
            box((Rm * math.cos(a), Rm * math.sin(a), z - 0.004), (depth * .8, w + 0.016, ch - 0.006), M['mortar'], bevel=0, uv=0.4, rot=(0, 0, a))
    # 内壁熏黑（炉口以上整圈）+ 炉底灰
    lathe([(Rm - depth / 2 - 0.002, 3 * ch), (Rm - depth / 2 - 0.002, H - 0.002)], M['soot'], seg=48)
    lathe([(0.0, 0.03), (Rm - depth / 2, 0.03)], M['ash'], seg=48)
    # 炉口：两侧砖颊熏黑，炉口上一根过梁砖
    for s in (-1, 1):
        a = -math.pi / 2 + s * mouth
        box(((Rm) * math.cos(a), (Rm) * math.sin(a), 3 * ch / 2), (depth, 0.012, 3 * ch), M['soot'], bevel=0, uv=0.4, rot=(0, 0, a))
    # 炭：堆在炉口后面，亮炭多、黑炭少，前面掉出几颗
    for i in range(26):
        x = rng.uniform(-0.17, 0.17); y = rng.uniform(-0.46, -0.22)
        sphere((x, y, 0.06 + rng.uniform(0, 0.06) * (1 - abs(x) / .2)), rng.uniform(0.022, 0.042),
               M['ember'] if i % 4 else M['coal'], scale=(1, rng.uniform(.8, 1.2), .7), seg=8, rings=5, rot=(0, 0, rng.random() * 3))
    for i in range(4):
        sphere((rng.uniform(-0.12, 0.12), rng.uniform(-0.56, -0.5), 0.018), rng.uniform(0.014, 0.022), M['ash'] if i % 2 else M['coal'], scale=(1, 1, .6), seg=8, rings=5)
    return finish('PROP_Common_CharcoalStove_A', (1.1, 1.1, 0.41))


def bowl(name, glaze, rim_mat=None, inner=None, band=None, coarse=False, deep=False):
    """瓷碗：圈足、外撇碗沿、内外釉、一圈青花或青釉线。"""
    R = 0.383
    h = 0.20 if not deep else 0.20
    outer = [(0.11, 0.0), (0.118, 0.0), (0.122, 0.028), (0.135, 0.032), (0.16, 0.045), (0.24, 0.085), (0.31, 0.13),
             (0.355, 0.17), (0.378, 0.193), (0.383, 0.2)]
    inn = [(0.37, 0.2), (0.364, 0.19), (0.33, 0.16), (0.27, 0.115), (0.19, 0.075), (0.10, 0.058), (0.0, 0.055)]
    if deep:
        outer = [(0.11, 0.0), (0.118, 0.0), (0.122, 0.028), (0.15, 0.035), (0.22, 0.07), (0.29, 0.12), (0.33, 0.16), (0.36, 0.19), (0.383, 0.2)]
    lathe(outer, glaze, seg=56)
    lathe(inn, inner or glaze, seg=56)
    lathe([(0.0, 0.004), (0.11, 0.0)], M['coarse'] if not coarse else glaze, seg=56)
    torus((0, 0, 0.199), 0.3765, 0.0068, rim_mat or glaze, seg=56, mseg=8)
    if band:
        lathe([(0.3215, 0.143), (0.3285, 0.149), (0.3348, 0.155)], band, seg=56)
        lathe([(0.2310, 0.078), (0.2345, 0.080)], band, seg=56)
    return finish(name, (0.766, 0.766, 0.2))


def tray():
    """木托盘：整块底板 + 四边倒角框，木纹顺长边。"""
    box((0, 0, 0.012), (1.1, 0.5, 0.024), M['honey'], bevel=0.004, uv=0.6)
    for y in (-0.235, 0.235):
        box((0, y, 0.035), (1.1, 0.03, 0.05), M['oak'], bevel=0.008, seg=3, uv=0.6)
    for x in (-0.535, 0.535):
        box((x, 0, 0.035), (0.03, 0.44, 0.05), M['oak'], bevel=0.008, seg=3, uv=0.6)
    return finish('PROP_WarmWood_Tray_A', (1.1, 0.5, 0.06))


ASSETS = {
    'PROP_Common_Pot_Open': pot_open,
    'FOOD_Common_PlainCongee': lambda: congee_surface('FOOD_Common_PlainCongee', 0.34, (0.68, 0.68, 0.014), bowl=True),
    'FOOD_Common_RiceGrains': rice_grains,
    'PROP_Common_CharcoalStove_A': charcoal_stove,
    'PROP_Common_Bowl_A': lambda: bowl('PROP_Common_Bowl_A', M['celadon'], band=M['green_line']),
    'PROP_Common_Bowl_Coarse': lambda: bowl('PROP_Common_Bowl_Coarse', M['coarse'], coarse=True, band=M['glaze_brown']),
    'PROP_WarmWood_Bowl_Glaze': lambda: bowl('PROP_WarmWood_Bowl_Glaze', M['glaze_amber'], inner=M['glaze_cream'], rim_mat=M['glaze_brown']),
    'PROP_MorningWhite_Bowl_Porcelain': lambda: bowl('PROP_MorningWhite_Bowl_Porcelain', M['porcelain'], band=M['blue_line']),
    'PROP_NightBlue_Bowl_Deep': lambda: bowl('PROP_NightBlue_Bowl_Deep', M['glaze_indigo'], inner=M['porcelain'], deep=True),
    'PROP_WarmWood_Tray_A': tray,
}

extra = globals().get('EXTRA_ASSETS')
if extra:
    ASSETS.update(extra(globals()))

order = [k for k in ASSETS if ONLY is None or k in ONLY]
for i, key in enumerate(order):
    o = ASSETS[key]()
    o['v2_part'] = False
    if LAYOUT:
        o.location = ((i % 6) * 2.2, -(i // 6) * 2.2, 0)
    o.hide_set(False)

man = SOURCE / 'manifest_v2.json'
data = json.loads(man.read_text()) if man.exists() else {}
data.update(built)
man.write_text(json.dumps(data, ensure_ascii=False, indent=1))
result = {'built': built}
