"""粥霸天 时令小物（文档 30 四时章节）：在连接的 Blender 里运行。

两类共 8 件，复用 build_props_v2.py 的材质与几何工具（通过 EXTRA_ASSETS 钩子注入）：
- 锅面配料 FOOD_Season_*：下锅后浮在粥面上的那一把料，平铺在半径约 0.3 m 内，原点在底面中心；
  山药片 + 桂花、腊肉片、荠菜碎、绿豆。
- 备料台陈列 PROP_Season_Stand_*：当季食材摆在备料台与一号锅之间，占地不超过 0.28 × 0.24 m；
  竹筐山药与桂花枝、木板腊肉、竹筐荠菜、布袋绿豆与木勺。

用法（Blender 里，先打开 美术源文件/正式物件/BaTian_RealProps.blend）：
    P = '.../tools/art/build_props_season.py'
    exec(compile(open(P).read(), P, 'exec'), {})
可选 {'ONLY': [...]} 只重建其中几件。导出到 assets/resources/models/real/。
"""
from pathlib import Path

SEASON_KEYS = ['FOOD_Season_Yam', 'FOOD_Season_CuredPork', 'FOOD_Season_Shepherd', 'FOOD_Season_MungBean',
               'PROP_Season_Stand_Yam', 'PROP_Season_Stand_Pork', 'PROP_Season_Stand_Shepherd', 'PROP_Season_Stand_MungBean']


