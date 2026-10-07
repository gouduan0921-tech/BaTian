"""粥霸天 正式物件 v2 —— 店铺环境与 25 件装修（由 build_props_v2.py 在同一命名空间里执行）。

每件的外形布局（朝向 -Y 为正面、底面中心为原点、外包尺寸）与 v1（build_props.py）一致，
所以 install_props.py 的摆放不用改；细节按设计稿「店铺场景」加：
- 墙：小块青釉砖逐块倒角、灰缝、木压条、石灰墙、熏色大梁与梁头木销；
- 前台：木板台面 + 青砖立面 + 台沿下一条暖光灯带；后台：不锈钢柜门/抽屉 + 米色石台面；
- 招牌：深木框 + 浮雕金字 + 冒热气的碗徽；灯：带竹骨褶皱的纸灯、黑铁/铜壁灯；
- 家具：榫接桌凳、拉档；植物：成片带中脉的弯叶；装修：逐块砖/瓷砖、门帘褶皱、窗格等。
"""
import math
from mathutils import Vector

# ───────────────────────── 补充材质 ─────────────────────────
M['pale'] = material('PaleAsh', (.82, .68, .48), .55, tex=tex_wood('Pale_A', (.82, .68, .48), rings=16, seed=13)[0],
                     normal=_images['Pale_A_N'], nstrength=.5)
M['white_paint'] = material('WhitePaint', (.90, .88, .82), .6, tex=tex_noise_surface('PaintW_A', (.90, .88, .82), n=512, seed=71, var=.04, scale=12)[0])
M['steel_dark'] = material('SteelPanel', (.45, .45, .44), .4, .85, tex=_images['Steel_A'])
M['black_metal'] = material('BlackMetal', (.03, .03, .03), .45, .7)
M['led'] = material('WarmStrip', (1.0, .80, .45), .5, glow=4.0)
M['bulb'] = material('WarmBulb', (1.0, .78, .45), .4, glow=8.0)
M['glass'] = material('MorningGlass', (.86, .90, .86), .15, glow=.35)
M['ink'] = material('Ink', (.10, .06, .04), .8)
M['stone'] = material('StoneBase', (.42, .40, .37), .9, tex=tex_noise_surface('Stone_B', (.42, .40, .37), n=512, seed=77, speck=.02, var=.15)[0],
                      normal=_images['Stone_B_N'], nstrength=1.0)
M['white_tile'] = material('WhiteTile', (.92, .90, .84), .2, coat=.6)
M['cobalt'] = material('CobaltGlaze', (.14, .26, .52), .2, coat=.6)
M['amber_glass'] = material('AmberJar', (.45, .22, .07), .15, coat=.8)
M['flower'] = material('SmallFlower', (.95, .93, .86), .6)
M['bamboo'] = material('Bamboo', (.68, .52, .30), .5)


def leaf(base, yaw, pitch, length, width, mat, droop=0.35, segs=5):
    """一片弯叶：叶尖下垂、中脉略凸，正反两面都有面（GLB 单面渲染也看得见）。"""
    base = Vector(base)
    d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
    side = Vector((-math.sin(yaw), math.cos(yaw), 0))
    verts, faces = [], []
    for i in range(segs + 1):
        t = i / segs
        w = width * math.sin(math.pi * min(1, t * 1.1 + .05)) * (1 - .25 * t)
        p = base + d * (length * t) + Vector((0, 0, -droop * length * t * t))
        mid = p + Vector((0, 0, .12 * width))
        verts += [p - side * w, mid, p + side * w]
    for i in range(segs):
        a = i * 3
        faces += [(a, a + 3, a + 4, a + 1), (a + 1, a + 4, a + 5, a + 2)]
    n = len(verts)
    verts += [v - Vector((0, 0, .0015)) for v in verts]
    faces += [tuple(reversed([x + n for x in f])) for f in faces[:]]
    me = bpy.data.meshes.new('leaf'); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    o = link(bpy.data.objects.new('part', me))
    for p in me.polygons: p.use_smooth = True
    uv_box(o, .2)
    return use(o, mat)


def tile_grid(x0, x1, z0, z1, y, cols, rows, mats, depth=.024, gap=.008, bevel=.004, jitter=True, offset_rows=False):
    w = (x1 - x0) / cols; h = (z1 - z0) / rows
    for r_ in range(rows):
        off = (w / 2 if offset_rows and r_ % 2 else 0)
        for c in range(cols + (1 if off else 0)):
            xa = max(x0, x0 + c * w - off); xb = min(x1, x0 + (c + 1) * w - off)
            if xb - xa < .02: continue
            m = mats[rng.randrange(len(mats))] if isinstance(mats, list) else mats
            box(((xa + xb) / 2, y + (rng.uniform(-.0015, .0015) if jitter else 0), z0 + (r_ + .5) * h),
                (xb - xa - gap, depth, h - gap), m, bevel=bevel, seg=1, uv=.4,
                rot=((rng.uniform(-.006, .006), 0, rng.uniform(-.004, .004)) if jitter else (0, 0, 0)))


# ───────────────────────── 建筑 ─────────────────────────

def wall(L, name, dims):
    box((0, 0, .56), (L, .13, 1.12), M['grout'], bevel=0, uv=.5)
    tile_grid(-L / 2, L / 2, 0.0, 1.12, -.072, round(L / .2), 6, M['tiles'], depth=.03)
    box((0, -.1, .045), (L, .02, .09), M['dark'], bevel=.004, uv=.6)                    # 踢脚
    box((0, -.018, 1.16), (L, .17, .07), M['oak'], bevel=.012, seg=2, uv=.6)             # 砖顶木压条
    box((0, -.018, 1.205), (L, .12, .02), M['dark'], bevel=.004, uv=.6)
    box((0, 0, 2.065), (L, .115, 1.87), M['plaster'], bevel=.008, uv=1.6)                # 石灰墙
    box((0, -.06, 2.93), (L, .03, .1), M['oak'], bevel=.006, uv=.6)                       # 梁下挂镜线
    box((0, 0, 3.09), (L + .3, .24, .18), M['dark'], bevel=.02, seg=2, uv=.8)            # 大梁
    for x in (-(L + .3) / 2 + .08, (L + .3) / 2 - .08):                                   # 梁头木销
        for z in (3.05, 3.13):
            cyl((x, -.122, z), .014, .012, M['oak'], seg=10, rot=(math.pi / 2, 0, 0))
    return finish(name, dims)


def post():
    box((0, 0, 1.60), (.26, .26, 3.20), M['dark'], bevel=.025, seg=2, uv=.8)
    box((0, 0, .06), (.34, .34, .12), M['stone'], bevel=.02, seg=2, uv=.5)
    box((0, 0, 3.26), (.34, .34, .12), M['oak'], bevel=.02, seg=2, uv=.6)
    for z in (.3, 2.9):
        box((0, 0, z), (.275, .275, .035), M['black_metal'], bevel=.004, uv=.5)
        for s in (-1, 1):
            sphere((s * .07, -.138, z), .009, M['black_metal'], seg=8, rings=5)
    return finish('ENV_WarmWood_Post_A', (.34, .34, 3.32))


def back_counter():
    w, h, n = 8.05, .87, 8
    box((0, 0, (h - .08) / 2), (w - .06, .94, h - .08), M['steel_dark'], bevel=.006, uv=.8)
    for k in range(n):
        x = -w / 2 + (k + .5) * w / n
        bw = w / n - .05
        box((x, -.481, .37), (bw, .025, .60), M['steel'], bevel=.008, uv=.8)               # 柜门
        box((x, -.495, .37), (bw - .12, .006, .48), M['steel_dark'], bevel=.002, uv=.8)    # 门芯
        rod((x - .13, -.508, .62), (x + .13, -.508, .62), .011, M['steel'])                # 拉手
        for xx in (x - .13, x + .13):
            rod((xx, -.494, .62), (xx, -.508, .62), .008, M['steel'], seg=8)
        box((x, -.481, .73), (bw, .025, .10), M['steel'], bevel=.006, uv=.8)               # 抽屉
        box((x, -.497, .73), (.12, .01, .022), M['black_metal'], bevel=.003, uv=.3)
    box((0, 0, h - .035), (w, 1.0, .07), M['counter_top'], bevel=.012, seg=2, uv=1.2)    # 米色石台面
    box((0, -.30, .035), (w - .1, .035, .07), M['dark'], bevel=.004, uv=.6)
    return finish('PROP_Common_BackCounter_A', (8.05, 1.018, .87))


def front_counter():
    w, h = 7.0, 1.0
    box((0, 0, .46), (w - .06, .60, .92), M['grout'], bevel=0, uv=.6)
    tile_grid(-w / 2 + .03, w / 2 - .03, .07, .86, -.311, 44, 5, M['tiles'], depth=.026)
    box((0, -.315, .035), (w - .1, .035, .07), M['dark'], bevel=.004, uv=.6)             # 踢脚
    box((0, -.326, .885), (w - .06, .012, .03), M['oak'], bevel=.003, uv=.6)             # 灯槽挡板
    box((0, -.318, .868), (w - .14, .008, .008), M['led'], bevel=0, uv=0)                 # 台沿下暖光灯带
    for k in range(6):                                                                     # 六条木板台面
        dep = .72 / 6
        box((0, -.36 + (k + .5) * dep, h - .035), (w + rng.uniform(-.01, 0), dep - .004, .07), M['honey'], bevel=.01, seg=2, uv=.7)
    return finish('PROP_WarmWood_FrontCounter_A', (7.0, .718, 1.0))