def _season_assets(g):
    M, material, sphere, cyl, lathe, torus, rod, box, finish, leaf, parts_ref = (
        g['M'], g['material'], g['sphere'], g['cyl'], g['lathe'], g['torus'], g['rod'], g['box'], g['finish'], g['leaf'], g)
    tex_noise_surface, tex_cloth = g['tex_noise_surface'], g['tex_cloth']
    import math, random
    from mathutils import Matrix

    # ── 材质 ──
    M['yam'] = material('YamFlesh', (.93, .90, .80), .35, coat=.3)
    yskin = tex_noise_surface('YamSkin_A', (.52, .38, .24), n=512, seed=83, speck=.03, var=.2, scale=14)
    M['yam_skin'] = material('YamSkin', (.52, .38, .24), .85, tex=yskin[0], normal=yskin[1], nstrength=1.4)
    M['osmanthus'] = material('Osmanthus', (.96, .58, .10), .5, glow=.25)
    M['cured_lean'] = material('CuredLean', (.30, .07, .04), .38, coat=.5)
    M['cured_fat'] = material('CuredFat', (.93, .80, .56), .3, coat=.5)
    M['cured_rind'] = material('CuredRind', (.55, .30, .12), .45, coat=.3)
    M['shepherd'] = material('ShepherdPurse', (.10, .26, .07), .5, coat=.2)
    M['shepherd2'] = material('ShepherdPurseYoung', (.18, .36, .10), .5, coat=.2)
    M['root_white'] = material('PaleRoot', (.88, .84, .70), .7)
    M['mung'] = material('MungBean', (.16, .30, .07), .35, coat=.5)
    M['mung_split'] = material('MungBeanSplit', (.88, .78, .40), .5)
    weave = tex_cloth('BambooWeave_A', (.70, .54, .30), n=512, seed=17, period=14)
    M['weave'] = material('BambooWeave', (.70, .54, .30), .6, tex=weave[0], normal=weave[1], nstrength=1.6)
    sack = tex_cloth('Sack_A', (.76, .64, .44), n=512, seed=23, period=5)
    M['sack'] = material('Burlap', (.76, .64, .44), .95, tex=sack[0], normal=sack[1], nstrength=1.2)
    M['twine'] = M.get('red_cord')

    def flat(o, s):
        """把刚建的部件按 s 缩放进网格（避免 finish 合并时缩放丢失）。"""
        o.data.transform(Matrix.Diagonal((*s, 1))); o.scale = (1, 1, 1)
        return o

    def scatter(n, r_max, seed, r_min=0.0):
        rr = random.Random(seed)
        for _ in range(n):
            a = rr.random() * 2 * math.pi
            d = r_min + (r_max - r_min) * math.sqrt(rr.random())
            yield d * math.cos(a), d * math.sin(a), rr

    # ── 锅面配料 ──
    def yam_slices(cx=0, cy=0, n=13, rmax=.25, z=0, seed=5, flowers=60):
        for x, y, rr in scatter(n, rmax, seed):
            r = .026 + rr.random() * .01
            tilt = (rr.uniform(-.15, .15), rr.uniform(-.15, .15), 0)
            cyl((cx + x, cy + y, z + .004), r, .007, M['yam'], seg=20, bevel=.0015, rot=tilt)
            torus((cx + x, cy + y, z + .004), r, .0032, M['yam_skin'], rot=tilt, seg=20, mseg=5)
            # 切面上一圈淡淡的黏液光泽
            cyl((cx + x, cy + y, z + .0078), r * .55, .0006, M['porcelain'], seg=14, rot=tilt)
        for x, y, rr in scatter(flowers, rmax + .03, seed + 1):
            for k in range(4):
                a = k * math.pi / 2 + rr.random()
                o = sphere((cx + x + .0055 * math.cos(a), cy + y + .0055 * math.sin(a), z + .009), 1, M['osmanthus'], seg=6, rings=4, rot=(0, 0, a))
                flat(o, (.0062, .0042, .0018))

    def food_yam():
        yam_slices()
        return finish('FOOD_Season_Yam', (0.58, 0.58, 0.016))

    def pork_slice(x, y, z, yaw, L=.07, W=.034, T=.006, bend=.0):
        rot = (bend, 0, yaw)
        box((x, y, z + T / 2), (L, W * .72, T), M['cured_lean'], bevel=.002, uv=.1, rot=rot)
        c, s = math.cos(yaw), math.sin(yaw)
        ox, oy = -s * W * .5, c * W * .5
        box((x + ox, y + oy, z + T / 2), (L, W * .3, T * .95), M['cured_fat'], bevel=.002, uv=.1, rot=rot)
        box((x + ox * 1.36, y + oy * 1.36, z + T / 2), (L, W * .06, T * .9), M['cured_rind'], bevel=.001, uv=.1, rot=rot)

    def food_pork():
        for x, y, rr in scatter(8, .22, 31):
            pork_slice(x, y, 0, rr.random() * math.pi, L=.06 + rr.random() * .02, bend=rr.uniform(-.12, .12))
        return finish('FOOD_Season_CuredPork', (0.52, 0.52, 0.016))

    def shepherd_bits(cx=0, cy=0, n=64, rmax=.27, z=0, seed=41):
        for x, y, rr in scatter(n, rmax, seed):
            m = M['shepherd'] if rr.random() < .6 else M['shepherd2']
            o = sphere((cx + x, cy + y, z + .003), 1, m, seg=8, rings=4, rot=(rr.uniform(-.2, .2), 0, rr.random() * math.pi))
            flat(o, (.018 + rr.random() * .012, .008 + rr.random() * .006, .002))

    def food_shepherd():
        shepherd_bits()
        return finish('FOOD_Season_Shepherd', (0.56, 0.56, 0.008))

    def beans(n, rmax, seed, z=0.0, cx=0, cy=0, split=.3):
        for x, y, rr in scatter(n, rmax, seed):
            rot = (rr.uniform(-.4, .4), rr.uniform(-.4, .4), rr.random() * math.pi)
            if rr.random() < split:
                o = sphere((cx + x, cy + y, z + .002), 1, M['mung_split'], seg=8, rings=4, rot=rot)
                flat(o, (.0075, .0052, .0024))
            else:
                o = sphere((cx + x, cy + y, z + .003), 1, M['mung'], seg=8, rings=5, rot=rot)
                flat(o, (.0078, .0056, .005))

    def food_mung():
        beans(300, .29, 61)
        return finish('FOOD_Season_MungBean', (0.6, 0.6, 0.008))

    # ── 备料台陈列 ──
    def basket(r_top=.13, r_bot=.10, h=.07, sx=1.0):
        prof = [(r_bot - .01, 0.0), (r_bot, .004), (r_bot + (r_top - r_bot) * .5, h * .55), (r_top, h), (r_top - .006, h), (r_top - .01, h * .55), (r_bot - .012, .008), (0, .008)]
        o = lathe(prof, M['weave'], seg=40, uv_v=.08)
        torus((0, 0, h), r_top - .003, .0045, M['bamboo'], seg=40, mseg=6)
        o2 = parts_ref['parts'][-1]
        if sx != 1.0:
            for p in (o, o2):
                flat(p, (sx, 1, 1))

    def yam_root(a, b, r, rr):
        # 带须根、略弯的一根山药：分 4 段接起来
        pts = []
        for i in range(5):
            t = i / 4
            pts.append(tuple(a[k] + (b[k] - a[k]) * t + (rr.uniform(-.006, .006) if 0 < i < 4 else 0) for k in range(3)))
        for i in range(4):
            rod(pts[i], pts[i + 1], r * (1 - .12 * i / 4), M['yam_skin'], seg=12)
            sphere(pts[i + 1], r * (1 - .12 * (i + 1) / 4), M['yam_skin'], seg=12, rings=6)
        sphere(pts[0], r, M['yam_skin'], seg=12, rings=6)
        # 切口露出白肉
        cyl(tuple(pts[-1][k] + (pts[-1][k] - pts[-2][k]) * .25 for k in range(3)), r * .9, .003, M['yam'], seg=14,
            rot=(0, math.pi / 2, math.atan2(b[1] - a[1], b[0] - a[0])))
        for _ in range(10):
            t = rr.random()
            p = tuple(a[k] + (b[k] - a[k]) * t for k in range(3))
            ang = rr.random() * 2 * math.pi
            q = (p[0] + .012 * math.cos(ang), p[1] + .012 * math.sin(ang), p[2] + .004 * math.sin(ang))
            rod(p, q, .0008, M['root_white'], seg=4)

    def osmanthus_sprig(base, length=.16):
        rr = random.Random(9)
        tip = (base[0] + length * .8, base[1] - length * .3, base[2] + .03)
        rod(base, tip, .0025, M['dark'], seg=6)
        for i in range(5):
            t = .2 + i * .17
            p = tuple(base[k] + (tip[k] - base[k]) * t for k in range(3))
            leaf(p, -.4 + (1 if i % 2 else -1) * .9, .15, .045, .011, M['leaf'], droop=.2, segs=4)
            for _ in range(7):
                o = sphere((p[0] + rr.uniform(-.008, .008), p[1] + rr.uniform(-.008, .008), p[2] + .004 + rr.random() * .005), 1, M['osmanthus'], seg=6, rings=4)
                flat(o, (.0035, .0035, .0025))

    def stand_yam():
        basket(.13, .105, .06, sx=1.05)
        rr = random.Random(13)
        for k, (y, z) in enumerate([(-.04, .03), (.035, .03), (0, .058)]):
            yam_root((-.11, y, z), (.11, y + rr.uniform(-.02, .02), z + .01), .021, rr)
        osmanthus_sprig((-.05, -.07, .09))
        return finish('PROP_Season_Stand_Yam', None)

    def stand_pork():
        box((0, 0, .012), (.27, .2, .024), M['dark'], bevel=.006, seg=2, uv=.4)
        for k, (x, yaw) in enumerate([(-.045, .08), (.05, -.06)]):
            L, W, T = .19, .07, .028
            z = .024
            box((x, 0, z + T / 2), (W * .62, L, T), M['cured_lean'], bevel=.006, seg=2, uv=.2, rot=(0, 0, yaw))
            c, s = math.cos(yaw), math.sin(yaw)
            box((x + c * W * .43, s * W * .43, z + T / 2), (W * .26, L, T * .96), M['cured_fat'], bevel=.005, seg=2, uv=.2, rot=(0, 0, yaw))
            box((x + c * W * .58, s * W * .58, z + T / 2), (W * .05, L, T * .9), M['cured_rind'], bevel=.002, uv=.2, rot=(0, 0, yaw))
            # 挂肉的红绳
            ty = .07
            torus((x - s * ty, c * ty, z + T + .002), .018, .0022, M['red_cord'], rot=(math.pi / 2, 0, yaw + math.pi / 2), seg=16, mseg=5)
        # 切下的三片
        for i in range(3):
            pork_slice(.0 + i * .02, -.085, .024 + i * .004, .3, L=.05, W=.026, T=.004)
        return finish('PROP_Season_Stand_Pork', None)

    def shepherd_rosette(cx, cy, z, s, seed):
        rr = random.Random(seed)
        n = 12
        for i in range(n):
            yaw = i * 2 * math.pi / n + rr.uniform(-.2, .2)
            L = .065 * s * rr.uniform(.75, 1.1)
            leaf((cx, cy, z), yaw, .3, L, .0065 * s, M['shepherd'] if i % 3 else M['shepherd2'], droop=.5, segs=6)
            # 荠菜叶两侧的羽状小裂片
            for t in (.35, .6, .82):
                p = (cx + math.cos(yaw) * L * t, cy + math.sin(yaw) * L * t, z + L * .3 * t - .5 * L * t * t * .9)
                for side in (1, -1):
                    leaf(p, yaw + side * 1.0, .1, .014 * s, .004 * s, M['shepherd'], droop=.3, segs=3)
        rod((cx, cy, z), (cx, cy, z - .02 * s), .003, M['root_white'], seg=6)

    def stand_shepherd():
        basket(.125, .1, .055, sx=1.08)
        for k, (x, y) in enumerate([(-.06, -.03), (.055, -.035), (0, .045), (-.07, .05), (.075, .05), (0, -.06)]):
            shepherd_rosette(x, y, .045, 1.0, 50 + k)
        return finish('PROP_Season_Stand_Shepherd', None)

    def stand_mung():
        # 卷边布袋：袋身 + 翻出来的一圈袋口
        prof = [(.0, 0.0), (.075, 0.0), (.088, .02), (.092, .07), (.088, .1), (.092, .104), (.104, .106), (.104, .112), (.088, .108)]
        lathe(prof, M['sack'], seg=36, uv_v=.1)
        cyl((0, 0, .1), .087, .004, M['mung'], seg=30)
        beans(70, .08, 71, z=.1, split=.15)
        # 木勺斜插在豆子里
        rod((.02, .0, .095), (.13, -.03, .16), .006, M['honey'], seg=8)
        o = sphere((.015, .0, .1), .028, M['honey'], seg=16, rings=8)
        flat(o, (1, .8, .45))
        # 袋边撒落几颗
        beans(14, .03, 73, z=0.0, cx=-.095, cy=-.06, split=.2)
        return finish('PROP_Season_Stand_MungBean', None)

    return {
        'FOOD_Season_Yam': food_yam,
        'FOOD_Season_CuredPork': food_pork,
        'FOOD_Season_Shepherd': food_shepherd,
        'FOOD_Season_MungBean': food_mung,
        'PROP_Season_Stand_Yam': stand_yam,
        'PROP_Season_Stand_Pork': stand_pork,
        'PROP_Season_Stand_Shepherd': stand_shepherd,
        'PROP_Season_Stand_MungBean': stand_mung,
    }


_only = globals().get('ONLY') or SEASON_KEYS
_main = Path('/Users/liweng/Downloads/3D/BaTian Congee/游戏工程/BaTian/tools/art/build_props_v2.py')
_ns = {'ONLY': _only, 'EXTRA_ASSETS': _season_assets, 'LAYOUT': True}
exec(compile(_main.read_text(), str(_main), 'exec'), _ns)
result = _ns.get('result')