def sign():
    box((0, 0, .48), (3.45, .08, .96), M['dark'], bevel=.03, seg=3, uv=.8)               # 外框
    box((0, -.045, .48), (3.24, .02, .77), M['oak'], bevel=.008, uv=.7)                   # 内板
    for z in (.075, .885):
        box((0, -.06, z), (3.3, .01, .014), M['brass'], bevel=.003, uv=0)
    for x in (-1.6, 1.6):
        for z in (.075, .885):
            sphere((x, -.062, z), .016, M['brass'], seg=10, rings=6)
    text_mesh('粥霸天', (.32, -.062, .40), .50, M['gold'], extrude=.018, bevel=.004)       # 浮雕金字
    # 碗徽：一只侧看的碗（立体，向外凸），上面三缕热气
    lathe([(0, 0), (.11, 0), (.12, .015), (.20, .12), (.22, .15), (.205, .16), (.10, .04), (0, .035)], M['gold'], pos=(-1.1, -.02, .30), seg=32)
    for i, dx in enumerate((-.08, 0, .08)):
        pts = [(-1.1 + dx + .025 * math.sin(t * 2.4 + i), -.06, .50 + t * .07) for t in range(5)]
        for a, b in zip(pts, pts[1:]):
            rod(a, b, .009, M['gold'], seg=8)
    for x in (-1.2, 1.2):                                                                  # 背后挂钩
        box((x, .12, .9), (.04, .16, .03), M['black_metal'], bevel=.004, uv=.3)
    return finish('PROP_WarmWood_Sign_A', (3.45, .44, .96))


# ───────────────────────── 器物 ─────────────────────────

def small_jar(x, z, kind, scale=1.0):
    s = scale
    if kind == 'clay':
        lathe([(0, 0), (.10 * s, 0), (.13 * s, .02 * s), (.15 * s, .14 * s), (.13 * s, .23 * s), (.09 * s, .26 * s), (.09 * s, .29 * s), (0, .29 * s)],
              M['glaze_brown'], pos=(x, 0, z), seg=28)
        lathe([(0, .29 * s), (.10 * s, .29 * s), (.10 * s, .305 * s), (.03 * s, .31 * s), (.03 * s, .33 * s), (0, .33 * s)], M['oak'], pos=(x, 0, z), seg=24)
    elif kind == 'copper':
        lathe([(0, 0), (.09 * s, 0), (.10 * s, .03 * s), (.10 * s, .20 * s), (.085 * s, .22 * s), (.085 * s, .24 * s), (0, .24 * s)], M['copper'], pos=(x, 0, z), seg=28)
        lathe([(0, .24 * s), (.09 * s, .24 * s), (.05 * s, .27 * s), (.015 * s, .275 * s), (.015 * s, .30 * s), (0, .30 * s)], M['copper'], pos=(x, 0, z), seg=24)
        torus((x, 0, z + .12 * s), .102 * s, .005, M['brass'], seg=28, mseg=6)
    elif kind == 'amber':
        lathe([(0, 0), (.07 * s, 0), (.08 * s, .02 * s), (.08 * s, .20 * s), (.04 * s, .26 * s), (.035 * s, .30 * s), (0, .30 * s)], M['amber_glass'], pos=(x, 0, z), seg=24)
        lathe([(0, .30 * s), (.04 * s, .30 * s), (.04 * s, .34 * s), (0, .34 * s)], M['oak'], pos=(x, 0, z), seg=16)
    elif kind == 'steamer':
        for j in range(2):
            lathe([(.13 * s, j * .09 * s), (.13 * s, (j + 1) * .09 * s - .004), (.12 * s, (j + 1) * .09 * s - .004), (.12 * s, j * .09 * s + .01)],
                  M['bamboo'], pos=(x, 0, z), seg=32)
            torus((x, 0, z + (j + .5) * .09 * s), .132 * s, .004, M['oak'], seg=32, mseg=6)
        lathe([(0, .18 * s), (.13 * s, .18 * s), (.06 * s, .23 * s), (.02 * s, .235 * s), (.02 * s, .25 * s), (0, .25 * s)], M['bamboo'], pos=(x, 0, z), seg=32)
    elif kind == 'cream':
        lathe([(0, 0), (.06 * s, 0), (.08 * s, .05 * s), (.08 * s, .17 * s), (.05 * s, .21 * s), (.03 * s, .23 * s), (.035 * s, .25 * s), (0, .25 * s)],
              M['glaze_cream'], pos=(x, 0, z), seg=24)
        torus((x, 0, z + .21 * s), .05 * s, .004, M['red_cord'], seg=20, mseg=6)


def shelf_jars():
    box((0, 0, .025), (6.2, .3, .05), M['oak'], bevel=.008, uv=.7)
    box((0, .14, .045), (6.2, .02, .04), M['dark'], bevel=.003, uv=.6)
    for x in (-2.5, 0, 2.5):
        box((x, .03, -.0), (.05, .22, .08), M['black_metal'], bevel=.006, uv=.3)
    kinds = ['clay', 'copper', 'amber', 'steamer', 'cream', 'copper', 'clay', 'amber', 'cream', 'steamer', 'copper', 'clay', 'amber']
    xs = [-2.85 + i * 5.7 / (len(kinds) - 1) for i in range(len(kinds))]
    for x, k in zip(xs, kinds):
        small_jar(x + rng.uniform(-.04, .04), .05, k, scale=rng.uniform(.95, 1.05) if k != 'steamer' else 1.0)
    return finish('PROP_WarmWood_Shelf_Jars', (6.2, .3, .405))


def mini_bowl(x, y, z, r, h, glaze, fill=None, seg=24):
    foot = r * .35
    lathe([(0, 0), (foot, 0), (foot * 1.05, h * .12), (r * .6, h * .45), (r * .92, h * .85), (r, h), (r - .006, h), (r * .88, h * .8), (r * .55, h * .4), (0, h * .3)],
          glaze, pos=(x, y, z), seg=seg)
    if fill is not None:
        mat, kind = fill
        lathe([(0, h * .7), (r * .86, h * .72), (r * .9, h * .7)], mat if kind == 'flat' else M['congee'], pos=(x, y, z), seg=seg)
        if kind != 'flat':
            for i in range(14):
                a = rng.random() * math.tau; d = r * .7 * math.sqrt(rng.random())
                if kind == 'scallion':
                    cyl((x + d * math.cos(a), y + d * math.sin(a), z + h * .76), .009, .01, M['scallion'], seg=8, rot=(rng.random(), rng.random(), 0))
                elif kind == 'pork':
                    box((x + d * math.cos(a), y + d * math.sin(a), z + h * .76), (.03, .018, .012), M['pork'], bevel=.004, uv=.3, rot=(0, 0, rng.random() * 3))
                elif kind == 'chili':
                    box((x + d * math.cos(a), y + d * math.sin(a), z + h * .76), (.014, .014, .006), M['chili'], bevel=.002, uv=.3, rot=(0, 0, rng.random() * 3))


def prep_board():
    box((0, -.02, .025), (.9, .46, .05), M['pale'], bevel=.02, seg=3, uv=.5)
    box((.1, -.1, .057), (.27, .11, .006), M['knife'], bevel=.002, uv=.3, rot=(0, 0, .12))          # 菜刀
    box((.30, -.075, .066), (.15, .034, .03), M['dark'], bevel=.008, uv=.3, rot=(0, 0, .12))
    for i in range(10):                                                                               # 切好的葱段
        cyl((-.25 + rng.uniform(-.06, .06), -.12 + rng.uniform(-.04, .04), .056), .008, .016, M['scallion'], seg=8, rot=(0, math.pi / 2, rng.random() * 3))
    for k, kind in enumerate(('scallion', 'pork', 'chili')):
        mini_bowl(-.27 + k * .27, .17, .05, .095, .06, M['porcelain'], (M['congee'], kind))
    return finish('PROP_Common_PrepBoard_A', (.9, .528, .11))


def bowl_stack():
    box((0, .02, .02), (.95, .60, .04), M['oak'], bevel=.01, uv=.6)
    for x, y in [(-.24, -.08), (.18, -.08), (-.04, .2)]:
        for j in range(3):
            mini_bowl(x, y, .04 + j * .05, .14, .07, M['porcelain'], seg=28)
            torus((x, y, .04 + j * .05 + .055), .126, .003, M['green_line'], seg=28, mseg=5)
    return finish('PROP_Common_BowlStack_A', (.95, .643, .21))


def plant(kind, name, dims):
    pot_mat = {'plant': M['terra'], 'mint': M['porcelain'], 'scallion': M['coarse']}[kind]
    lathe([(0, 0), (.11, 0), (.13, .02), (.17, .25), (.185, .25), (.185, .285), (.16, .285), (.145, .24), (0, .24)], pot_mat, seg=36)
    torus((0, 0, .27), .182, .006, M['oak'] if kind == 'plant' else M['blue_line'] if kind == 'mint' else M['glaze_brown'], seg=36, mseg=6)
    lathe([(0, .25), (.15, .248)], M['soil'], seg=36)
    if kind == 'scallion':
        for i in range(16):
            a = rng.random() * math.tau; d = .07 * math.sqrt(rng.random())
            x, y = d * math.cos(a), d * math.sin(a)
            tilt = rng.uniform(.0, .35)
            pts = [Vector((x, y, .25))]
            for s in range(1, 5):
                t = s / 4
                pts.append(Vector((x + math.cos(a) * tilt * .28 * t * t, y + math.sin(a) * tilt * .28 * t * t, .25 + (.30 + rng.random() * .14) * t)))
            for si, (p0, p1) in enumerate(zip(pts, pts[1:])):
                rod(p0, p1, .009 - si * .0015, M['flower'] if si == 0 else M['scallion'], seg=8)
    else:
        n = 34 if kind == 'plant' else 44
        for i in range(n):
            yaw = i * 2.39996 + rng.uniform(-.2, .2)
            h = rng.random()
            r0 = .03 + .06 * rng.random()
            base = (r0 * math.cos(yaw), r0 * math.sin(yaw), .26 + h * (.36 if kind == 'plant' else .22))
            rod((0, 0, .25), base, .004, M['stem'], seg=6)
            L = (.17 if kind == 'plant' else .09) * rng.uniform(.8, 1.2)
            leaf(base, yaw, math.radians(rng.uniform(15, 55)), L, L * (.32 if kind == 'plant' else .45),
                 M['leaf'] if i % 3 else M['leaf2'], droop=.45 if kind == 'plant' else .25)
    return finish(name, dims)


def paper_lantern(name, paper):
    prof = [(0, 0), (.10, 0), (.10, .06), (.19, .10), (.25, .24), (.26, .40), (.23, .55), (.13, .65), (.10, .66), (.10, .70), (0, .70)]
    o = lathe(prof, paper, seg=64)
    for v in o.data.vertices:                                                       # 纸褶
        r = math.hypot(v.co.x, v.co.y)
        if r > .11:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 + .014 * math.cos(a * 32)
            v.co.x *= k; v.co.y *= k
    lathe([(0, -.002), (.115, -.002), (.12, .03), (.105, .065), (0, .065)], M['dark'], seg=32)        # 底座木托
    lathe([(0, .64), (.115, .64), (.12, .68), (.105, .705), (0, .705)], M['dark'], seg=32)          # 顶盖
    def r_at(z):
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            if z0 <= z <= z1 and z1 > z0:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return .1
    for z in (.10, .16, .22, .28, .34, .40, .46, .52, .58):                         # 竹骨
        torus((0, 0, z), r_at(z) + .003, .0035, M['bamboo'], seg=48, mseg=6)
    text_mesh('粥', (0, -.268, .37), .15, M['ink'], extrude=.002, bevel=0)
    torus((0, 0, .74), .033, .005, M['black_metal'], rot=(math.pi / 2, 0, 0), seg=16, mseg=6)
    rod((0, 0, .705), (0, 0, .707), .01, M['black_metal'])
    return finish(name, (.532, .532, .778))


def wall_lamp(name, shade_mat):
    lathe([(.05, .14), (.16, .20), (.22, .32), (.21, .34), (.04, .35)], shade_mat, seg=48)
    lathe([(.04, .345), (.20, .335), (.205, .325), (.155, .21), (.05, .15)], M['glaze_cream'], seg=48)   # 罩内反光面
    rod((0, 0, .0), (0, 0, .28), .015, shade_mat)
    lathe([(0, 0), (.09, 0), (.10, .02), (.08, .04), (0, .04)], M['dark'], seg=32)
    sphere((0, 0, .20), .045, M['bulb'], seg=16, rings=10)
    lathe([(.02, .22), (.03, .24), (.03, .27), (.02, .28)], M['brass'], seg=16)
    return finish(name, (.44, .44, .35))


def curtain(name, cloth):
    rod((-.6, 0, .74), (.6, 0, .74), .024, M['dark'])
    for x in (-.6, .6):
        sphere((x, 0, .74), .03, M['dark'], seg=12, rings=8)
    for panel in (-1, 1):
        nx, nz = 28, 12
        vs, fs = [], []
        for j in range(nz + 1):
            for i in range(nx + 1):
                x = panel * .275 + (i / nx - .5) * .52
                t = 1 - j / nz
                z = j / nz * .68 + .02 * math.cos(i * math.pi / 3.5) * t
                vs.append((x, .026 * math.sin(i * math.pi / 3.5) * (.6 + .4 * t), z))
        for j in range(nz):
            for i in range(nx):
                a = j * (nx + 1) + i; fs.append((a, a + 1, a + nx + 2, a + nx + 1))
        n = len(vs)
        vs += [(x, y + .002, z) for x, y, z in vs]
        fs += [tuple(reversed([q + n for q in f])) for f in fs[:]]
        me = bpy.data.meshes.new('cloth'); me.from_pydata(vs, [], fs); me.update()
        o = link(bpy.data.objects.new('part', me))
        uvl = me.uv_layers.new()
        for p in me.polygons:
            p.use_smooth = True
            for li in p.loop_indices:
                vi = me.loops[li].vertex_index % n
                uvl.data[li].uv = ((vi % (nx + 1)) / nx * .6, (vi // (nx + 1)) / nz * .8)
        use(o, cloth)
        box((panel * .275, 0, .015), (.52, .02, .03), cloth, bevel=.004, uv=.3)
        for i in range(5):                                                         # 穿杆布环
            x = panel * .275 + (i / 4 - .5) * .48
            torus((x, 0, .72), .03, .008, cloth, rot=(0, math.pi / 2, 0), seg=16, mseg=6)
    text_mesh('粥', (-.275, -.045, .34), .19, M['gold'], extrude=.004, bevel=.001)
    text_mesh('香', (.275, -.045, .34), .19, M['gold'], extrude=.004, bevel=.001)
    return finish(name, (1.2, .0695, .789))


def table(kind, mat, name, dims):
    h = .765
    if kind == 'round':
        lathe([(0, h - .045), (.40, h - .045), (.42, h - .035), (.42, h - .01), (.405, h), (0, h)], mat, seg=64)
        legs = [(-.22, -.22), (-.22, .22), (.22, -.22), (.22, .22)]
        torus((0, 0, h - .08), .30, .022, mat, seg=48, mseg=8)                    # 圆桌下的围圈
    else:
        w = .82 if kind == 'square' else 1.02
        for i in range(4):
            box((0, -.28 + (i + .5) * .14, h - .024), (w - rng.uniform(0, .006), .136, .048), mat, bevel=.008, seg=2, uv=.6)
        legs = [(-w / 2 + .07, -.21), (-w / 2 + .07, .21), (w / 2 - .07, -.21), (w / 2 - .07, .21)]
        for y in (-.22, .22):
            box((0, y, h - .10), (w - .16, .035, .10), mat, bevel=.006, uv=.6)
        for x in (-w / 2 + .07, w / 2 - .07):
            box((x, 0, h - .10), (.035, .40, .10), mat, bevel=.006, uv=.6)
            box((x, 0, .16), (.03, .40, .035), mat, bevel=.005, uv=.6)                # 拉档
        box((0, 0, .16), (w - .16, .03, .035), mat, bevel=.005, uv=.6)
    for x, y in legs:
        box((x, y, (h - .045) / 2), (.05, .05, h - .045), mat, bevel=.008, seg=2, uv=.6)
    return finish(name, dims)


def stool():
    lathe([(0, .425), (.17, .425), (.19, .435), (.19, .462), (.18, .4715), (0, .466)], M['honey'], seg=40)
    for k in range(4):
        a = k * math.tau / 4 + math.pi / 4
        rod((.15 * math.cos(a), .15 * math.sin(a), 0), (.11 * math.cos(a), .11 * math.sin(a), .43), .02, M['oak'], seg=10)
    torus((0, 0, .17), .135, .012, M['oak'], seg=32, mseg=8)
    return finish('PROP_WarmWood_Stool_A', (.38, .38, .472))


def counter_veneer(name, style):
    top = {'warm': M['honey'], 'porcelain': M['white_tile'], 'brass': M['dark'], 'jar': M['honey']}[style]
    if style == 'porcelain':
        box((0, 0, .02), (6.9, .66, .04), M['grout'], bevel=0, uv=.5)
        for c in range(20):
            for r_ in range(2):
                box((-3.45 + (c + .5) * 6.9 / 20, -.33 + (r_ + .5) * .33, .047), (6.9 / 20 - .01, .32, .014), M['white_tile'], bevel=.004, seg=1, uv=.4)
    else:
        for k in range(5):
            box((0, -.33 + (k + .5) * .132, .027), (6.9, .128, .054), top, bevel=.008, seg=2, uv=.7)
    fascia = {'warm': M['oak'], 'porcelain': M['white_tile'], 'brass': M['dark'], 'jar': M['terra']}[style]
    box((0, -.345, -.20), (6.9, .04, .45), M['grout'] if style in ('porcelain', 'jar') else fascia, bevel=.004, uv=.7)
    if style in ('porcelain', 'jar'):
        tile_grid(-3.45, 3.45, -.42, .02, -.367, 46, 3, [fascia] if style == 'porcelain' else [M['terra'], M['clay_foot']], depth=.012, offset_rows=True)
    else:
        for k in range(23):                                                        # 竖向企口板
            box((-3.45 + (k + .5) * 6.9 / 23, -.365, -.20), (6.9 / 23 - .008, .006, .43), fascia, bevel=.003, uv=.6)
    trim = M['brass'] if style == 'brass' else M['dark']
    for k in range(12):
        box((-3.16 + k * .575, -.373, -.20), (.018, .012, .41), trim, bevel=.002, uv=.3)
    box((0, -.37, .02), (6.9, .018, .02), trim, bevel=.002, uv=.3)
    return finish(name, (6.9, .709, .479))


def stove_backsplash(name, style):
    if style == 'brick':
        box((0, .01, .25), (7.6, .03, .5), M['mortar'], bevel=0, uv=.5)
        tile_grid(-3.8, 3.8, 0, .5, -.012, 30, 8, M['bricks'], depth=.026, gap=.012, bevel=.006, offset_rows=True)
    elif style == 'tile':
        box((0, .01, .25), (7.6, .03, .5), M['grout'], bevel=0, uv=.5)
        tile_grid(-3.8, 3.8, 0, .5, -.012, 50, 4, [M['white_tile'], M['white_tile'], M['porcelain']], depth=.026)
        box((0, -.02, .48), (7.6, .012, .03), M['cobalt'], bevel=.003, uv=.3)
    else:
        box((0, 0, .25), (7.6, .05, .5), M['black_metal'], bevel=.006, uv=.5)
        for k in range(15):
            x = -3.8 + (k + .5) * 7.6 / 15
            box((x - 7.6 / 30, -.026, .25), (.012, .006, .5), M['iron_matte'], bevel=.002, uv=.3)
            for z in (.05, .45):
                sphere((x, -.027, z), .008, M['brass'], seg=8, rings=5)
    rail = M['brass'] if style == 'iron' else M['steel']
    rod((-2.5, -.13, .65), (2.5, -.13, .65), .018, rail)
    for x in (-2.5, 0, 2.5):
        rod((x, -.13, .65), (x, -.02, .65), .012, rail, seg=8)
    for i, x in enumerate((-1.8, -.9, 0, .9, 1.8)):
        torus((x, -.13, .615), .018, .004, rail, rot=(math.pi / 2, 0, 0), seg=12, mseg=5)  # 挂钩
        if i % 2 == 0:                                                                       # 长柄勺
            rod((x, -.13, .60), (x, -.13, .25), .009, M['steel'], seg=8)
            lathe([(0, 0), (.05, 0), (.065, .025), (.055, .035), (.05, .033), (.045, .01), (0, .008)], M['steel'], pos=(x, -.13, .20), seg=24)
        elif i == 1:                                                                         # 漏勺
            rod((x, -.13, .60), (x, -.13, .30), .009, M['dark'], seg=8)
            lathe([(0, 0), (.06, .02), (.065, .025)], M['iron_matte'], pos=(x, -.13, .26), seg=24)
            torus((x, -.13, .285), .063, .004, M['steel'], seg=24, mseg=5)
        else:                                                                                # 木铲
            rod((x, -.13, .60), (x, -.13, .32), .010, M['oak'], seg=8)
            box((x, -.13, .27), (.08, .012, .10), M['oak'], bevel=.006, uv=.3)
    return finish(name, (7.6, .22, .668))


def window():
    frame = M['white_paint']
    for x in (-.75, .75):
        box((x, 0, .55), (.06, .10, 1.10), frame, bevel=.008, uv=.5)
    for z in (.03, 1.07):
        box((0, 0, z), (1.56, .10, .06), frame, bevel=.008, uv=.5)
    box((0, .035, .55), (1.44, .01, .98), M['glass'], bevel=0, uv=.5)
    for x in (-.48, -.24, 0, .24, .48):                                            # 窗格
        box((x, -.005, .55), (.022, .05, .98), M['pale'], bevel=.003, uv=.4)
    for z in (.30, .55, .80):
        box((0, -.005, z), (1.44, .05, .022), M['pale'], bevel=.003, uv=.4)
    box((0, -.07, .02), (1.68, .23, .04), M['pale'], bevel=.01, seg=2, uv=.5)
    for x in (-.4, .4):                                                            # 窗台托
        box((x, -.1, -.0), (.04, .12, .04), M['pale'], bevel=.004, uv=.3)
    return finish('PROP_MorningWhite_Window_Morning', (1.68, .235, 1.1))


def chime():
    lathe([(.03, .10), (.10, .15), (.095, .17), (.09, .2), (.06, .30), (.03, .325), (.02, .33)], M['brass'], seg=48)
    lathe([(.025, .325), (.02, .335), (0, .34)], M['brass'], seg=24)
    sphere((0, 0, .17), .018, M['brass'], seg=12, rings=8)
    rod((0, 0, .0), (0, 0, .41), .003, M['red_cord'], seg=6)
    box((0, 0, .045), (.06, .004, .09), M['paper_white'], bevel=.001, uv=.2)
    text_mesh('福', (0, -.004, .05), .04, M['red_cord'], extrude=.0008, bevel=0)
    torus((0, 0, .43), .022, .004, M['brass'], rot=(math.pi / 2, 0, 0), seg=16, mseg=6)
    return finish('PROP_NightBlue_Chime_Brass', (.2, .2, .456))


def menu_board():
    box((0, 0, .30), (.42, .05, .60), M['dark'], bevel=.014, seg=2, uv=.5)
    box((0, -.027, .30), (.36, .008, .53), M['glaze_indigo'], bevel=.002, uv=.4)
    text_mesh('今日粥品', (0, -.032, .49), .058, M['chalk'], extrude=.0015, bevel=0)
    box((0, -.032, .44), (.26, .002, .004), M['chalk'], bevel=0, uv=0)
    for j, s in enumerate(['白粥 · 6', '瘦肉粥 · 12', '鸡丝粥 · 14']):
        text_mesh(s, (0, -.032, .37 - j * .09), .042, M['chalk'], extrude=.0015, bevel=0)
    rod((-.16, .12, 0), (-.16, 0, .55), .012, M['oak'], seg=8)
    rod((.16, .12, 0), (.16, 0, .55), .012, M['oak'], seg=8)
    return finish('PROP_NightBlue_MenuBoard_A', (.42, .174, .603))


def vase():
    lathe([(0, 0), (.09, 0), (.11, .03), (.16, .19), (.12, .32), (.06, .41), (.06, .5), (.044, .5), (.044, .40), (.09, .31), (.13, .19), (.08, .04), (0, .04)],
          M['porcelain'], seg=48)
    for z, r in ((.17, .158), (.21, .155)):
        torus((0, 0, z), r, .003, M['cobalt'], seg=48, mseg=5)
    for k in range(5):
        a = k * math.tau / 5 + .3
        top = Vector((.07 * math.cos(a), .07 * math.sin(a), .75 + (k % 3) * .06))
        rod((0, 0, .40), top, .003, M['stem'], seg=6)
        for j in range(7):
            sphere(top + Vector((rng.uniform(-.03, .03), rng.uniform(-.03, .03), rng.uniform(-.02, .04))), .011, M['flower'], seg=8, rings=5)
    return finish('PROP_MorningWhite_Vase_Porcelain', (.32, .32, .9225))


ENV_ASSETS = {
    'ENV_WarmWood_Wall_Back': lambda: wall(8.3, 'ENV_WarmWood_Wall_Back', (8.6, .24, 3.18)),
    'ENV_WarmWood_Wall_Side': lambda: wall(4.2, 'ENV_WarmWood_Wall_Side', (4.5, .24, 3.18)),
    'ENV_WarmWood_Post_A': post,
    'PROP_Common_BackCounter_A': back_counter,
    'PROP_WarmWood_FrontCounter_A': front_counter,
    'PROP_WarmWood_Sign_A': sign,
    'PROP_WarmWood_Shelf_Jars': shelf_jars,
    'PROP_Common_PrepBoard_A': prep_board,
    'PROP_Common_BowlStack_A': bowl_stack,
    'PROP_WarmWood_Table_A': lambda: table('square', M['honey'], 'PROP_WarmWood_Table_A', (.817, .56, .766)),
    'PROP_WarmWood_Stool_A': stool,
    'PROP_WarmWood_Plant_A': lambda: plant('plant', 'PROP_WarmWood_Plant_A', (.615, .608, .855)),
    'PROP_Common_WallLamp_A': lambda: wall_lamp('PROP_Common_WallLamp_A', M['black_metal']),
    'PROP_WarmWood_Lamp_Paper': lambda: paper_lantern('PROP_WarmWood_Lamp_Paper', M['paper']),
    # 装修
    'PROP_WarmWood_Curtain_A': lambda: curtain('PROP_WarmWood_Curtain_A', M['linen']),
    'PROP_WarmWood_Table_Square': lambda: table('square', M['honey'], 'PROP_WarmWood_Table_Square', (.817, .56, .766)),
    'PROP_WarmWood_Counter_A': lambda: counter_veneer('PROP_WarmWood_Counter_A', 'warm'),
    'PROP_WarmWood_Stove_Brick': lambda: stove_backsplash('PROP_WarmWood_Stove_Brick', 'brick'),
    'PROP_MorningWhite_Window_Morning': window,
    'PROP_MorningWhite_DoorLamp_A': lambda: paper_lantern('PROP_MorningWhite_DoorLamp_A', M['paper_white']),
    'PROP_MorningWhite_Table_Round': lambda: table('round', M['pale'], 'PROP_MorningWhite_Table_Round', (.84, .84, .766)),
    'PROP_MorningWhite_Counter_Porcelain': lambda: counter_veneer('PROP_MorningWhite_Counter_Porcelain', 'porcelain'),
    'PROP_MorningWhite_Stove_Tile': lambda: stove_backsplash('PROP_MorningWhite_Stove_Tile', 'tile'),
    'PROP_NightBlue_Lamp_Brass': lambda: wall_lamp('PROP_NightBlue_Lamp_Brass', M['brass']),
    'PROP_NightBlue_Curtain_A': lambda: curtain('PROP_NightBlue_Curtain_A', M['indigo_linen']),
    'PROP_NightBlue_Table_Long': lambda: table('long', M['dark'], 'PROP_NightBlue_Table_Long', (1.017, .56, .766)),
    'PROP_NightBlue_Counter_Brass': lambda: counter_veneer('PROP_NightBlue_Counter_Brass', 'brass'),
    'PROP_NightBlue_Stove_Iron': lambda: stove_backsplash('PROP_NightBlue_Stove_Iron', 'iron'),
    'PROP_WarmWood_Scallion_Sill': lambda: plant('scallion', 'PROP_WarmWood_Scallion_Sill', (.36, .36, .686)),
    'PROP_WarmWood_Jar_Counter': lambda: counter_veneer('PROP_WarmWood_Jar_Counter', 'jar'),
    'PROP_NightBlue_Chime_Brass': chime,
    'PROP_NightBlue_MenuBoard_A': menu_board,
    'PROP_MorningWhite_Pot_Mint': lambda: plant('mint', 'PROP_MorningWhite_Pot_Mint', (.615, .608, .855)),
    'PROP_MorningWhite_Vase_Porcelain': vase,
}
