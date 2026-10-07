#!/usr/bin/env python3
"""
粥霸天 预制体 / 场景 / 材质生成器。

把界面与铺子的节点结构写成 Cocos Creator 3.8 可导入的 .prefab / .scene / .mtl（含 .meta），
脚本组件按 .ts.meta 里的 uuid 压缩成类 id 挂上去，属性引用直接连好。
生成后在编辑器里就是普通预制体，可以继续手调；再次生成会覆盖同名文件（uuid 不变）。

用法：python3 tools/gen_assets.py <工程根目录> <输出根目录>
"""
import json, os, sys, uuid, re, math

PROJECT = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else PROJECT
NS = uuid.UUID('6f1c1d3e-2b7a-4c55-9a51-8a3b7c0e9b21')

def stable_uuid(key):
    return str(uuid.uuid5(NS, key))

B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
def compress_uuid(u):
    h = u.replace('-', '')
    out = h[:5]
    rest = h[5:]
    for i in range(0, len(rest), 3):
        a, b, c = (int(x, 16) for x in rest[i:i + 3])
        out += B64[(a << 2) | (b >> 2)] + B64[((b & 3) << 4) | c]
    return out

def write(rel, text):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)

def write_json(rel, obj):
    write(rel, json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

# ───────────── 脚本 meta 与类 id ─────────────
SCRIPT_UUID = {}
def script_meta(rel_ts):
    """rel_ts 形如 scripts/ui/UiButton.ts；若工程里已有 meta 则沿用其 uuid。"""
    existing = os.path.join(PROJECT, 'assets', rel_ts + '.meta')
    if os.path.exists(existing):
        u = json.load(open(existing))['uuid']
    else:
        u = stable_uuid('script:' + rel_ts)
        write_json(os.path.join('assets', rel_ts + '.meta'), {
            'ver': '4.0.24', 'importer': 'typescript', 'imported': True, 'uuid': u, 'files': [], 'subMetas': {}, 'userData': {}})
    SCRIPT_UUID[os.path.splitext(os.path.basename(rel_ts))[0]] = u

for root, _, files in os.walk(os.path.join(PROJECT, 'assets', 'scripts')):
    for f in files:
        if f.endswith('.ts'):
            rel = os.path.relpath(os.path.join(root, f), os.path.join(PROJECT, 'assets'))
            script_meta(rel)

def cls(name):
    return compress_uuid(SCRIPT_UUID[name])

# ───────────── 内置与模型资源 ─────────────
MESH = {k: '1263d74c-8167-4928-91a6-4e2672411f47@' + v for k, v in {
    'box': 'a804a', 'sphere': '17020', 'cylinder': '8abdc', 'cone': '38fd2', 'plane': '2e76e', 'quad': 'fc873', 'torus': '40ece', 'capsule': '801ec'}.items()}
MODEL = {
    'pot': '06f9ff17-3d8f-4d77-9bf0-afbb2218ec0b@0cd18',
    'bowl': '924a9f9c-f0f6-4a4b-8f15-fee5054d618c@06fd3',
    'lamp_paper': '42d3593b-a730-4c61-8437-05db3d4dba30@1c009',
    'guest': 'b6df1e98-aba6-4e8f-8112-1f4d6a8cf185@117d0',
    'store': 'a2508111-5fcf-40ac-8309-2be6de501e52@b8ca2',
    'congee': '3cb07448-1f5a-4943-be39-bf2f382c8f83@9a912',
}
MAT_MATTE = stable_uuid('mat:M_Matte')
MAT_STEAM = stable_uuid('mat:M_Steam')
MAT_GLOW = stable_uuid('mat:M_Glow')
MAT_SOUP = stable_uuid('mat:M_Soup')
STANDARD_EFFECT = 'c8f66d17-351a-48da-a12c-0212d28575c4'
TRANSPARENT_EFFECT = '1baf0fc9-befa-459c-8bdd-af1a450a0319'

def material(name, uid, effect, tech, props, passes, defines=None):
    write_json(f'assets/materials/{name}.mtl', {
        '__type__': 'cc.Material', '_name': '', '_objFlags': 0, '_native': '',
        '_effectAsset': {'__uuid__': effect}, '_techIdx': tech,
        '_defines': [dict(defines or {})] + [{} for _ in range(passes - 1)],
        '_states': [{'blendState': {'targets': [{}]}, 'depthStencilState': {}, 'rasterizerState': {}} for _ in range(passes)],
        '_props': [props] + [{} for _ in range(passes - 1)],
    })
    write_json(f'assets/materials/{name}.mtl.meta', {'ver': '1.0.21', 'importer': 'material', 'imported': True, 'uuid': uid, 'files': ['.json'], 'subMetas': {}, 'userData': {}})

def color(hexs, a=255):
    v = int(hexs.lstrip('#'), 16)
    return {'__type__': 'cc.Color', 'r': (v >> 16) & 255, 'g': (v >> 8) & 255, 'b': v & 255, 'a': a}

material('M_Matte', MAT_MATTE, STANDARD_EFFECT, 0, {'mainColor': color('#FFFFFF'), 'roughness': 0.85, 'metallic': 0.0}, 1)
material('M_Steam', MAT_STEAM, TRANSPARENT_EFFECT, 1, {'mainColor': color('#FFFFFF', 140), 'roughness': 1.0, 'metallic': 0.0}, 3)
# 粥面：熬开的米粒贴图 + 法线（美术源文件/正式物件/tex_v2 的 Congee_A），颜色由 PotView 按熟度乘上去；
# 只留一点点自发光，免得在暗处发灰，但不再像一块白板
CONGEE_TEX = '1c6e8745-10d1-405c-a3db-ab9d9bb76b0c@6c48a'
CONGEE_NRM = 'c00f1fbc-366c-4dba-b263-bb96447be38a@3c318'
material('M_Soup', MAT_SOUP, STANDARD_EFFECT, 0, {'mainColor': color('#FFFFFF'), 'roughness': 0.42, 'metallic': 0.0,
         'mainTexture': {'__uuid__': CONGEE_TEX, '__expectedType__': 'cc.Texture2D'},
         'normalMap': {'__uuid__': CONGEE_NRM, '__expectedType__': 'cc.Texture2D'}, 'normalStrength': 0.8,
         'tilingOffset': {'__type__': 'cc.Vec4', 'x': 2, 'y': 2, 'z': 0, 'w': 0},
         'albedoScale': {'__type__': 'cc.Vec3', 'x': 1.14, 'y': 1.2, 'z': 1.36},
         'emissive': color('#42392D'), 'emissiveScale': {'__type__': 'cc.Vec3', 'x': 1, 'y': 1, 'z': 1}}, 1,
         defines={'USE_ALBEDO_MAP': True, 'USE_NORMAL_MAP': True})
# 粥面上的配料（鸡丝、青菜、肉末）：纯色，PotView 按食材上色
MAT_GARNISH = stable_uuid('mat:M_Garnish')
material('M_Garnish', MAT_GARNISH, STANDARD_EFFECT, 0, {'mainColor': color('#FFFFFF'), 'roughness': 0.5, 'metallic': 0.0, 'emissive': color('#221C14'), 'emissiveScale': {'__type__': 'cc.Vec3', 'x': 1, 'y': 1, 'z': 1}}, 1)
material('M_Glow', MAT_GLOW, STANDARD_EFFECT, 0, {'mainColor': color('#FFFFFF'), 'roughness': 1.0, 'metallic': 0.0, 'emissive': color('#FF9A3C'), 'emissiveScale': {'__type__': 'cc.Vec3', 'x': 1, 'y': 1, 'z': 1}}, 1)

# ───────────── 节点与组件构建 ─────────────
UI_LAYER = 33554432
DEFAULT_LAYER = 1073741824

class C:
    """组件。fields 里可以放 Node/C 对象或 Ref，序列化时解析成 __id__。"""
    def __init__(self, type_, **fields):
        self.type = type_
        self.fields = fields
        self.node = None

class N:
    def __init__(self, name, pos=(0, 0, 0), euler=(0, 0, 0), scale=(1, 1, 1), active=True, layer=UI_LAYER, children=None, comps=None):
        self.name, self.pos, self.euler, self.scale, self.active, self.layer = name, pos, euler, scale, active, layer
        self.children = list(children or [])
        self.comps = []
        for c in comps or []:
            self.add(c)

    def add(self, comp):
        comp.node = self
        self.comps.append(comp)
        return comp

    def child(self, n):
        self.children.append(n)
        return n

    def get(self, type_):
        for c in self.comps:
            if c.type == type_:
                return c
        raise KeyError(f'{self.name} 没有组件 {type_}')

def asset_ref(uid, t=None):
    r = {'__uuid__': uid}
    if t:
        r['__expectedType__'] = t
    return r

def vec3(x, y, z):
    return {'__type__': 'cc.Vec3', 'x': x, 'y': y, 'z': z}

def euler_to_quat(e):
    # Cocos Quat.fromEuler: 顺序 YZX（与编辑器一致）
    x, y, z = (math.radians(a) / 2 for a in e)
    sx, cx = math.sin(x), math.cos(x)
    sy, cy = math.sin(y), math.cos(y)
    sz, cz = math.sin(z), math.cos(z)
    return {'__type__': 'cc.Quat',
            'x': sx * cy * cz + cx * sy * sz,
            'y': cx * sy * cz + sx * cy * sz,
            'z': cx * cy * sz - sx * sy * cz,
            'w': cx * cy * cz - sx * sy * sz}

_fid = [0]
def file_id(key):
    return compress_uuid(stable_uuid(key))[:22]

def serialize(root, kind, name, extra_root=None):
    """kind: 'prefab' 或 'scene'。返回对象数组。"""
    objs = []
    ids = {}

    def reserve(obj_key):
        ids[obj_key] = len(objs)
        objs.append(None)
        return ids[obj_key]

    if kind == 'prefab':
        objs.append({'__type__': 'cc.Prefab', '_name': name, '_objFlags': 0, '__editorExtras__': {}, '_native': '',
                     'data': {'__id__': 1}, 'optimizationPolicy': 0, 'persistent': False})
    # 先给所有节点和组件分配 id（深度优先），再填内容
    order = []
    def walk(n, parent):
        order.append((n, parent))
        reserve(('n', id(n)))
        for c in n.comps:
            reserve(('c', id(c)))
            if kind == 'prefab':
                reserve(('cp', id(c)))
        for ch in n.children:
            walk(ch, n)
        if kind == 'prefab':
            reserve(('np', id(n)))
    if kind == 'scene':
        pass
    walk(root, None)

    def resolve(v):
        if isinstance(v, N):
            return {'__id__': ids[('n', id(v))]}
        if isinstance(v, C):
            return {'__id__': ids[('c', id(v))]}
        if isinstance(v, list):
            return [resolve(x) for x in v]
        if isinstance(v, dict):
            return {k: resolve(x) for k, x in v.items()}
        return v

    path_of = {}
    for n, parent in order:
        path_of[id(n)] = (path_of[id(parent)] + '/' if parent else '') + n.name
    for n, parent in order:
        nid = ids[('n', id(n))]
        key = f'{name}:{path_of[id(n)]}'
        objs[nid] = {
            '__type__': 'cc.Scene' if (kind == 'scene' and parent is None) else 'cc.Node',
            '_name': n.name, '_objFlags': 0, '__editorExtras__': {},
            '_parent': {'__id__': ids[('n', id(parent))]} if parent else None,
            '_children': [{'__id__': ids[('n', id(c))]} for c in n.children],
            '_active': n.active,
            '_components': [{'__id__': ids[('c', id(c))]} for c in n.comps],
            '_prefab': {'__id__': ids[('np', id(n))]} if kind == 'prefab' else None,
            '_lpos': vec3(*n.pos), '_lrot': euler_to_quat(n.euler), '_lscale': vec3(*n.scale),
            '_mobility': 0, '_layer': n.layer, '_euler': vec3(*n.euler),
            '_id': file_id(key + ':id'),
        }
        for i, c in enumerate(n.comps):
            cid = ids[('c', id(c))]
            body = {'__type__': c.type, '_name': '', '_objFlags': 0, '__editorExtras__': {}, 'node': {'__id__': nid}, '_enabled': True,
                    '__prefab': {'__id__': ids[('cp', id(c))]} if kind == 'prefab' else None, '_id': file_id(f'{key}:c{i}:id')}
            for k, v in c.fields.items():
                body[k] = resolve(v)
            objs[cid] = body
            if kind == 'prefab':
                objs[ids[('cp', id(c))]] = {'__type__': 'cc.CompPrefabInfo', 'fileId': file_id(f'{key}:c{i}')}
        if kind == 'prefab':
            objs[ids[('np', id(n))]] = {'__type__': 'cc.PrefabInfo', 'root': {'__id__': 1}, 'asset': {'__id__': 0},
                                        'fileId': file_id(key), 'instance': None, 'targetOverrides': None, 'nestedPrefabInstanceRoots': None}
    if kind == 'scene' and extra_root:
        extra_root(objs, ids, root)
    return objs

PREFAB_UUID = {}
def save_prefab(rel, root):
    name = root.name
    uid = stable_uuid('prefab:' + rel)
    PREFAB_UUID[rel] = uid
    serialized=serialize(root, 'prefab', name)
    if rel in ('prefabs/stage/Store','prefabs/stage/Guest') and os.path.exists(os.path.join(PROJECT,'assets/resources/models/real/PROP_Common_Pot_Open.glb.meta')):
        sys.path.insert(0,os.path.join(PROJECT,'tools/art'))
        from install_props import upgrade
        serialized=upgrade(serialized,name)
    write_json(f'assets/{rel}.prefab', serialized)
    write_json(f'assets/{rel}.prefab.meta', {'ver': '1.1.50', 'importer': 'prefab', 'imported': True, 'uuid': uid,
                                              'files': ['.json'], 'subMetas': {}, 'userData': {'syncNodeName': name}})
    return uid

def prefab_uuid(rel):
    if rel not in PREFAB_UUID:
        PREFAB_UUID[rel] = stable_uuid('prefab:' + rel)
    return PREFAB_UUID[rel]

# ───────────── UI 部件（设计稿「炭火暖木，青瓷小铺」） ─────────────
# 颜色与材料（设计方案 §6）
INK = '#3C3529'; MUTE = '#807965'; GOLD = '#C59651'; WOOD = '#805638'; BRICK = '#974B32'
JADE = '#326B5B'; JADE_FACE = '#447A5F'; JADE_EDGE = '#224B3C'; NIGHT = '#172D2E'
CREAM = '#F5ECD7'; CREAM_EDGE = '#B4A084'; LINE = '#CBBB98'
PAPER = CREAM; PANEL = CREAM; WARM = '#D2AE72'; GOOD = '#719775'; BURNT = BRICK; DIM = '#0C2225'
DISPLAY = 'Songti SC, STSong, SimSun, serif'
UIFONT = 'PingFang SC, Microsoft YaHei, sans-serif'
NUMFONT = 'Georgia, Times New Roman, serif'

def ui_transform(w, h, ax=0.5, ay=0.5):
    return C('cc.UITransform', _contentSize={'__type__': 'cc.Size', 'width': w, 'height': h}, _anchorPoint={'__type__': 'cc.Vec2', 'x': ax, 'y': ay})

def rr(fill, radius=10, stroke=None, stroke_w=0, edge=0, edge_col=CREAM_EDGE, shadow=0, shadow_col=('#071618', 70), sheen=0):
    f = color(*fill) if isinstance(fill, tuple) else color(fill)
    s = color(*stroke) if isinstance(stroke, tuple) else color(stroke or INK)
    e = color(*edge_col) if isinstance(edge_col, tuple) else color(edge_col)
    sc = color(*shadow_col) if isinstance(shadow_col, tuple) else color(shadow_col)
    return C(cls('RoundRect'), fill=f, radius=radius, stroke=s, strokeWidth=stroke_w, edge=edge, edgeColor=e, shadow=shadow, shadowColor=sc, sheen=sheen)

def rect_comps(w, h, fill, radius=10, stroke=None, stroke_w=0, ax=0.5, ay=0.5, **kw):
    return [ui_transform(w, h, ax, ay), C('cc.Graphics'), rr(fill, radius, stroke, stroke_w, **kw)]

def box(name, w, h, fill, pos=(0, 0, 0), radius=10, ax=0.5, ay=0.5, **kw):
    return N(name, pos=pos, comps=rect_comps(w, h, fill, radius, ax=ax, ay=ay, **kw))

def ceramic(name, w, h, pos=(0, 0, 0), radius=17, edge=6, fill=CREAM, ax=0.5, ay=0.5):
    """暖瓷面板：米白面、浅色描边、实体底边、柔和外阴影、顶部一层亮釉。"""
    return box(name, w, h, fill, pos, radius, ax=ax, ay=ay, stroke=('#FFF8E7', 255), stroke_w=1, edge=edge, edge_col=CREAM_EDGE,
               shadow=10, shadow_col=('#071618', 90), sheen=34)

def label(name, text, size=14, col=INK, w=200, h=None, pos=(0, 0, 0), align=1, valign=1, bold=False, overflow=1, ax=0.5, ay=0.5,
          wrap=True, font=UIFONT, shadow=None, spacing=0):
    h = h or int(size * 1.5)
    lab = C('cc.Label', _string=text, _horizontalAlign=align, _verticalAlign=valign,
            _actualFontSize=size, _fontSize=size, _fontFamily=font, _lineHeight=int(size * 1.35), _overflow=overflow,
            _enableWrapText=wrap, _isSystemFontUsed=True, _isBold=bold, _color=color(*col) if isinstance(col, tuple) else color(col),
            _cacheMode=0, _spacingX=spacing)
    if shadow:
        lab.fields.update(_enableShadow=True, _shadowColor=color(*shadow), _shadowOffset={'__type__': 'cc.Vec2', 'x': 0, 'y': -2}, _shadowBlur=4)
    return N(name, pos=pos, comps=[ui_transform(w, h, ax, ay), lab])

def auto_label(name, text, size=14, col=INK, font=UIFONT, bold=False, spacing=0):
    """宽度随文字变化（overflow NONE），放在横向 Layout 里与图标一起居中。"""
    return N(name, comps=[ui_transform(10, int(size * 1.5)), C('cc.Label', _string=text, _horizontalAlign=1, _verticalAlign=1,
             _actualFontSize=size, _fontSize=size, _fontFamily=font, _lineHeight=int(size * 1.35), _overflow=0, _enableWrapText=False,
             _isSystemFontUsed=True, _isBold=bold, _color=color(col), _cacheMode=0, _spacingX=spacing)])

def icon(name, kind, size=22, col=INK, fill=None, pos=(0, 0, 0), lw=1.6):
    return N(name, pos=pos, comps=[ui_transform(size, size), C('cc.Graphics'),
             C(cls('UiIcon'), icon=kind, color=color(col), fillColor=color(*fill) if isinstance(fill, tuple) else (color(fill) if fill else color('#000000', 0)), lineWidth=lw)])

def widget(flags, left=0, right=0, top=0, bottom=0, hc=0, vc=0, mode=2):
    """mode：0 只对齐一次，1 每帧对齐（尺寸会变的节点用），2 窗口变化时对齐。"""
    return C('cc.Widget', _alignFlags=flags, _left=left, _right=right, _top=top, _bottom=bottom, _horizontalCenter=hc, _verticalCenter=vc,
             _isAbsLeft=True, _isAbsRight=True, _isAbsTop=True, _isAbsBottom=True, _isAbsHorizontalCenter=True, _isAbsVerticalCenter=True, _alignMode=mode)
W_TOP, W_MID, W_BOT, W_LEFT, W_CENTER, W_RIGHT = 1, 2, 4, 8, 16, 32
FULL = W_TOP | W_BOT | W_LEFT | W_RIGHT

def layout(kind, spacing=6, pad=0, cols=0, cell=None, resize=1, spacing_y=None):
    f = {'_layoutType': kind, '_resizeMode': resize, '_spacingX': spacing, '_spacingY': spacing if spacing_y is None else spacing_y,
         '_paddingLeft': pad, '_paddingRight': pad, '_paddingTop': pad, '_paddingBottom': pad,
         '_verticalDirection': 1, '_horizontalDirection': 0, '_affectedByScale': False, '_isAlign': True}
    if cell:
        f['_cellSize'] = {'__type__': 'cc.Size', 'width': cell[0], 'height': cell[1]}
    if cols:
        f['_constraint'] = 2
        f['_constraintNum'] = cols
        f['_startAxis'] = 0
    return C('cc.Layout', **f)

def list_node(name, w, h, pos, kind=2, spacing=6, cols=0, cell=None, ax=0.5, ay=1, spacing_y=None):
    """列表容器：kind 1 横排 2 竖排 3 网格。默认锚在顶部向下长。"""
    return N(name, pos=pos, comps=[ui_transform(w, h, ax, ay), layout(kind, spacing, 0, cols, cell, spacing_y=spacing_y)])

def scroll_list(name, w, h, pos, spacing=3):
    """可滚动的竖排列表：外层裁切 + ScrollView，内层 Content 随行数长高（鼠标滚轮、拖动都能滚）。返回 (外层, Content)。"""
    view = N(name, pos=pos, comps=[ui_transform(w, h, 0.5, 1), C('cc.Graphics'),
                                    C('cc.Mask', _type=0, _inverted=False, _segments=64, _alphaThreshold=0.1)])
    content = view.child(N('Content', comps=[ui_transform(w, h, 0.5, 1), layout(2, spacing)]))
    view.add(C('cc.ScrollView', bounceDuration=0.23, brake=0.75, elastic=True, inertia=True, horizontal=False, vertical=True,
               cancelInnerEvents=True, scrollEvents=[], _content=content, _horizontalScrollBar=None, _verticalScrollBar=None))
    return view, content

def placed(node, pos):
    node.pos = pos
    return node

# 按钮材料：面色、底边、字色、选中面色、选中底边、选中字色、描边
KIND = {
    'jade':    dict(face=JADE_FACE, edge=JADE_EDGE, d=4, text='#FFF2D6', sface=JADE_FACE, sedge=JADE_EDGE, stext='#FFF2D6', stroke=('#75A088', 255)),
    'wood':    dict(face='#9D7349', edge='#68482F', d=4, text='#FFF0D0', sface='#B5895A', sedge='#68482F', stext='#FFF7E2', stroke=('#CBA776', 255)),
    'ceramic': dict(face='#EFE4CA', edge='#AD9E7D', d=4, text='#5F5B44', sface='#DDEAD6', sedge='#7E9C84', stext='#2F5E4C', stroke=('#D8CBAE', 255)),
    'tool':    dict(face='#E9DDBF', edge='#A58A66', d=5, text='#695338', sface='#447A5F', sedge='#244237', stext='#F5E6C5', stroke=('#FFEFCD', 255)),
    'quiet':   dict(face='#F1E6CE', edge='#C1B195', d=2, text='#736447', sface='#E5DCC2', sedge='#B5A68A', stext='#5B674C', stroke=('#C5B89C', 255)),
    'heat':    dict(face='#D2C5A9', edge='#D2C5A9', d=0, text='#877454', sface='#FBF1DD', sedge='#C9B78F', stext='#A36A36', stroke=('#D2C5A9', 0)),
    'pill':    dict(face=('#213C34', 225), edge='#152A26', d=3, text='#F0DEBB', sface='#2C5446', sedge='#152A26', stext='#FFF2D6', stroke=('#C2A479', 110)),
    'small':   dict(face='#E5DCC2', edge='#C0B593', d=2, text='#5B674C', sface='#E5DCC2', sedge='#C0B593', stext='#5B674C', stroke=('#B5BCA0', 255)),
    'menu':    dict(face='#EEE2C9', edge='#C7B693', d=3, text='#5D523D', sface='#E3ECD9', sedge='#8FA88A', stext='#2F5E4C', stroke=('#CBBB98', 255)),
    'choice':  dict(face='#E3D7BD', edge='#B5A281', d=4, text='#5F513A', sface='#F7ECD2', sedge='#5B8068', stext='#3C3529', stroke=('#C5B594', 255)),
    'tab':     dict(face='#EAE0C8', edge='#BBA983', d=3, text='#6B5A40', sface=JADE_FACE, sedge=JADE_EDGE, stext='#FFF2D6', stroke=('#D8CBAE', 255)),
}

def button(name, text, w=150, h=44, pos=(0, 0, 0), kind='ceramic', size=14, sub=False, ic=None, icon_size=None, radius=None,
           sub_pos='below', text_font=UIFONT, bold=False, align_left=False):
    """UiButton：底板 RoundRect + Content(横排：图标 + 文字) + 可选副文字。"""
    k = KIND[kind]
    n = N(name, pos=pos)
    r = radius if radius is not None else min(11, h / 2)
    stroke = k['stroke']
    for c in rect_comps(w, h, k['face'], r, stroke=stroke, stroke_w=1 if stroke[1] else 0, edge=k['d'], edge_col=k['edge'],
                        shadow=3 if kind not in ('heat', 'small') else 0, shadow_col=('#1A2716', 40), sheen=26 if kind not in ('heat', 'pill') else 0):
        n.add(c)
    content = n.child(N('Content', pos=(0, 7 if (sub and sub_pos == 'below') else 0, 0),
                        comps=[ui_transform(w - 12, h), layout(1, 6, 0, resize=1)]))
    ico = content.child(icon('Icon', ic, icon_size or min(20, h - 18), k['text'])) if ic else None
    lab = content.child(auto_label('Label', text, size, k['text'], font=text_font, bold=bold))
    if align_left:
        content.pos = (-w / 2 + 14, 0, 0)
        content.get('cc.UITransform').fields['_anchorPoint'] = {'__type__': 'cc.Vec2', 'x': 0, 'y': 0.5}
    sublab = None
    if sub:
        if sub_pos == 'right':
            sublab = n.child(label('Sub', '', 12, '#8E7A55', 120, 18, pos=(w / 2 - 14, 0, 0), align=2, ax=1, overflow=2, wrap=False))
        else:
            sublab = n.child(label('Sub', '', 11, '#8B7858' if kind != 'jade' else '#E2EFD9', w - 10, 16, pos=(0, -11, 0), overflow=2, wrap=False))
        sublab.active = False
    n.add(C('cc.Button', _interactable=True, _transition=0, _target=n))
    n.add(C('cc.UIOpacity', _opacity=255))
    n.add(C(cls('UiButton'), label=lab.get('cc.Label'), subLabel=sublab.get('cc.Label') if sublab else None,
            background=n.get(cls('RoundRect')), icon=ico.get(cls('UiIcon')) if ico else None,
            normalColor=color(*k['face']) if isinstance(k['face'], tuple) else color(k['face']), selectedColor=color(k['sface']),
            disabledColor=color('#000000', 0), normalEdge=color(k['edge']), selectedEdge=color(k['sedge']),
            normalText=color(k['text']), selectedText=color(k['stext']), pressDepth=3 if k['d'] >= 3 else 1))
    return n

def bar(name, w, h, pos, track='#B4A48C', fill=WARM, window=False, marker=False, caption=False):
    n = N(name, pos=pos)
    for c in rect_comps(w, h, track, radius=h / 2):
        n.add(c)
    win = n.child(N('Window', pos=(w * 0.22, 0, 0), comps=rect_comps(w * 0.16, h, '#84A177', radius=2, ax=0, ay=0.5, stroke=('#B6D7A4', 255), stroke_w=1))) if window else None
    f = n.child(N('Fill', pos=(-w / 2, 0, 0), comps=rect_comps(w * 0.4, h, fill, radius=h / 2, ax=0, ay=0.5)))
    if win:
        # 窗口画在填充之上，半透明，便于看出「已经进窗口」
        n.children.remove(win)
        n.children.append(win)
        win.get(cls('RoundRect')).fields['fill'] = color('#84A177', 150)
    mk = n.child(N('Marker', comps=rect_comps(4, h + 7, '#FAF3DB', radius=2, shadow=1, shadow_col=('#736144', 120)))) if marker else None
    cap = n.child(label('Caption', '', 11, INK, 80, 16, pos=(w / 2 + 6, 0, 0), align=0, ax=0)) if caption else None
    n.add(C(cls('UiBar'), fill=f, fillRect=f.get(cls('RoundRect')), bandLow=None, bandHigh=None, window=win, marker=mk,
            caption=cap.get('cc.Label') if cap else None))
    return n

def screen_root(name, dim=None, block=True):
    n = N(name, comps=[ui_transform(1280, 720), widget(FULL)])
    if dim:
        n.child(N('Dim', comps=rect_comps(1280, 720, dim, radius=0) + [widget(FULL)]))
    if block:
        n.add(C('cc.BlockInputEvents'))
    return n

def close_button(pos):
    return button('Close', '', 34, 34, pos=pos, kind='quiet', ic='close', icon_size=18, radius=17)

def dialog_head(card, top, eyebrow, title, intro='', intro_w=520):
    """弹窗抬头：小字眉题 + 宋体大标题 + 一句说明（设计稿 .dialog）。"""
    e = card.child(label('Eyebrow', eyebrow, 11, '#A48451', 500, 18, pos=(0, top - 30, 0), spacing=3))
    t = card.child(label('Title', title, 28, INK, 560, 40, pos=(0, top - 62, 0), font=DISPLAY, bold=True, spacing=4))
    i = card.child(label('Intro', intro, 12, '#8D7A59', intro_w, 22, pos=(0, top - 96, 0), overflow=2)) if intro is not None else None
    return e, t, i

def modal_root(name):
    return screen_root(name, dim=(DIM, 176), block=True)

# ───────────── 部件预制体 ─────────────
BUTTON = save_prefab('prefabs/ui/parts/UiButton', button('UiButton', '按钮', 146, 44, kind='ceramic', sub=True))

def list_row(name='ListRow', w=560, h=52, secondary=True):
    n = N(name)
    small = h < 44
    for c in rect_comps(w, h, '#EEE2C9', radius=11, stroke=LINE, stroke_w=1, edge=3, edge_col='#C7B693'):
        n.add(c)
    sw = n.child(box('Swatch', 6, h - 20, WOOD, pos=(-w / 2 + 12, 0, 0), radius=3))
    title = n.child(label('Title', '名称', 13 if small else 14, INK, w * 0.5, 18, pos=(-w / 2 + 24, 7 if small else 9, 0), align=0, ax=0, overflow=2, wrap=False, bold=True))
    detail = n.child(label('Detail', '', 10 if small else 11, '#8B7858', w * 0.56, 14, pos=(-w / 2 + 24, -8 if small else -11, 0), align=0, ax=0, overflow=2, wrap=False))
    # 没有副按钮的窄行：右侧信息贴着主按钮，说明文字也收窄，免得和信息叠在一起
    info_x = w / 2 - 158 if secondary else w / 2 - 96
    if not secondary:
        detail.get('cc.Label').fields['_overflow'] = 2
        detail.comps[0].fields['_contentSize']['width'] = w - 150
        title.comps[0].fields['_contentSize']['width'] = w - 150
    info = n.child(label('Info', '', 13, '#52472F', 110 if not secondary else 130, 20, pos=(info_x, 9 if not secondary else 0, 0), align=2, ax=1, overflow=2, wrap=False, font=NUMFONT))
    bh = 26 if small else 32
    sec = n.child(button('Secondary', '+4', 54, bh, pos=(w / 2 - 128, 0, 0), kind='ceramic', size=12 if small else 13)) if secondary else None
    pri = n.child(button('Primary', '+1', 76, bh, pos=(w / 2 - 50, 0, 0), kind='jade', size=12 if small else 13))
    n.add(C(cls('ListRow'), title=title.get('cc.Label'), detail=detail.get('cc.Label'), info=info.get('cc.Label'),
            swatch=sw.get(cls('RoundRect')), primary=pri.get(cls('UiButton')), secondary=sec.get(cls('UiButton')) if sec else None))
    return n
ROW = save_prefab('prefabs/ui/parts/ListRow', list_row())
save_prefab('prefabs/ui/parts/ListRowNarrow', list_row('ListRowNarrow', 340, 58, secondary=False))
save_prefab('prefabs/ui/parts/ListRowCompact', list_row('ListRowCompact', 560, 36))

def bill_row():
    """账单的一行：左边说明，右边数目，下面一条虚线（设计稿 .report-row）。"""
    w = 520
    n = N('BillRow', comps=[ui_transform(w, 32)])
    title = n.child(label('Title', '卖出 2 碗粥', 13, '#7E6B4D', 360, 20, pos=(-w / 2, 0, 0), align=0, ax=0, overflow=2, wrap=False))
    info = n.child(label('Info', '+ 66', 14, '#52472F', 200, 20, pos=(w / 2, 0, 0), align=2, ax=1, overflow=2, wrap=False, font=NUMFONT, bold=True))
    dash = n.child(N('Dash', pos=(0, -16, 0), comps=[ui_transform(w, 1)]))
    for i in range(0, w, 8):
        dash.child(box(f'd{i}', 4, 1, '#CBBC9C', pos=(-w / 2 + i + 2, 0, 0), radius=0))
    n.add(C(cls('ListRow'), title=title.get('cc.Label'), detail=None, info=info.get('cc.Label'), swatch=None, primary=None, secondary=None))
    return n
save_prefab('prefabs/ui/parts/BillRow', bill_row())

def skill_row():
    """打烊页「粥谱熟练」的一行：粥名、档位、档内进度条、今天的变化。"""
    w = 256
    n = N('SkillRow', comps=[ui_transform(w, 44)])
    title = n.child(label('Title', '白粥', 13, INK, 120, 18, pos=(-w / 2, 9, 0), align=0, ax=0, overflow=2, wrap=False, bold=True))
    tier = n.child(label('Tier', '顺手 12/20', 11, '#7E6B4D', 120, 16, pos=(w / 2 - 44, 9, 0), align=2, ax=1, overflow=2, wrap=False))
    delta = n.child(label('Delta', '+4', 13, '#7E6B4D', 40, 18, pos=(w / 2, 9, 0), align=2, ax=1, overflow=2, wrap=False, font=NUMFONT, bold=True))
    b = n.child(bar('Bar', w, 5, (0, -10, 0), track='#D9CCB0', fill='#C59651'))
    n.add(C(cls('SkillRow'), title=title.get('cc.Label'), tier=tier.get('cc.Label'), delta=delta.get('cc.Label'), bar=b.get(cls('UiBar'))))
    return n
save_prefab('prefabs/ui/parts/SkillRow', skill_row())

def order_row():
    """订单卡（设计稿 .order）：头像、姓名、粥、口味要求、右上「在做」、底部耐心条。"""
    w, h = 232, 80
    n = N('OrderRow')
    for c in rect_comps(w, h, '#F7ECD6', radius=14, stroke=('#FFF2D5', 255), stroke_w=1, edge=4, edge_col='#A9936E', shadow=4, shadow_col=('#0D202A', 60), sheen=30):
        n.add(c)
    outline = n.child(box('Outline', w + 8, h + 8, ('#000000', 0), radius=17, stroke=('#D6A75E', 255), stroke_w=2))
    outline.active = False
    av = n.child(N('Avatar', pos=(-w / 2 + 32, 4, 0), comps=[ui_transform(40, 40), C('cc.Graphics'), C(cls('Avatar'))]))
    guest = n.child(label('Guest', '阿婆', 14, INK, 130, 20, pos=(-w / 2 + 60, 22, 0), align=0, ax=0, bold=True, overflow=2, wrap=False))
    dish = n.child(label('Dish', '鸡丝粥', 12, INK, 160, 18, pos=(-w / 2 + 60, 3, 0), align=0, ax=0, overflow=2, wrap=False))
    req = n.child(label('Request', '“热一点，少放盐。”', 10, MUTE, 160, 16, pos=(-w / 2 + 60, -15, 0), align=0, ax=0, overflow=2, wrap=False))
    tag = n.child(label('Tag', '在做', 10, '#416A50', 70, 14, pos=(w / 2 - 10, 26, 0), align=2, ax=1, overflow=2, wrap=False))
    pat = n.child(bar('Patience', w - 26, 3, (0, -31, 0), track='#DBCDB3', fill=GOOD))
    n.add(C('cc.Button', _interactable=True, _transition=0, _target=n))
    n.add(C(cls('UiButton'), label=None, subLabel=None, background=n.get(cls('RoundRect')), icon=None,
            normalColor=color('#F7ECD6'), selectedColor=color('#F7ECD6'), disabledColor=color('#000000', 0),
            normalEdge=color('#A9936E'), selectedEdge=color('#A9936E'), normalText=color(INK), selectedText=color(INK), pressDepth=3))
    n.add(C(cls('OrderRow'), button=n.get(cls('UiButton')), avatar=av.get(cls('Avatar')), guest=guest.get('cc.Label'), dish=dish.get('cc.Label'),
            request=req.get('cc.Label'), tag=tag.get('cc.Label'), outline=outline.get(cls('RoundRect')), patience=pat.get(cls('UiBar'))))
    return n
ORDERROW = save_prefab('prefabs/ui/parts/OrderRow', order_row())

def pass_slot():
    """出餐台木托盘（设计稿 .pass-slot）：空时淡碗线，有碗时画碗和「送」字小章。"""
    w, h = 70, 62
    n = N('PassSlot')
    for c in rect_comps(w, h, '#7F5C3D', radius=10, stroke=('#B39469', 255), stroke_w=1, edge=4, edge_col='#342820', shadow=3, shadow_col=('#10202A', 60)):
        n.add(c)
    n.child(box('Inner', w - 10, h - 10, ('#000000', 0), radius=6, stroke=('#C29A67', 40), stroke_w=1))
    em = n.child(icon('EmptyIcon', 'bowl', 22, ('#B69C75')))
    em.get(cls('UiIcon')).fields['color'] = color('#B69C75', 120)
    bowl = n.child(N('Bowl', pos=(0, 8, 0), comps=[ui_transform(42, 32), C('cc.Graphics'), C(cls('BowlArt'))]))
    badge = n.child(box('Badge', 18, 18, '#4F785B', pos=(w / 2 - 10, h / 2 - 10, 0), radius=9))
    badge.child(label('T', '送', 10, '#F5E5BD', 18, 18))
    dish = n.child(label('Dish', '', 10, '#F5E5BD', w - 6, 14, pos=(0, -20, 0), overflow=2, wrap=False))
    n.add(C('cc.Button', _interactable=True, _transition=0, _target=n))
    n.add(C(cls('UiButton'), label=None, subLabel=None, background=n.get(cls('RoundRect')), icon=None,
            normalColor=color('#7F5C3D'), selectedColor=color('#A87A4B'), disabledColor=color('#000000', 0),
            normalEdge=color('#342820'), selectedEdge=color('#342820'), normalText=color(INK), selectedText=color(INK), pressDepth=3))
    n.add(C(cls('PassSlot'), button=n.get(cls('UiButton')), tray=n.get(cls('RoundRect')), emptyIcon=em.get(cls('UiIcon')),
            bowl=bowl.get(cls('BowlArt')), badge=badge, dish=dish.get('cc.Label')))
    return n
PASSSLOT = save_prefab('prefabs/ui/parts/PassSlot', pass_slot())

def pot_pin():
    """锅上的小木牌（设计稿 .pot-pin）。锚点在牌子底下的那颗小圆点。"""
    w, h = 150, 44
    n = N('PotPin')
    plate = n.child(N('Plate', comps=rect_comps(w, h, '#F3E7CD', radius=12, stroke=('#FFF6DC', 255), stroke_w=1, edge=4, edge_col='#AF9774',
                                                shadow=6, shadow_col=('#102729', 70), sheen=30)))
    num_ring = plate.child(box('Ring', 30, 30, ('#000000', 0), pos=(-w / 2 + 24, 0, 0), radius=15, stroke=('#B79564', 255), stroke_w=1))
    num = num_ring.child(label('Num', '壹', 16, '#916C39', 30, 30, font=DISPLAY))
    title = plate.child(label('Title', '鸡丝粥', 13, '#493B2B', 92, 18, pos=(-w / 2 + 46, 8, 0), align=0, ax=0, bold=True, overflow=2, wrap=False))
    hint = plate.child(label('Hint', '该加鸡丝了', 11, '#7B775E', 92, 16, pos=(-w / 2 + 46, -10, 0), align=0, ax=0, overflow=2, wrap=False))
    plate.child(icon('Arrow', 'arrow', 14, '#8A7656', pos=(w / 2 - 14, 0, 0)))
    stem = n.child(N('Stem', pos=(0, -h / 2 - 4, 0)))
    stem.child(box('Line', 1.5, 22, '#E3BF79', pos=(0, -11, 0), radius=0))
    stem.child(box('Dot', 10, 10, '#4F765E', pos=(0, -24, 0), radius=5, stroke=('#F9D898', 255), stroke_w=2))
    # 整个木牌（含小圆点）上移，使节点原点落在锅口上方
    plate.pos = (0, 0, 0)
    plate.add(C('cc.Button', _interactable=True, _transition=0, _target=plate))
    plate.add(C(cls('UiButton'), label=None, subLabel=None, background=plate.get(cls('RoundRect')), icon=None,
                normalColor=color('#F3E7CD'), selectedColor=color('#F3E7CD'), disabledColor=color('#000000', 0),
                normalEdge=color('#AF9774'), selectedEdge=color('#AF9774'), normalText=color(INK), selectedText=color(INK), pressDepth=3))
    n.add(C(cls('PotPin'), button=plate.get(cls('UiButton')), plate=plate.get(cls('RoundRect')), number=num.get('cc.Label'),
            title=title.get('cc.Label'), hint=hint.get('cc.Label'), stem=stem))
    return n
save_prefab('prefabs/ui/parts/PotPin', pot_pin())

def float_text():
    """送达时浮起的「+36」（HudFx 用）。"""
    n = N('FloatText', comps=[ui_transform(300, 38), C('cc.UIOpacity', _opacity=255)])
    lab = n.child(label('Label', '+36', 26, '#FFE3A3', 300, 38, font=NUMFONT, bold=True, overflow=2, wrap=False, shadow=('#0B1C1E', 220)))
    # 深色描边：落在暗色墙面、木台上都看得清
    lab.get('cc.Label').fields.update(_enableOutline=True, _outlineColor=color('#3A2412', 235), _outlineWidth=3)
    return n
save_prefab('prefabs/ui/parts/FloatText', float_text())

def guest_bubble():
    """客人头顶的小气泡：粥名 + 耐心条，或一句反应。锚点在气泡尾巴尖上。"""
    n = N('GuestBubble', comps=[ui_transform(120, 44, 0.5, 0), C('cc.UIOpacity', _opacity=255)])
    plate = n.child(N('Plate', pos=(0, 30, 0), comps=rect_comps(110, 40, '#F7EEDA', radius=14, stroke=('#2F4A45', 255), stroke_w=1,
                                                              shadow=5, shadow_col=('#0D2124', 80))))
    tail = n.child(N('Tail', pos=(0, 9, 0), euler=(0, 0, 45), comps=rect_comps(10, 10, '#F7EEDA', radius=2)))
    text = plate.child(label('Text', '鸡丝粥', 13, '#2F4A45', 160, 18, pos=(0, 6, 0), bold=True, overflow=2, wrap=False))
    pat = plate.child(bar('Patience', 86, 4, (0, -10, 0), track=('#D8CBB0', 255), fill='#5F8F6A'))
    n.add(C(cls('GuestBubble'), plate=plate.get(cls('RoundRect')), text=text.get('cc.Label'), patience=pat.get(cls('UiBar')), tail=tail))
    return n
save_prefab('prefabs/ui/parts/GuestBubble', guest_bubble())

def recipe_tile():
    w, h = 168, 124
    n = N('RecipeTile')
    for c in rect_comps(w, h, '#E8DCC2', radius=14, stroke=('#CDBB97', 255), stroke_w=1):
        n.add(c)
    n.add(C('cc.UIOpacity', _opacity=255))
    bowl = n.child(N('Bowl', pos=(0, 30, 0), comps=[ui_transform(60, 44), C('cc.Graphics'), C(cls('BowlArt'))]))
    title = n.child(label('Title', '白粥', 13, INK, w - 10, 18, pos=(0, -4, 0), bold=True, overflow=2, wrap=False, spacing=1))
    detail = n.child(label('Detail', '米香清淡 · 中火慢熬', 10, '#8F7B57', w - 14, 26, pos=(0, -27, 0), overflow=2))
    price = n.child(label('Price', '16 铜钱', 11, '#628165', w - 10, 16, pos=(0, -48, 0), bold=True))
    mark = n.child(label('Mark', '', 10, '#B98C45', 100, 14, pos=(w / 2 - 8, h / 2 - 12, 0), align=2, ax=1, overflow=2, wrap=False))
    n.add(C(cls('RecipeTile'), card=n.get(cls('RoundRect')), bowl=bowl.get(cls('BowlArt')), title=title.get('cc.Label'),
            detail=detail.get('cc.Label'), price=price.get('cc.Label'), mark=mark.get('cc.Label')))
    return n
save_prefab('prefabs/ui/parts/RecipeTile', recipe_tile())

def milestone_tile():
    """小店手账的一页（文档 30 §4）：名称、条件与进度，记下的右上角一枚红章。"""
    w, h = 168, 52
    n = N('MilestoneTile')
    for c in rect_comps(w, h, '#E8DCC2', radius=10, stroke=('#CDBB97', 255), stroke_w=1):
        n.add(c)
    title = n.child(label('Title', '头一碗刚好', 12, INK, w - 40, 16, pos=(-w / 2 + 10, 10, 0), align=0, ax=0, bold=True, overflow=2, wrap=False))
    line = n.child(label('Line', '熬出第一碗「刚好」 0/1', 9, '#8F7B57', w - 16, 26, pos=(-w / 2 + 10, -9, 0), align=0, ax=0, overflow=2))
    stamp = n.child(box('Stamp', 26, 26, ('#000000', 0), pos=(w / 2 - 18, 10, 0), radius=13, stroke=('#B54A35', 255), stroke_w=2))
    stamp.child(label('Seal', '记', 13, '#B54A35', 26, 26, font=DISPLAY, bold=True))
    n.add(C(cls('MilestoneTile'), card=n.get(cls('RoundRect')), title=title.get('cc.Label'), line=line.get('cc.Label'), stamp=stamp))
    return n
save_prefab('prefabs/ui/parts/MilestoneTile', milestone_tile())

def guest_tile():
    w, h = 168, 196
    n = N('GuestTile')
    for c in rect_comps(w, h, '#EEE2C9', radius=14, stroke=('#CDBB97', 255), stroke_w=1, edge=3, edge_col='#C7B693'):
        n.add(c)
    n.add(C('cc.UIOpacity', _opacity=255))
    av = n.child(N('Avatar', pos=(0, 52, 0), comps=[ui_transform(58, 58), C('cc.Graphics'), C(cls('Avatar'))]))
    title = n.child(label('Title', '街坊', 15, INK, w - 10, 20, pos=(0, 10, 0), bold=True, font=DISPLAY, spacing=2))
    detail = n.child(label('Detail', '爱吃咸香', 10, '#8F7B57', w - 14, 16, pos=(0, -10, 0), overflow=2, wrap=False))
    fav = n.child(bar('Favor', 130, 5, (0, -34, 0), track='#D9CCB0', fill=GOOD))
    fl = n.child(label('FavorLabel', '好感 0 / 20', 10, '#628165', w - 10, 14, pos=(0, -47, 0)))
    st = n.child(label('Story', '', 10, '#8B7858', w - 18, 30, pos=(0, -72, 0), overflow=2))
    n.add(C(cls('GuestTile'), avatar=av.get(cls('Avatar')), title=title.get('cc.Label'), detail=detail.get('cc.Label'),
            favor=fav.get(cls('UiBar')), favorLabel=fl.get('cc.Label'), story=st.get('cc.Label')))
    return n
save_prefab('prefabs/ui/parts/GuestTile', guest_tile())

def prefab_ref(rel):
    return asset_ref(prefab_uuid(rel), 'cc.Prefab')

# ───────────── 面板预制体 ─────────────
def brand(parent, pos, big=False):
    """店名：碗徽 + 「粥霸天」+ 红印「粥」+ 一句小店气质（设计稿左上）。"""
    k = 1.6 if big else 1.0
    g = parent.child(N('Brand', pos=pos, comps=[ui_transform(320 * k, 64 * k, 0, 1)]))
    mark = g.child(box('Mark', 48 * k, 48 * k, ('#213D37', 190), pos=(24 * k, -30 * k, 0), radius=24 * k, stroke=('#D6B27E', 140), stroke_w=1))
    mark.child(icon('Bowl', 'bowl', 28 * k, '#DFBC88'))
    g.child(label('Name', '粥霸天', int(30 * k), '#F7EAD0', 140 * k, 40 * k, pos=(58 * k, -22 * k, 0), align=0, ax=0, font=DISPLAY, bold=True,
                  spacing=int(5 * k), shadow=('#09181B', 140)))
    seal = g.child(box('Seal', 18 * k, 22 * k, '#AD4F36', pos=(184 * k, -20 * k, 0), radius=3, stroke=('#DE8064', 255), stroke_w=1))
    seal.euler = (0, 0, -5)
    seal.child(label('T', '粥', int(12 * k), '#F7EAD0', 18 * k, 22 * k, font=DISPLAY))
    g.child(label('Sub', '一 间 有 热 气 的 小 店', int(10 * k + 1), '#D4C6A8', 200 * k, 16 * k, pos=(60 * k, -48 * k, 0), align=0, ax=0,
                  shadow=('#09181B', 140)))
    return g

def title_panel():
    n = screen_root('TitlePanel', block=True)
    shade = n.child(N('Shade', comps=rect_comps(1280, 720, ('#0D2929', 90), radius=0) + [widget(FULL)]))
    c = n.child(ceramic('Card', 400, 520, pos=(-400, -10, 0)))
    c.add(widget(W_LEFT | W_MID, left=40))
    c.child(label('Eyebrow', '炭 火 慢 熬 · 街 坊 小 铺', 11, '#A48451', 360, 18, pos=(0, 226, 0)))
    c.child(label('Logo', '粥霸天', 58, INK, 360, 76, pos=(-10, 172, 0), font=DISPLAY, bold=True, spacing=8))
    seal = c.child(box('Seal', 26, 32, '#AD4F36', pos=(128, 186, 0), radius=4, stroke=('#DE8064', 255), stroke_w=1))
    seal.euler = (0, 0, -5)
    seal.child(label('T', '粥', 17, '#F7EAD0', 26, 32, font=DISPLAY))
    sub = c.child(label('Subtitle', '', 13, '#8D7A59', 340, 22, pos=(0, 118, 0)))
    c.child(box('Divider', 300, 1, '#BDAB89', pos=(0, 96, 0), radius=0))
    col = c.child(list_node('Buttons', 300, 290, (0, 76, 0), kind=2, spacing=14))
    cont = col.child(button('Continue', '继续营业', 300, 56, kind='jade', size=17, ic='door', text_font=DISPLAY, bold=True))
    new = col.child(button('New', '重新开张', 300, 50, kind='ceramic', size=15, ic='shop'))
    prac = col.child(button('Practice', '练练手', 300, 46, kind='ceramic', size=14, ic='spoon'))
    sett = col.child(button('Settings', '菜单', 300, 46, kind='quiet', size=14, ic='menu'))
    warn = c.child(label('Warning', '', 12, BRICK, 340, 60, pos=(0, -222, 0)))
    n.add(C(cls('TitlePanel'), subtitle=sub.get('cc.Label'), warning=warn.get('cc.Label'), continueButton=cont.get(cls('UiButton')),
            newButton=new.get(cls('UiButton')), practiceButton=prac.get(cls('UiButton')), settingsButton=sett.get(cls('UiButton'))))
    return n
save_prefab('prefabs/ui/TitlePanel', title_panel())

def morning_panel():
    n = modal_root('MorningPanel')
    c = n.child(ceramic('Card', 1200, 640, radius=23, edge=8))
    c.child(label('Eyebrow', '清 晨 · 进 货 与 菜 单', 11, '#A48451', 400, 18, pos=(0, 298, 0)))
    header = c.child(label('Header', '第 1 日 · 清晨', 24, INK, 1000, 34, pos=(0, 272, 0), font=DISPLAY, bold=True, spacing=2, overflow=2, wrap=False))
    c.child(label('BuyTitle', '进货 · 今天到货，满新鲜', 13, WOOD, 560, 20, pos=(-300, 240, 0), align=0, font=DISPLAY))
    # 时令粥加进来后最多 16 行，超出卡片时可以滚动
    ing_view, ing = scroll_list('Ingredients', 560, 466, (-300, 226, 0), spacing=3)
    c.child(ing_view)
    c.child(label('MenuTitle', '今日菜单', 13, WOOD, 560, 20, pos=(300, 240, 0), align=0, font=DISPLAY))
    rec_view, rec = scroll_list('Recipes', 560, 456, (300, 226, 0), spacing=3)
    c.child(rec_view)
    notice = c.child(label('Notice', '', 11, '#8A7858', 560, 52, pos=(-300, -290, 0), align=0, overflow=2))
    goals = c.child(label('Goals', '', 11, '#326B5B', 1120, 18, pos=(0, -256, 0), overflow=2, wrap=False, spacing=1))
    row = c.child(list_node('Buttons', 600, 50, (290, -288, 0), kind=1, spacing=10, ay=0.5))
    title = row.child(button('Title', '回标题', 100, 44, kind='quiet', ic='back'))
    prac = row.child(button('Practice', '练手', 100, 44, kind='ceramic', ic='spoon'))
    dec = row.child(button('Decor', '布置', 100, 44, kind='ceramic', ic='lamp'))
    start = row.child(button('Start', '开始备料', 190, 50, kind='jade', size=16, ic='knife', text_font=DISPLAY, bold=True))
    n.add(C(cls('MorningPanel'), header=header.get('cc.Label'), notice=notice.get('cc.Label'), goals=goals.get('cc.Label'), ingredientList=ing, recipeList=rec,
            rowPrefab=prefab_ref('prefabs/ui/parts/ListRowCompact'), startButton=start.get(cls('UiButton')), decorButton=dec.get(cls('UiButton')),
            practiceButton=prac.get(cls('UiButton')), titleButton=title.get(cls('UiButton'))))
    return n
save_prefab('prefabs/ui/MorningPanel', morning_panel())

def hud():
    n = N('HudView', comps=[ui_transform(1280, 720), widget(FULL)])
    # 画面上下的暗角（设计稿 .world-shade）
    n.child(N('ShadeTop', pos=(0, 330, 0), comps=rect_comps(1280, 60, ('#0D2929', 60), radius=0) + [widget(W_TOP | W_LEFT | W_RIGHT)]))
    n.child(N('ShadeBottom', pos=(0, -320, 0), comps=rect_comps(1280, 80, ('#122927', 90), radius=0) + [widget(W_BOT | W_LEFT | W_RIGHT)]))
    pins = n.child(N('Pins', comps=[ui_transform(1280, 720), widget(FULL)]))
    bubbles = n.child(N('Bubbles', comps=[ui_transform(1280, 720), widget(FULL)]))

    # 左上店名
    b = brand(n, (-618, 342, 0))
    b.add(widget(W_TOP | W_LEFT, left=22, top=18))

    # 上方中央：第几日
    day = n.child(N('DayChip', pos=(0, 318, 0), comps=rect_comps(270, 56, CREAM, radius=28, stroke=('#FFF8E7', 255), stroke_w=1, edge=4,
                                                                    edge_col='#AA997E', shadow=8, shadow_col=('#091619', 80), sheen=34)))
    day.add(widget(W_TOP | W_CENTER, top=18))
    num = day.child(label('Num', '肆', 24, '#997844', 40, 34, pos=(-110, 0, 0), font=DISPLAY))
    day.child(box('Divider', 1, 30, '#CDBB9D', pos=(-86, 0, 0), radius=0))
    dtitle = day.child(label('Title', '第 4 日 · 傍晚', 13, INK, 170, 18, pos=(-72, 9, 0), align=0, ax=0, bold=True, overflow=2, wrap=False, spacing=1))
    dsub = day.child(label('Sub', '街坊来，粥正香', 10, MUTE, 180, 15, pos=(-72, -10, 0), align=0, ax=0, overflow=2, wrap=False))
    dot = day.child(box('Dot', 8, 8, '#5C9475', pos=(118, 0, 0), radius=4))

    # 右上铜钱
    wal = n.child(N('Wallet', pos=(538, 316, 0), comps=rect_comps(160, 52, CREAM, radius=26, stroke=('#FFF8E7', 255), stroke_w=1, edge=4,
                                                                     edge_col='#AA997E', shadow=8, shadow_col=('#091619', 80), sheen=34)))
    wal.add(widget(W_TOP | W_RIGHT, top=20, right=22))
    wal.child(icon('Coin', 'coin', 26, '#976B2D', fill='#E6BE6B', pos=(-54, 0, 0)))
    wv = wal.child(label('Value', '268', 22, INK, 70, 30, pos=(-36, 1, 0), align=0, ax=0, font=NUMFONT, bold=True, overflow=2, wrap=False))
    wt = wal.child(label('Today', '铜钱', 10, MUTE, 60, 16, pos=(66, 0, 0), align=2, ax=1, overflow=2, wrap=False))

    # 左边工具
    tools = n.child(list_node('Tools', 56, 260, (-588, 248, 0), kind=2, spacing=12, ay=1))
    tools.add(widget(W_TOP | W_LEFT, left=22, top=112))
    def tool(name, text, ic):
        t = button(name, '', 54, 56, kind='tool', ic=None, radius=15)
        t.children = [ch for ch in t.children if ch.name != 'Content']
        ico = t.child(icon('Icon', ic, 22, '#695338', pos=(0, 8, 0)))
        lab = t.child(label('Label', text, 10, '#695338', 54, 14, pos=(0, -15, 0), spacing=1))
        u = t.get(cls('UiButton'))
        u.fields['label'] = lab.get('cc.Label')
        u.fields['icon'] = ico.get(cls('UiIcon'))
        return t
    shop_t = tools.child(tool('Shop', '小店', 'shop'))
    book_t = tools.child(tool('Book', '粥谱', 'book'))
    deco_t = tools.child(tool('Decor', '布置', 'lamp'))
    menu_t = tools.child(tool('Menu', '菜单', 'menu'))
    back = n.child(button('Back', '回到小店', 118, 40, pos=(-559, 228, 0), kind='ceramic', ic='back', size=13))
    back.add(widget(W_TOP | W_LEFT, left=22, top=112))

    # 底部中央的小字与提示条
    note = n.child(label('ShopNote', '——   炭 火 慢 熬   ·   街 坊 小 铺   ——', 11, '#DBC5A1', 400, 16, pos=(0, -340, 0)))
    note.add(widget(W_BOT | W_CENTER, bottom=12))
    hint = n.child(N('Hint', pos=(0, -262, 0), comps=rect_comps(430, 36, ('#173430', 205), radius=18, stroke=('#AFAA81', 90), stroke_w=1,
                                                                 shadow=4, shadow_col=('#0D1E23', 60))))
    hint.child(box('Dot', 6, 6, '#D9B06E', pos=(-196, 0, 0), radius=3))
    hint_l = hint.child(label('Label', '点一口锅，看看熬得怎么样了', 13, '#F7EAD2', 380, 20, pos=(6, 1, 0), overflow=2, wrap=False, spacing=1))
    act = hint.child(bar('Action', 380, 3, (0, -14, 0), track=('#F7EAD2', 50), fill=GOLD))
    cancel = hint.child(button('Cancel', '取消', 52, 26, pos=(250, 0, 0), kind='small', size=11))
    toast = n.child(N('Toast', pos=(0, 248, 0), comps=rect_comps(460, 44, ('#2E554A', 239), radius=14, stroke=('#A4B28A', 255), stroke_w=1,
                                                                   shadow=8, shadow_col=('#0F2424', 90))))
    toast.add(widget(W_TOP | W_CENTER, top=84))
    toast_l = toast.child(label('Label', '', 14, '#F5ECD5', 440, 22, overflow=2, wrap=False))
    toast.active = False

    # 右边：街坊的点单
    orders = n.child(N('Orders', pos=(523, 254, 0), comps=[ui_transform(232, 420, 0.5, 1)]))
    orders.add(widget(W_TOP | W_RIGHT, top=106, right=22))
    orders.child(label('Heading', '街坊的点单', 15, '#F4E5CA', 160, 22, pos=(-112, -10, 0), align=0, ax=0, font=DISPLAY, spacing=2,
                       shadow=('#09181B', 140)))
    count = orders.child(label('Count', '02', 12, '#CCBA97', 60, 18, pos=(112, -10, 0), align=2, ax=1, font=NUMFONT))
    olist = orders.child(list_node('List', 232, 360, (0, -34, 0), spacing=12))
    empty = orders.child(box('Empty', 232, 92, '#F2E5CA', pos=(0, -84, 0), radius=14, edge=4, edge_col='#AA9673'))
    empty.child(icon('Icon', 'bowl', 26, '#627158', pos=(0, 18, 0)))
    empty.child(label('T', '还没有人点单。\n先把锅烧热，街坊闻着香就来了。', 11, '#627158', 210, 36, pos=(0, -16, 0)))
    foot = orders.child(N('Foot', pos=(-112, -138, 0)))
    foot.child(icon('Heart', 'heart', 12, '#D2C0A2', pos=(6, 0, 0)))
    foot_l = foot.child(label('Label', '好粥值得等一会儿', 11, '#D2C0A2', 200, 16, pos=(18, 0, 0), align=0, ax=0, spacing=1))

    # 右下：出餐台 + 打烊看看账
    pas = n.child(N('Pass', pos=(523, -168, 0), comps=[ui_transform(232, 110, 0.5, 0.5)]))
    pas.add(widget(W_BOT | W_RIGHT, bottom=90, right=22))
    pas.child(label('Title', '出餐台', 14, '#E5D0AA', 120, 20, pos=(-112, 40, 0), align=0, ax=0, font=DISPLAY, spacing=2, shadow=('#09181B', 140)))
    pas.child(label('Sub', '趁热送到街坊手里', 10, '#BAA98B', 160, 14, pos=(-112, 20, 0), align=0, ax=0, spacing=1))
    plist = pas.child(list_node('Slots', 232, 66, (-116, -20, 0), kind=1, spacing=11, ax=0, ay=0.5))
    endb = n.child(button('End', '打烊看看账', 140, 40, pos=(548, -314, 0), kind='pill', ic='moon', size=13))
    endb.add(widget(W_BOT | W_RIGHT, bottom=26, right=22))

    # 左下：正在照看
    fc = n.child(ceramic('FocusCard', 336, 200, pos=(-450, -236, 0)))
    fc.add(widget(W_BOT | W_LEFT, bottom=26, left=22))
    ib = fc.child(box('IconBox', 40, 40, '#DDDCB9', pos=(-134, 62, 0), radius=10, stroke=('#C3C7A4', 255), stroke_w=1))
    ib.child(icon('Icon', 'bowl', 26, '#67806A'))
    feye = fc.child(label('Eyebrow', '正在照看 · 壹号锅', 10, MUTE, 190, 15, pos=(-106, 74, 0), align=0, ax=0, overflow=2, wrap=False, spacing=1))
    ftitle = fc.child(label('Title', '鸡丝粥', 20, INK, 190, 28, pos=(-106, 52, 0), align=0, ax=0, font=DISPLAY, bold=True, overflow=2, wrap=False, spacing=1))
    look = fc.child(button('Look', '看锅', 66, 28, pos=(124, 64, 0), kind='small', ic='arrow', size=11, icon_size=12))
    fstat = fc.child(label('Status', '该加鸡丝了', 12, INK, 210, 18, pos=(-150, 22, 0), align=0, ax=0, overflow=2, wrap=False))
    fq = fc.child(label('Quality', '咸香 · 中火', 10, '#847354', 110, 16, pos=(150, 22, 0), align=2, ax=1, overflow=2, wrap=False))
    fbar = fc.child(bar('Doneness', 300, 8, (0, 2, 0), window=True, marker=True))
    fc.child(label('L', '米粒开花', 9, '#9A8A70', 80, 14, pos=(-150, -13, 0), align=0, ax=0))
    fmid = fc.child(label('Mid', '刚刚好', 9, '#547954', 60, 14, pos=(54, -13, 0)))
    fc.child(label('R', '过火', 9, '#9A8A70', 60, 14, pos=(150, -13, 0), align=2, ax=1))
    fact = fc.child(N('Actions', pos=(0, -58, 0), comps=[ui_transform(300, 46)]))
    fpri = fact.child(button('Primary', '加入鸡丝', 196, 44, pos=(-52, 0, 0), kind='jade', ic='leaf', size=14))
    fsec = fact.child(button('Secondary', '搅一搅', 96, 44, pos=(102, 0, 0), kind='quiet', ic='spoon', size=13))
    frec = fc.child(list_node('Recipes', 300, 110, (0, 8, 0), kind=3, spacing=8, cols=2, cell=(146, 44)))

    # 备料台（左边，焦点卡上方）
    # 备料台卡片锚在顶边：没有脏桌时变矮，底边仍贴着屏幕下方
    pc = n.child(ceramic('PrepCard', 336, 118, pos=(-106, -216, 0), radius=15, edge=5, ay=1))
    pc.add(widget(W_BOT | W_LEFT, bottom=26, left=374, mode=1))
    plabel = pc.child(label('Label', '备料台  空', 11, '#7E6B4D', 310, 16, pos=(-155, -14, 0), align=0, ax=0, overflow=2, wrap=False))
    plist2 = pc.child(list_node('Prep', 310, 46, (0, -26, 0), kind=3, spacing=6, cols=4, cell=(73, 44)))
    wlist = pc.child(list_node('Wipes', 310, 30, (0, -78, 0), kind=3, spacing=6, cols=3, cell=(99, 28)))

    # 熬粥特写：下方操作卡
    cp = n.child(ceramic('CookPanel', 760, 232, pos=(0, -218, 0), radius=22, edge=6))
    cp.add(widget(W_BOT | W_CENTER, bottom=24))
    cp.child(label('Eyebrow', '一锅好粥，急不得', 11, MUTE, 120, 16, pos=(-355, 92, 0), align=0, ax=0, spacing=1))
    ctitle = cp.child(label('Title', '鸡丝粥', 24, INK, 300, 34, pos=(-228, 92, 0), align=0, ax=0, font=DISPLAY, bold=True, overflow=2, wrap=False, spacing=2))
    cright = cp.child(label('Right', '壹号锅 · 咸香', 11, '#8F7D60', 200, 16, pos=(355, 92, 0), align=2, ax=1, overflow=2, wrap=False))
    cstat = cp.child(label('Status', '该加鸡丝了', 13, INK, 320, 20, pos=(-355, 62, 0), align=0, ax=0, overflow=2, wrap=False))
    cp.child(label('StirT', '搅', 11, MUTE, 16, 16, pos=(4, 62, 0)))
    stir = cp.child(bar('Stir', 90, 5, (62, 62, 0), track='#D9CCB0', fill=GOOD))
    cp.child(label('ScorchT', '焦', 11, MUTE, 16, 16, pos=(126, 62, 0)))
    scorch = cp.child(bar('Scorch', 90, 5, (184, 62, 0), track='#D9CCB0', fill=BRICK))
    cpct = cp.child(label('Percent', '60%', 12, '#52472F', 60, 18, pos=(355, 62, 0), align=2, ax=1, font=NUMFONT, bold=True))
    cbar = cp.child(bar('Doneness', 710, 10, (0, 42, 0), window=True, marker=True))
    cp.child(label('L', '米粒开花', 10, '#9A8A70', 80, 14, pos=(-355, 26, 0), align=0, ax=0))
    cmid = cp.child(label('Mid', '盛碗窗口', 10, '#547954', 80, 14, pos=(150, 26, 0)))
    cp.child(label('R', '过火', 10, '#9A8A70', 60, 14, pos=(355, 26, 0), align=2, ax=1))
    row = cp.child(N('Row', pos=(0, -16, 0), comps=[ui_transform(710, 52)]))
    heat = row.child(box('Heat', 168, 52, '#D2C5A9', pos=(-271, 0, 0), radius=11))
    low = heat.child(button('Low', '文火', 52, 46, pos=(-55, 0, 0), kind='heat', ic='flame', size=10, icon_size=16))
    mid = heat.child(button('Mid', '中火', 52, 46, pos=(0, 0, 0), kind='heat', ic='flame', size=10, icon_size=16))
    high = heat.child(button('High', '武火', 52, 46, pos=(55, 0, 0), kind='heat', ic='flame', size=10, icon_size=16))
    for hb in (low, mid, high):
        # 火候按钮：图标在上、字在下
        cont = next(ch for ch in hb.children if ch.name == 'Content')
        cont.get('cc.Layout').fields['_layoutType'] = 2
        cont.get('cc.Layout').fields['_spacingY'] = 2
    stirb = row.child(button('Stir', '搅一搅', 100, 46, pos=(-132, 0, 0), kind='wood', ic='spoon', size=14))
    add = row.child(button('Add', '加入鸡丝', 128, 46, pos=(16, 0, 0), kind='ceramic', ic='leaf', size=14))
    season = row.child(list_node('Season', 184, 46, (16, 0, 0), kind=1, spacing=5, ay=0.5))
    plain = season.child(button('Plain', '原味', 58, 46, kind='ceramic', size=13))
    savory = season.child(button('Savory', '咸香', 58, 46, kind='ceramic', size=13))
    sweet = season.child(button('Sweet', '清甜', 58, 46, kind='ceramic', size=13))
    plate = row.child(button('Plate', '盛碗', 236, 46, pos=(236, 0, 0), kind='jade', ic='bowl', size=15, text_font=DISPLAY, bold=True))
    dump = cp.child(button('Dump', '倒掉', 64, 28, pos=(320, -80, 0), kind='small', ic='close', size=11, icon_size=12))
    tip = cp.child(label('Tip', '米已开花，趁现在把鸡丝下锅。', 11, '#8C795C', 560, 18, pos=(-20, -80, 0), overflow=2, wrap=False, spacing=1))
    crec = cp.child(list_node('Recipes', 710, 160, (0, 46, 0), kind=3, spacing=8, cols=5, cell=(134, 44)))

    # 每日小目标：日子牌右边的小签，点开看三件；左上（工具栏右侧）展开清单
    gchip = n.child(button('GoalChip', '小目标 0/3', 128, 32, pos=(206, 318, 0), kind='small', ic='star', size=11, icon_size=13))
    gchip.add(widget(W_TOP | W_CENTER, top=30, hc=212))
    gpanel = n.child(ceramic('GoalPanel', 320, 158, pos=(-384, 190, 0), radius=15, edge=5, ax=0, ay=1))
    gpanel.add(widget(W_TOP | W_LEFT, top=112, left=96))
    gpanel.child(label('Eyebrow', '今 日 小 目 标', 10, '#A48451', 200, 16, pos=(16, -16, 0), align=0, ax=0, spacing=1))
    glabels, gvalues, gicons = [], [], []
    for i in range(3):
        y = -44 - i * 30
        gicons.append(gpanel.child(icon(f'Icon{i}', 'star', 16, '#C59651', pos=(26, y, 0))))
        glabels.append(gpanel.child(label(f'Goal{i}', '卖出 6 碗粥', 12, INK, 190, 18, pos=(42, y, 0), align=0, ax=0, overflow=2, wrap=False)))
        gvalues.append(gpanel.child(label(f'Value{i}', '2/6  +12', 11, '#7E6B4D', 90, 18, pos=(306, y, 0), align=2, ax=1, font=NUMFONT, overflow=2, wrap=False)))
    # 本章进度（文档 30）：清单最下面一行
    gchapter = gpanel.child(label('Chapter', '', 10, '#6E7A5E', 296, 16, pos=(16, -138, 0), align=0, ax=0, overflow=2, wrap=False))
    gpanel.active = False

    # 手感反馈：浮字层 + 结果章（HudFx）
    floats = n.child(N('Floats', comps=[ui_transform(1280, 720), widget(FULL)]))
    stamp = n.child(N('Stamp', pos=(0, 150, 0), comps=[ui_transform(180, 72), C('cc.UIOpacity', _opacity=255)]))
    ring = stamp.child(box('Ring', 176, 68, ('#F7EEDA', 235), radius=16, stroke=('#326B5B', 255), stroke_w=3, shadow=8, shadow_col=('#0D2124', 90)))
    stitle = stamp.child(label('Title', '刚好', 26, '#326B5B', 170, 34, pos=(0, 9, 0), font=DISPLAY, bold=True, spacing=4, overflow=2, wrap=False))
    ssub = stamp.child(label('Sub', '92 分', 11, '#7E6B4D', 170, 16, pos=(0, -19, 0), overflow=2, wrap=False, spacing=1))
    stamp.active = False
    n.add(C(cls('HudFx'), floatRoot=floats, floatPrefab=prefab_ref('prefabs/ui/parts/FloatText'), stamp=stamp,
            stampRing=ring.get(cls('RoundRect')), stampTitle=stitle.get('cc.Label'), stampSub=ssub.get('cc.Label')))

    n.add(C(cls('HudView'),
            goalChip=gchip.get(cls('UiButton')), goalPanel=gpanel, goalLabels=[l.get('cc.Label') for l in glabels],
            goalValues=[v.get('cc.Label') for v in gvalues], goalIcons=[ic.get(cls('UiIcon')) for ic in gicons], fx=n.get(cls('HudFx')),
            chapterLabel=gchapter.get('cc.Label'),
            bubbleRoot=bubbles, bubblePrefab=prefab_ref('prefabs/ui/parts/GuestBubble'), bubbleHeight=1.75,
            dayNumber=num.get('cc.Label'), dayTitle=dtitle.get('cc.Label'), daySub=dsub.get('cc.Label'), openDot=dot.get(cls('RoundRect')),
            walletLabel=wv.get('cc.Label'), walletToday=wt.get('cc.Label'),
            tools=tools, shopTool=shop_t.get(cls('UiButton')), bookTool=book_t.get(cls('UiButton')), decorTool=deco_t.get(cls('UiButton')),
            menuTool=menu_t.get(cls('UiButton')), backButton=back.get(cls('UiButton')),
            pinRoot=pins, pinPrefab=prefab_ref('prefabs/ui/parts/PotPin'),
            hint=hint, hintLabel=hint_l.get('cc.Label'), actionBar=act.get(cls('UiBar')), cancelButton=cancel.get(cls('UiButton')),
            toast=toast, toastLabel=toast_l.get('cc.Label'), shopNote=note,
            ordersPanel=orders, ordersCount=count.get('cc.Label'), orderList=olist, orderRowPrefab=prefab_ref('prefabs/ui/parts/OrderRow'),
            ordersEmpty=empty, ordersFoot=foot_l.get('cc.Label'),
            passPanel=pas, passList=plist, passSlotPrefab=prefab_ref('prefabs/ui/parts/PassSlot'), endButton=endb.get(cls('UiButton')),
            focusCard=fc, focusEyebrow=feye.get('cc.Label'), focusTitle=ftitle.get('cc.Label'), lookButton=look.get(cls('UiButton')),
            focusStatus=fstat.get('cc.Label'), focusQuality=fq.get('cc.Label'), focusBar=fbar.get(cls('UiBar')), focusMid=fmid.get('cc.Label'),
            focusActions=fact, focusPrimary=fpri.get(cls('UiButton')), focusSecondary=fsec.get(cls('UiButton')), focusRecipes=frec,
            cookPanel=cp, cookTitle=ctitle.get('cc.Label'), cookRight=cright.get('cc.Label'), cookStatus=cstat.get('cc.Label'),
            cookPercent=cpct.get('cc.Label'), cookBar=cbar.get(cls('UiBar')), cookMid=cmid.get('cc.Label'),
            stirBar=stir.get(cls('UiBar')), scorchBar=scorch.get(cls('UiBar')), cookRow=row,
            lowButton=low.get(cls('UiButton')), midButton=mid.get(cls('UiButton')), highButton=high.get(cls('UiButton')),
            stirButton=stirb.get(cls('UiButton')), addButton=add.get(cls('UiButton')), plateButton=plate.get(cls('UiButton')),
            seasonRow=season, plainButton=plain.get(cls('UiButton')), savoryButton=savory.get(cls('UiButton')), sweetButton=sweet.get(cls('UiButton')),
            dumpButton=dump.get(cls('UiButton')), cookRecipes=crec, cookTip=tip.get('cc.Label'),
            buttonPrefab=prefab_ref('prefabs/ui/parts/UiButton'),
            prepCard=pc, prepLabel=plabel.get('cc.Label'), prepList=plist2, wipeList=wlist))
    return n

def report_panel():
    n = modal_root('ReportPanel')
    c = n.child(ceramic('Bill', 580, 620, pos=(-340, 0, 0), radius=23, edge=8))
    stamp = c.child(box('Stamp', 56, 56, ('#000000', 0), pos=(0, 266, 0), radius=28, stroke=('#A1AD85', 255), stroke_w=2))
    stamp.child(box('Inner', 46, 46, ('#000000', 0), radius=23, stroke=('#A1AD85', 110), stroke_w=1))
    stamp.child(icon('Icon', 'bowl', 28, '#6D855E'))
    eye = c.child(label('Eyebrow', '第 4 日 · 打烊账单', 11, '#A48451', 400, 18, pos=(0, 222, 0), spacing=4))
    title = c.child(label('Title', '烟火收进一碗粥', 26, INK, 520, 38, pos=(0, 192, 0), font=DISPLAY, bold=True, spacing=4))
    intro = c.child(label('Intro', '今天的热粥，街坊都记在心里。', 12, '#8D7A59', 520, 20, pos=(0, 162, 0), overflow=2))
    stars = [c.child(icon(f'Star{i}', 'star', 20, '#D4AA5B', fill='#D4AA5B', pos=(-30 + i * 30, 134, 0), lw=1.2)) for i in range(3)]
    rows = c.child(list_node('Rows', 520, 270, (0, 114, 0), spacing=2))
    c.child(box('Rule', 520, 1, '#BDAB89', pos=(0, -168, 0), radius=0))
    tl = c.child(label('TotalLabel', '结余', 14, '#395E48', 200, 22, pos=(-260, -192, 0), align=0, ax=0, bold=True))
    tv = c.child(label('TotalValue', '314', 30, '#395E48', 200, 40, pos=(214, -192, 0), align=2, ax=1, font=NUMFONT, bold=True))
    c.child(label('Unit', '铜钱', 11, '#7E6B4D', 40, 16, pos=(260, -196, 0), align=2, ax=1))
    foot = c.child(label('Footnote', '', 11, '#8A7858', 520, 40, pos=(0, -228, 0), overflow=2))
    row = c.child(list_node('Buttons', 560, 50, (0, -274, 0), kind=1, spacing=10, ax=0.5, ay=0.5))
    tbtn = row.child(button('Title', '回标题', 92, 42, kind='quiet', ic='back', size=12))
    sbtn = row.child(button('Story', '熟客的话', 112, 42, kind='ceramic', ic='heart', size=13))
    dbtn = row.child(button('Decor', '布置', 92, 42, kind='ceramic', ic='lamp', size=13))
    nbtn = row.child(button('Next', '歇一晚，明早开张', 196, 46, kind='jade', ic='sun', size=14, text_font=DISPLAY, bold=True))
    share = c.child(button('Share', '留下这张', 104, 32, pos=(226, 268, 0), kind='quiet', ic='image', size=12, icon_size=15))
    # 中间：粥谱熟练（文档 10 §7 打烊页三列：今日账、粥谱熟练、可购买）
    sk = n.child(ceramic('Skill', 290, 560, pos=(105, 0, 0), radius=20, edge=6))
    sk.child(label('Eyebrow', '厨 艺 · 越 熬 越 顺 手', 11, '#A48451', 260, 18, pos=(0, 250, 0)))
    sk.child(label('Title', '粥谱熟练', 22, INK, 260, 30, pos=(0, 222, 0), font=DISPLAY, bold=True, spacing=3))
    slist = sk.child(list_node('List', 256, 360, (0, 192, 0), spacing=8))
    sempty = sk.child(label('Empty', '今天没有出餐，熟练没变。', 12, '#8D7A59', 250, 20, pos=(0, 150, 0)))
    snote = sk.child(label('Note', '', 11, '#6E7A5E', 256, 76, pos=(0, -226, 0), overflow=2))
    up = n.child(ceramic('Upgrades', 370, 560, pos=(445, 0, 0), radius=20, edge=6))
    up.child(label('Eyebrow', '添 置 · 明 日 生 效', 11, '#A48451', 300, 18, pos=(0, 250, 0)))
    up.child(label('Title', '明日添置', 22, INK, 300, 30, pos=(0, 222, 0), font=DISPLAY, bold=True, spacing=3))
    ulist = up.child(list_node('List', 340, 440, (0, 192, 0), spacing=8))
    uempty = up.child(label('Empty', '能添的都添齐了。', 12, '#8D7A59', 330, 20, pos=(0, 120, 0)))
    # 右栏下方：请托、手账、章节进度（文档 30）
    unote = up.child(label('LongNote', '', 11, '#6E7A5E', 330, 120, pos=(0, -205, 0), overflow=2))
    n.add(C(cls('ReportPanel'), eyebrow=eye.get('cc.Label'), title=title.get('cc.Label'), intro=intro.get('cc.Label'),
            stars=[s.get(cls('UiIcon')) for s in stars], rows=rows, billRowPrefab=prefab_ref('prefabs/ui/parts/BillRow'),
            totalLabel=tl.get('cc.Label'), totalValue=tv.get('cc.Label'), footnote=foot.get('cc.Label'),
            upgradeList=ulist, rowPrefab=prefab_ref('prefabs/ui/parts/ListRowNarrow'), upgradeEmpty=uempty.get('cc.Label'),
            nextButton=nbtn.get(cls('UiButton')), decorButton=dbtn.get(cls('UiButton')), storyButton=sbtn.get(cls('UiButton')),
            titleButton=tbtn.get(cls('UiButton')), shareButton=share.get(cls('UiButton')),
            skillList=slist, skillRowPrefab=prefab_ref('prefabs/ui/parts/SkillRow'), skillEmpty=sempty.get('cc.Label'), skillNote=snote.get('cc.Label'),
            longNote=unote.get('cc.Label')))
    return n

def decor_panel():
    n = modal_root('DecorPanel')
    c = n.child(ceramic('Card', 1000, 620, radius=23, edge=8))
    c.child(label('Eyebrow', '摆 一 件 · 暖 一 角', 11, '#A48451', 400, 18, pos=(0, 284, 0)))
    header = c.child(label('Header', '装修', 22, INK, 900, 32, pos=(0, 256, 0), font=DISPLAY, bold=True, spacing=3, overflow=2, wrap=False))
    atmo = c.child(label('Atmosphere', '', 12, '#8D7A59', 900, 50, pos=(0, 212, 0), overflow=2))
    tabs = c.child(list_node('Tabs', 900, 40, (0, 166, 0), kind=1, spacing=8, ax=0.5, ay=0.5))
    items = c.child(list_node('Items', 560, 400, (0, 134, 0), spacing=8))
    close = c.child(button('Close', '完成', 160, 46, pos=(0, -264, 0), kind='jade', ic='check', size=15))
    n.add(C(cls('DecorPanel'), header=header.get('cc.Label'), atmosphere=atmo.get('cc.Label'), tabList=tabs, itemList=items,
            tabPrefab=prefab_ref('prefabs/ui/parts/TabButton'), rowPrefab=prefab_ref('prefabs/ui/parts/ListRow'), closeButton=close.get(cls('UiButton'))))
    return n
save_prefab('prefabs/ui/parts/TabButton', button('TabButton', '窗边', 100, 36, kind='tab', size=13))

def story_panel():
    n = screen_root('StoryPanel', dim=(DIM, 120), block=True)
    c = n.child(ceramic('Card', 780, 270, pos=(0, -196, 0), radius=22, edge=6))
    who = c.child(label('Speaker', '街坊', 18, '#A48451', 700, 26, pos=(-360, 104, 0), align=0, ax=0, font=DISPLAY, bold=True, spacing=3))
    line = c.child(label('Line', '', 20, INK, 720, 100, pos=(0, 24, 0), align=0, overflow=1, font=DISPLAY))
    reward = c.child(label('Reward', '', 13, '#3E6B53', 720, 22, pos=(0, -54, 0), align=0))
    skip = c.child(button('Skip', '跳过', 100, 42, pos=(206, -100, 0), kind='quiet', size=13))
    nxt = c.child(button('Next', '接着听', 150, 46, pos=(330, -100, 0), kind='jade', size=14))
    n.add(C(cls('StoryPanel'), speaker=who.get('cc.Label'), line=line.get('cc.Label'), reward=reward.get('cc.Label'),
            nextButton=nxt.get(cls('UiButton')), skipButton=skip.get(cls('UiButton'))))
    return n

def settings_panel():
    n = modal_root('SettingsPanel')
    c = n.child(ceramic('Card', 470, 600, radius=23, edge=8))
    dialog_head(c, 300, '暂 停 一 下', '菜单', None)
    info = c.child(label('Info', '', 12, '#8D7A59', 420, 36, pos=(0, 204, 0), overflow=2))
    col = c.child(list_node('Buttons', 400, 400, (0, 180, 0), spacing=7))
    names = [('Music', '音乐', 'gear'), ('Pot', '锅声', 'pot'), ('Ambience', '街上的声音', 'heart'), ('Text', '放大重要文字', 'book'),
             ('Motion', '减少动效', 'leaf'), ('Tutorial', '重看教学', 'star'), ('Title', '回到标题', 'back')]
    btns = {k: col.child(button(k, t, 400, 44, kind='menu', ic=ic, size=14, sub=True, sub_pos='right', align_left=True)) for k, t, ic in names}
    close = c.child(button('Close', '继续', 400, 50, pos=(0, -244, 0), kind='jade', ic='door', size=15, text_font=DISPLAY, bold=True))
    n.add(C(cls('SettingsPanel'), info=info.get('cc.Label'), musicButton=btns['Music'].get(cls('UiButton')), potButton=btns['Pot'].get(cls('UiButton')),
            ambienceButton=btns['Ambience'].get(cls('UiButton')), textButton=btns['Text'].get(cls('UiButton')),
            motionButton=btns['Motion'].get(cls('UiButton')), tutorialButton=btns['Tutorial'].get(cls('UiButton')),
            titleButton=btns['Title'].get(cls('UiButton')), closeButton=close.get(cls('UiButton'))))
    return n

def practice_panel():
    n = modal_root('PracticePanel')
    c = n.child(ceramic('Card', 700, 600, radius=23, edge=8))
    dialog_head(c, 300, '不 计 铜 钱', '练练手', None)
    header = c.child(label('Header', '练习', 12, '#8D7A59', 640, 22, pos=(0, 204, 0), overflow=2))
    lst_view, lst = scroll_list('List', 560, 420, (0, 182, 0), spacing=3)
    c.child(lst_view)
    close = c.child(button('Close', '返回', 160, 44, pos=(0, -256, 0), kind='quiet', ic='back', size=14))
    n.add(C(cls('PracticePanel'), header=header.get('cc.Label'), list=lst, rowPrefab=prefab_ref('prefabs/ui/parts/ListRowCompact'),
            closeButton=close.get(cls('UiButton'))))
    return n

def recipe_book_panel():
    n = modal_root('RecipeBookPanel')
    c = n.child(ceramic('Card', 780, 600, radius=23, edge=8))
    _, title, intro = dialog_head(c, 300, '一 碗 一 味 · 慢 慢 点 亮', '小店粥谱', '', 700)
    close = c.child(close_button((352, 262, 0)))
    tabs = c.child(list_node('Tabs', 256, 32, (-354, 262, 0), kind=1, spacing=8, ax=0, ay=0.5))
    t1 = tabs.child(button('RecipesTab', '粥谱', 78, 30, kind='tab', ic='book', size=12, icon_size=14))
    t2 = tabs.child(button('GuestsTab', '街坊', 78, 30, kind='tab', ic='heart', size=12, icon_size=14))
    t3 = tabs.child(button('NotebookTab', '手账', 78, 30, kind='tab', ic='star', size=12, icon_size=14))
    grid = c.child(list_node('Grid', 708, 410, (0, 182, 0), kind=3, spacing=10, cols=4, cell=(168, 124)))
    ggrid = c.child(list_node('GuestGrid', 708, 410, (0, 182, 0), kind=3, spacing=10, cols=4, cell=(168, 196)))
    ggrid.active = False
    # 小店手账：27 页，4 列 7 行
    ngrid = c.child(list_node('NotebookGrid', 708, 410, (0, 182, 0), kind=3, spacing=6, cols=4, cell=(168, 52)))
    ngrid.active = False
    foot = c.child(label('Foot', '', 11, '#8A7858', 700, 18, pos=(0, -270, 0)))
    n.add(C(cls('RecipeBookPanel'), title=title.get('cc.Label'), intro=intro.get('cc.Label'), recipesTab=t1.get(cls('UiButton')),
            guestsTab=t2.get(cls('UiButton')), grid=grid, tilePrefab=prefab_ref('prefabs/ui/parts/RecipeTile'),
            guestGrid=ggrid, guestTilePrefab=prefab_ref('prefabs/ui/parts/GuestTile'),
            notebookTab=t3.get(cls('UiButton')), notebookGrid=ngrid, milestoneTilePrefab=prefab_ref('prefabs/ui/parts/MilestoneTile'),
            foot=foot.get('cc.Label'), closeButton=close.get(cls('UiButton'))))
    return n

def light_panel():
    n = modal_root('LightPanel')
    c = n.child(ceramic('Card', 600, 440, radius=23, edge=8))
    dialog_head(c, 220, '点 一 盏 灯 · 暖 一 间 铺', '小店的光', '试试三种灯光气氛，感受同一间小店的不同温度。')
    close = c.child(close_button((262, 182, 0)))
    def choice(name, text, ic, x, col, fill):
        b = button(name, text, 168, 160, pos=(x, -10, 0), kind='choice', size=16, sub=True, radius=15, text_font=DISPLAY, bold=True)
        b.children = [ch for ch in b.children if ch.name != 'Content']
        ico = b.child(icon('Icon', ic, 40, col, fill=fill, pos=(0, 30, 0)))
        lab = b.child(label('Label', text, 16, '#5F513A', 150, 24, pos=(0, -16, 0), font=DISPLAY, bold=True, spacing=2))
        sub = next(ch for ch in b.children if ch.name == 'Sub')
        sub.pos = (0, -42, 0)
        u = b.get(cls('UiButton'))
        u.fields['label'] = lab.get('cc.Label')
        u.fields['icon'] = None
        return b
    warm = c.child(choice('Warm', '暖木', 'lamp', -182, '#A3783A', '#EAD09B'))
    night = c.child(choice('Night', '夜蓝', 'moon', 0, '#365964', '#799995'))
    morning = c.child(choice('Morning', '晨白', 'sun', 182, '#AE9160', '#F3E7C2'))
    foot = c.child(label('Foot', '', 11, '#8A7858', 520, 36, pos=(0, -122, 0), overflow=2))
    deco = c.child(button('Decor', '去装修 · 添置摆件', 200, 42, pos=(0, -172, 0), kind='ceramic', ic='lamp', size=13))
    n.add(C(cls('LightPanel'), warmButton=warm.get(cls('UiButton')), nightButton=night.get(cls('UiButton')),
            morningButton=morning.get(cls('UiButton')), foot=foot.get('cc.Label'), decorButton=deco.get(cls('UiButton')),
            closeButton=close.get(cls('UiButton'))))
    return n

save_prefab('prefabs/ui/HudView', hud())
save_prefab('prefabs/ui/ReportPanel', report_panel())
save_prefab('prefabs/ui/DecorPanel', decor_panel())
save_prefab('prefabs/ui/StoryPanel', story_panel())
save_prefab('prefabs/ui/SettingsPanel', settings_panel())
save_prefab('prefabs/ui/PracticePanel', practice_panel())
save_prefab('prefabs/ui/RecipeBookPanel', recipe_book_panel())
save_prefab('prefabs/ui/LightPanel', light_panel())

def chapter_panel():
    n = modal_root('ChapterPanel')
    c = n.child(ceramic('Card', 640, 600, radius=23, edge=8))
    eyebrow = c.child(label('Eyebrow', '第 一 章 · 七 日 开 张', 11, '#A48451', 400, 18, pos=(0, 272, 0)))
    title = c.child(label('Title', '一碗招牌，立住了铺子', 26, INK, 580, 38, pos=(0, 242, 0), font=DISPLAY, bold=True, spacing=3))
    intro = c.child(label('Intro', '', 12, '#8D7A59', 560, 20, pos=(0, 212, 0)))
    days = c.child(list_node('Days', 540, 250, (0, 192, 0), spacing=2))
    c.child(box('Rule', 540, 1, '#BDAB89', pos=(0, -58, 0), radius=0))
    seal = c.child(icon('Seal', 'star', 34, '#D4AA5B', fill='#D4AA5B', pos=(-246, -92, 0), lw=1.2))
    sig = c.child(label('Signature', '', 14, '#395E48', 470, 40, pos=(-218, -92, 0), align=0, ax=0, overflow=2, font=DISPLAY))
    stats = c.child(label('Stats', '', 12, '#7E6B4D', 540, 18, pos=(0, -138, 0)))
    endless = c.child(label('Endless', '', 12, '#8A7858', 520, 40, pos=(0, -180, 0), overflow=2))
    close = c.child(button('Close', '接着经营', 220, 48, pos=(0, -240, 0), kind='jade', ic='door', size=15, text_font=DISPLAY, bold=True))
    n.add(C(cls('ChapterPanel'), eyebrow=eyebrow.get('cc.Label'), title=title.get('cc.Label'), intro=intro.get('cc.Label'), dayList=days,
            rowPrefab=prefab_ref('prefabs/ui/parts/BillRow'), seal=seal.get(cls('UiIcon')), signature=sig.get('cc.Label'),
            stats=stats.get('cc.Label'), endless=endless.get('cc.Label'), closeButton=close.get(cls('UiButton'))))
    return n
save_prefab('prefabs/ui/ChapterPanel', chapter_panel())

# ───────────── 3D 预制体 ─────────────
def mesh(name, kind, pos=(0, 0, 0), scale=(1, 1, 1), euler=(0, 0, 0), tint=None, mat=None, shadow=True):
    comps = [C('cc.MeshRenderer', _materials=[asset_ref(mat or MAT_MATTE, 'cc.Material')], _mesh=asset_ref(MESH[kind], 'cc.Mesh'),
               _shadowCastingMode=1 if shadow else 0, _shadowReceivingMode=1)]
    n = N(name, pos=pos, euler=euler, scale=scale, layer=DEFAULT_LAYER, comps=comps)
    if tint:
        n.add(C(cls('Tint'), color=color(*tint) if isinstance(tint, tuple) else color(tint)))
    return n

def model(name, key, pos=(0, 0, 0), scale=(1, 1, 1), euler=(0, 0, 0), placeholder=None, hide=None):
    n = N(name, pos=pos, euler=euler, layer=DEFAULT_LAYER)
    ph = n.child(placeholder) if placeholder else None
    n.add(C(cls('ModelSlot'), model=asset_ref(MODEL[key], 'cc.Prefab'), placeholder=ph, offset=vec3(0, 0, 0), scale=vec3(*scale), hide=hide or []))
    return n

def group(name, pos=(0, 0, 0), children=None, euler=(0, 0, 0), scale=(1, 1, 1)):
    return N(name, pos=pos, euler=euler, scale=scale, layer=DEFAULT_LAYER, children=children or [])

def steam(n_puffs=24):
    g = group('Steam', pos=(0, 0.5, 0))
    for i in range(n_puffs):
        g.child(mesh(f'Puff{i}', 'sphere', scale=(0.1, 0.1, 0.1), mat=MAT_STEAM, shadow=False))
    g.add(C(cls('SteamPuffs'), rise=0.95, life=1.7, startScale=0.05, endScale=0.24, tone=color('#FFFAF0', 30)))
    return g

POT_X = [-1.95, -0.65, 0.65, 1.95]
POT_Z = -2.05
COUNTER_H = 0.82
POT_Y = COUNTER_H + 0.36
def pot_node(i):
    """一口锅：陶土炭炉 + 黑砂锅（设计稿：黑砂锅、陶土炭炉，没有蓝色燃气火）。"""
    root = group(f'Pot{i + 1}', pos=(POT_X[i], POT_Y, POT_Z), scale=(0.9, 0.9, 0.9))
    base = root.child(mesh('StoveBase', 'cylinder', pos=(0, -0.2, 0), scale=(1.12, 0.2, 1.0), tint='#D8BE98'))
    for k, y in enumerate((-0.31, -0.19, -0.07)):
        root.child(mesh(f'Brick{k}', 'cylinder', pos=(0, y, 0), scale=(1.135, 0.006, 1.015), tint='#A88664', shadow=False))
    root.child(mesh('Rim', 'cylinder', pos=(0, 0.0, 0), scale=(1.0, 0.02, 0.9), tint='#5E4636'))
    mouth = root.child(mesh('Mouth', 'box', pos=(0, -0.24, 0.47), scale=(0.34, 0.16, 0.06), mat=MAT_GLOW, tint='#FF8A3A', shadow=False))
    body = root.child(group('Body'))
    body.child(model('Model', 'pot', pos=(0, 0.02, 0), placeholder=mesh('Placeholder', 'cylinder', pos=(0, 0.2, 0), scale=(1.0, 0.2, 0.8), tint='#232120')))
    # 粥面：盖在锅口上（锅体模型是封口的，粥面要略高于锅沿）
    soup = root.child(mesh('Soup', 'cylinder', pos=(0, 0.565, 0), scale=(0.7, 0.01, 0.7), mat=MAT_SOUP, tint='#E4DDCF', shadow=False))
    garnish = root.child(group('Garnish', pos=(0, 0.578, 0)))
    import random as _r
    rnd = _r.Random(7 + i)
    for k in range(14):
        a = rnd.random() * math.pi * 2
        rr_ = 0.06 + rnd.random() * 0.22
        long_ = k % 2 == 0
        garnish.child(mesh(f'G{k}', 'box' if long_ else 'sphere', pos=(math.cos(a) * rr_, 0.0, math.sin(a) * rr_),
                           euler=(0, rnd.random() * 180, 0), scale=(0.16, 0.014, 0.035) if long_ else (0.06, 0.016, 0.05), mat=MAT_GARNISH, tint='#E8D2A8', shadow=False))
    flame = root.child(group('Flame', pos=(0, -0.3, 0.44)))
    for j, x in enumerate([-0.1, 0, 0.1]):
        flame.child(mesh(f'Tongue{j}', 'cone', pos=(x, 0.05, 0), scale=(0.08, 0.12, 0.08), mat=MAT_GLOW, tint='#FFB040', shadow=False))
    st = root.child(steam())
    st.pos = (0, 0.6, 0)
    # 提醒圈：锅沿内侧一圈细小光点（该搅了亮暖黄，快糊了变砖红），PotView 让它呼吸闪动
    ring = root.child(group('Ring', pos=(0, 0.6, 0)))
    for k in range(36):
        a = k / 36 * math.pi * 2
        ring.child(mesh(f'Bead{k}', 'sphere', pos=(math.cos(a) * 0.362, 0, math.sin(a) * 0.362), scale=(0.024, 0.014, 0.024), mat=MAT_GLOW, tint='#E39B3A', shadow=False))
    ring.active = False
    focus = root.child(mesh('FocusMark', 'cylinder', pos=(0, -0.395, 0), scale=(1.3, 0.004, 1.18), mat=MAT_GLOW, tint='#FFD27A', shadow=False))
    locked = root.child(group('LockedCover'))
    locked.child(mesh('Lid', 'cylinder', pos=(0, 0.05, 0), scale=(0.95, 0.03, 0.85), tint='#8E7B6C'))
    locked.child(mesh('Tag', 'box', pos=(0, 0.12, 0.3), scale=(0.3, 0.1, 0.02), tint='#D9C8B2'))
    root.add(C(cls('PotView'), body=body, pickRenderer=base.get('cc.MeshRenderer'), soup=soup, soupRenderer=soup.get('cc.MeshRenderer'),
               flame=flame, steam=st.get(cls('SteamPuffs')), ring=ring, ringRenderer=ring.children[0].get('cc.MeshRenderer'), focusMark=focus,
               lockedCover=locked, addedGarnish=garnish))
    return root

SEAT_POS = [(-3.0, 2.55), (-1.9, 2.55), (-0.6, 2.55), (0.5, 2.55), (1.8, 2.55), (2.9, 2.55)]
FRONT_Z = 0.55           # 出餐长台中线
FRONT_H = 1.0
TRAY_X = [-1.5, 0.0, 1.5]
STYLE = {'warm-wood': ('#C98B55', '#E7D3B0', '#E39B3A'), 'night-blue': ('#35466A', '#243044', '#C48A4A'), 'morning-white': ('#DCD6CA', '#E6E2DA', '#8FA6A0')}

def decor_variants():
    """按 decor.json 生成各槽位的主件与小物（灰盒级，等 Blender 正式件替换）。"""
    decor = json.load(open(os.path.join(PROJECT, 'assets/resources/data/rules/decor.json'), encoding='utf-8'))
    slots = {}
    anchors = {'door': (4.25, 0, 1.3), 'hall': (0, 0, 2.4), 'counter': (-0.2, FRONT_H, FRONT_Z), 'kitchen': (0, 0, POT_Z), 'window': (-3.98, 0, -1.3)}
    for s, p in anchors.items():
        slots[s] = group(f'Slot_{s}', pos=p, euler=(0, 90, 0) if s == 'door' else (0, 0, 0))
        slots[s].mains = slots[s].child(group('Mains'))
        slots[s].smalls = slots[s].child(group('Smalls'))
        slots[s].bare = slots[s].child(group('Bare'))
    wx, wy, wz = anchors['window']
    lamp_spots = [(SEAT_POS[k][0] - wx, 0.77, SEAT_POS[k][1] - 0.5 - wz) for k in (0, 2, 4)]
    for d in decor:
        if d['kind'] == 'tableware':
            continue
        body, trim, accent = STYLE.get(d['style'], ('#9A8A7A', '#D9C8B2', '#E39B3A'))
        slot = d['slot']
        v = group(d['id'])
        name = d['mesh']
        if d['kind'] == 'main':
            if slot == 'window':
                if 'Paper' in name:
                    for k, (x, y, z) in enumerate(lamp_spots):
                        v.child(model(f'Lamp{k}', 'lamp_paper', pos=(x, y, z), scale=(0.45, 0.45, 0.45), placeholder=mesh('Ph', 'sphere', scale=(0.22, 0.28, 0.22), tint='#F3D9A6')))
                elif 'Brass' in name:
                    for k, (x, y, z) in enumerate(lamp_spots):
                        v.child(mesh(f'Lamp{k}', 'cone', pos=(x, y + 0.3, z), scale=(0.22, 0.2, 0.22), euler=(180, 0, 0), tint=accent))
                        v.child(mesh(f'Stem{k}', 'cylinder', pos=(x, y + 0.1, z), scale=(0.03, 0.1, 0.03), tint=trim))
                else:
                    v.child(mesh('Window', 'box', pos=(0.06, 1.75, 0), scale=(0.04, 1.0, 1.5), mat=MAT_GLOW, tint='#FFE2A8', shadow=False))
                    v.child(mesh('Frame', 'box', pos=(0.08, 1.75, 0), scale=(0.06, 1.1, 1.6), tint=trim))
                lum = 260 if 'Window' in name else 380
                v.child(N('Light', pos=(lamp_spots[1][0], 1.5, lamp_spots[1][2]), layer=DEFAULT_LAYER, comps=[C('cc.SphereLight', _color=color(accent if 'Brass' in name else '#FFC98A'),
                                  _luminanceHDR=lum, _luminance=lum, _range=3.4, _size=0.15)]))
            elif slot == 'door':
                v.child(mesh('Curtain', 'box', pos=(0, 1.65, 0), scale=(1.1, 0.7, 0.04), tint=body))
                v.child(mesh('Rod', 'box', pos=(0, 2.02, 0), scale=(1.2, 0.04, 0.05), tint=trim))
            elif slot == 'hall':
                v.child(mesh('Rug', 'box', pos=(0, 0.006, 0.1), scale=(7.0, 0.012, 1.6), tint=body, shadow=False))
                v.child(mesh('Bench', 'box', pos=(0, 0.95, -1.12), scale=(6.6, 0.05, 0.22), tint=accent))
            elif slot == 'counter':
                v.child(mesh('Top', 'box', pos=(0, 0.03, 0), scale=(6.9, 0.05, 0.66), tint=body))
                v.child(mesh('Edge', 'box', pos=(0, -0.28, 0.34), scale=(6.9, 0.44, 0.03), tint=trim))
            elif slot == 'kitchen':
                v.child(mesh('Backsplash', 'box', pos=(0, 1.45, -0.86), scale=(7.6, 0.5, 0.04), tint=trim))
                v.child(mesh('Hood', 'box', pos=(0, 2.55, -0.55), scale=(5.0, 0.16, 0.6), tint=body))
            slots[slot].mains.child(v)
        else:
            offs = {'window': (0.3, 0.84, 1.9), 'counter': (2.9, 0.0, 0.1), 'door': (-0.7, 1.95, 0), 'hall': (3.6, 0.0, -0.6)}
            ox, oy, oz = offs.get(slot, (0, 0, 0))
            v.pos = (ox, oy, oz)
            v.child(mesh('Pot', 'cylinder', pos=(0, 0.12, 0), scale=(0.24, 0.12, 0.24), tint=trim))
            v.child(mesh('Top', 'sphere', pos=(0, 0.36, 0), scale=(0.32, 0.3, 0.32), tint=accent if 'Chime' in name or 'Board' in name else '#6F9A52'))
            slots[slot].smalls.child(v)
    slots['door'].bare.child(mesh('Plain', 'box', pos=(0, 2.02, 0), scale=(1.2, 0.04, 0.05), tint='#5A3A26'))
    slots['window'].bare.child(mesh('PlainWindow', 'box', pos=(0.08, 1.75, 0), scale=(0.05, 0.9, 1.3), tint='#2E4448'))
    slots['window'].bare.child(mesh('PlainFrame', 'box', pos=(0.09, 1.75, 0), scale=(0.05, 1.0, 1.4), tint='#5A3A26'))
    out = []
    for s, g in slots.items():
        g.add(C(cls('DecorSlotView'), slotId=s, mains=g.mains, smalls=g.smalls, bare=g.bare))
        out.append(g)
    return out

def guest_prefab():
    root = group('Guest')
    body = root.child(group('Body'))
    ph = group('Placeholder')
    cloth = ph.child(mesh('Cloth', 'capsule', pos=(0, 0.75, 0), scale=(0.42, 0.55, 0.32), tint='#A87A56'))
    ph.child(mesh('Head', 'sphere', pos=(0, 1.5, 0), scale=(0.28, 0.3, 0.28), tint='#E9C9A8'))
    body.child(model('Model', 'guest', scale=(0.95, 0.95, 0.95), euler=(0, 0, 0), placeholder=ph))
    hat = body.child(mesh('Hat', 'cylinder', pos=(0, 1.72, 0), scale=(0.34, 0.06, 0.34), tint='#2F2B33'))
    hat.active = False
    bowl = root.child(model('Bowl', 'bowl', pos=(0, 0.79, -0.5), scale=(0.35, 0.35, 0.35), placeholder=mesh('Ph', 'cylinder', scale=(0.2, 0.05, 0.2), tint='#F3E2C4')))
    bowl.active = False
    root.add(C(cls('GuestView'), body=body, tintRenderers=[cloth.get('cc.MeshRenderer')], bowl=bowl, critHat=hat, speed=1.6))
    return root
save_prefab('prefabs/stage/Guest', guest_prefab())

def wall(name, length, axis, pos, height=3.0, tile_h=1.15):
    """一面墙：下半截青绿砖（带砖缝），上半截米白灰泥，顶上一根深木梁。axis 'x' 沿 X 方向，'z' 沿 Z 方向。"""
    g = group(name, pos=pos)
    sx = lambda w: (w, 1, 0.12) if axis == 'x' else (0.12, 1, w)
    def S(w, h, t=0.12):
        return (w, h, t) if axis == 'x' else (t, h, w)
    g.child(mesh('Tile', 'box', pos=(0, tile_h / 2, 0), scale=S(length, tile_h, 0.13), tint='#3E6A5A'))
    for k in range(1, 6):
        g.child(mesh(f'Grout{k}', 'box', pos=(0, tile_h * k / 6, 0), scale=S(length + 0.002, 0.012, 0.135), tint='#6F9585', shadow=False))
    g.child(mesh('Cap', 'box', pos=(0, tile_h + 0.025, 0), scale=S(length, 0.05, 0.16), tint='#5A3A26'))
    g.child(mesh('Plaster', 'box', pos=(0, tile_h + (height - tile_h) / 2, 0), scale=S(length, height - tile_h, 0.11), tint='#EADFC8'))
    g.child(mesh('Beam', 'box', pos=(0, height + 0.09, 0), scale=S(length + 0.3, 0.18, 0.24), tint='#5A3A26'))
    return g

def post(name, pos, height=3.2):
    g = group(name, pos=pos)
    g.child(mesh('Post', 'box', pos=(0, height / 2, 0), scale=(0.26, height, 0.26), tint='#5E3C27'))
    g.child(mesh('Cap', 'box', pos=(0, height + 0.06, 0), scale=(0.34, 0.12, 0.34), tint='#4A2E1F'))
    g.child(mesh('Foot', 'box', pos=(0, 0.06, 0), scale=(0.34, 0.12, 0.34), tint='#4A2E1F'))
    return g

def lantern(name, pos, lum=520):
    g = group(name, pos=pos)
    g.child(mesh('Arm', 'box', pos=(0.0, 0.42, 0), scale=(0.04, 0.04, 0.32), tint='#3A2A20'))
    g.child(model('Lamp', 'lamp_paper', pos=(0, 0, 0.18), scale=(0.5, 0.5, 0.5),
                  placeholder=mesh('Ph', 'sphere', pos=(0, 0.1, 0), scale=(0.26, 0.34, 0.26), mat=MAT_GLOW, tint='#FFD9A0')))
    g.child(N('Light', pos=(0, 0.1, 0.3), layer=DEFAULT_LAYER, comps=[C('cc.SphereLight', _color=color('#FFBE74'), _luminanceHDR=lum,
                                                                         _luminance=lum, _range=3.6, _size=0.12)]))
    return g

def plant(name, pos, s=1.0):
    g = group(name, pos=pos, scale=(s, s, s))
    g.child(mesh('Pot', 'cylinder', pos=(0, 0.18, 0), scale=(0.34, 0.18, 0.34), tint='#7A5236'))
    g.child(mesh('Leaf0', 'sphere', pos=(0, 0.55, 0), scale=(0.5, 0.45, 0.5), tint='#4E7A44'))
    g.child(mesh('Leaf1', 'sphere', pos=(0.14, 0.75, 0.05), scale=(0.34, 0.34, 0.34), tint='#5F8C4E'))
    g.child(mesh('Leaf2', 'sphere', pos=(-0.12, 0.72, -0.06), scale=(0.3, 0.3, 0.3), tint='#46703E'))
    return g

def sign_text(text, pos, size=96, col='#E9B867', scale=0.0062):
    """立体招牌上的字：RenderRoot2D 让 Label 画在 3D 空间里，不需要贴图。"""
    root = N('SignText', pos=pos, scale=(scale, scale, scale), layer=DEFAULT_LAYER, comps=[ui_transform(520, 140), C('cc.RenderRoot2D')])
    lab = label('Label', text, size, col, 520, 140, font=DISPLAY, bold=True, spacing=24)
    lab.layer = DEFAULT_LAYER
    root.child(lab)
    return root

def store_prefab():
    root = group('Store')
    # 街面：深灰石板地，铺子坐在上面（设计稿：店铺切面，省去屋顶和前墙）
    street = root.child(group('Street'))
    street.child(mesh('Base', 'box', pos=(0, -0.2, 0.6), scale=(13.0, 0.36, 10.5), tint='#3C3F44'))
    for ix in range(-6, 7):
        for iz in range(-4, 7):
            if -4 <= ix <= 4 and -3 <= iz <= 0:
                continue
            t = '#55585C' if (ix + iz) % 2 == 0 else '#4C4F54'
            street.child(mesh(f'T{ix}_{iz}', 'box', pos=(ix * 1.0, -0.005, iz * 1.0 + 0.5), scale=(0.94, 0.03, 0.94), tint=t, shadow=False))
    # 店内木地板
    root.child(mesh('Floor', 'box', pos=(0, 0.0, -1.2), scale=(8.2, 0.06, 3.9), tint='#6B4A35'))
    # 墙与柱
    root.child(wall('BackWall', 8.3, 'x', (0, 0, -3.12)))
    root.child(wall('LeftWall', 4.2, 'z', (-4.12, 0, -1.08)))
    root.child(wall('RightWall', 4.2, 'z', (4.12, 0, -1.08)))
    for nm, p in (('PostBL', (-4.12, 0, -3.12)), ('PostBR', (4.12, 0, -3.12)), ('PostFL', (-4.12, 0, 0.95)), ('PostFR', (4.12, 0, 0.95))):
        root.child(post(nm, p))
    root.child(lantern('LanternL', (-4.12, 1.75, 1.08)))
    root.child(lantern('LanternR', (4.12, 1.75, 1.08)))
    # 招牌
    sign = root.child(group('Sign', pos=(0.5, 2.45, -3.02)))
    sign.child(mesh('Board', 'box', scale=(3.3, 0.82, 0.08), tint='#4A2E1F'))
    sign.child(mesh('Frame', 'box', pos=(0, 0, -0.01), scale=(3.45, 0.96, 0.06), tint='#7A5236'))
    sign.child(sign_text('粥霸天', (0.25, 0, 0.05)))
    bowl_icon = sign.child(group('Icon', pos=(-1.15, 0, 0.06)))
    bowl_icon.child(mesh('Bowl', 'sphere', pos=(0, -0.06, 0), scale=(0.42, 0.24, 0.05), mat=MAT_GLOW, tint='#E9B867', shadow=False))
    bowl_icon.child(mesh('Rim', 'box', pos=(0, 0.06, 0), scale=(0.46, 0.03, 0.05), mat=MAT_GLOW, tint='#E9B867', shadow=False))
    for k, x in enumerate((-2.3, 2.6)):
        lamp = root.child(group(f'WallLamp{k}', pos=(x, 2.55, -2.95)))
        lamp.child(mesh('Arm', 'box', pos=(0, 0.08, 0.08), scale=(0.03, 0.03, 0.18), tint='#1E1C1B'))
        lamp.child(mesh('Shade', 'sphere', pos=(0, 0, 0.18), scale=(0.24, 0.16, 0.24), tint='#1E1C1B'))
        lamp.child(mesh('Bulb', 'sphere', pos=(0, -0.08, 0.16), scale=(0.1, 0.1, 0.1), mat=MAT_GLOW, tint='#FFD58A', shadow=False))
        lamp.child(N('Light', pos=(0, -0.2, 0.4), layer=DEFAULT_LAYER, comps=[C('cc.SphereLight', _color=color('#FFC27A'), _luminanceHDR=360,
                                                                               _luminance=360, _range=3.2, _size=0.1)]))
    # 后厨长台：浅色台面、金属柜门
    back = root.child(group('BackCounter', pos=(0, 0, POT_Z)))
    back.child(mesh('Body', 'box', pos=(0, COUNTER_H / 2, 0), scale=(8.0, COUNTER_H, 0.95), tint='#8E8D88'))
    back.child(mesh('Top', 'box', pos=(0, COUNTER_H + 0.025, 0.02), scale=(8.05, 0.05, 1.0), tint='#E6DCC8'))
    for k in range(8):
        back.child(mesh(f'Door{k}', 'box', pos=(-3.5 + k * 1.0, COUNTER_H / 2 - 0.02, 0.48), scale=(0.9, COUNTER_H - 0.18, 0.02), tint='#A9A8A2'))
        back.child(mesh(f'Handle{k}', 'box', pos=(-3.5 + k * 1.0, COUNTER_H - 0.18, 0.5), scale=(0.4, 0.025, 0.02), tint='#5A5A58'))
    # 备料角：砧板、一排小料碗、菜筐（左）
    prep = root.child(group('PrepCounter', pos=(-3.2, COUNTER_H + 0.05, POT_Z)))
    prep.child(mesh('Board', 'box', pos=(-0.05, 0.025, -0.15), scale=(0.9, 0.05, 0.5), tint='#C79A63'))
    prep.child(mesh('Knife', 'box', pos=(0.05, 0.06, -0.15), scale=(0.34, 0.01, 0.12), tint='#C9CCCF'))
    for k, col in enumerate(['#6F9A52', '#E3A04A', '#AB795F', '#D9C9A3', '#9A3B34', '#E8D2A8']):
        x, z = -0.35 + (k % 3) * 0.33, 0.22 + (k // 3) * 0.0
        if k >= 3:
            x, z = -0.35 + (k - 3) * 0.33, 0.3
        prep.child(mesh(f'Dish{k}', 'cylinder', pos=(x + 0.05, 0.05, z - 0.05 if k < 3 else z + 0.05), scale=(0.24, 0.05, 0.24), tint='#EFE6D5'))
        prep.child(mesh(f'Fill{k}', 'cylinder', pos=(x + 0.05, 0.1, z - 0.05 if k < 3 else z + 0.05), scale=(0.2, 0.01, 0.2), tint=col, shadow=False))
    # 碗架（右）
    shelf = root.child(group('BowlStack', pos=(3.25, COUNTER_H + 0.05, POT_Z)))
    shelf.child(mesh('Tray', 'box', pos=(0, 0.02, 0.05), scale=(0.95, 0.04, 0.6), tint='#7A5236'))
    for k, (x, z) in enumerate([(-0.24, -0.08), (0.18, -0.08), (-0.04, 0.2)]):
        for j in range(3):
            shelf.child(mesh(f'B{k}_{j}', 'cylinder', pos=(x, 0.08 + j * 0.08, z), scale=(0.3, 0.035, 0.3), tint='#F3EBDD'))
    # 墙上搁架与罐子
    rack = root.child(group('Rack', pos=(-0.3, 1.78, -2.92)))
    rack.child(mesh('Plank', 'box', scale=(6.2, 0.05, 0.3), tint='#6E4A31'))
    for k in range(11):
        h = 0.18 + (k % 3) * 0.05
        rack.child(mesh(f'Jar{k}', 'cylinder', pos=(-2.8 + k * 0.56, 0.03 + h / 2, 0), scale=(0.17, h / 2, 0.17),
                        tint=['#7A4E2E', '#9B6B3C', '#5E5A55', '#B58550'][k % 4]))
    # 出餐长台：木台面 + 青砖底 + 底部一线暖光；三只木托盘（出餐台的三个碗位）
    front = root.child(group('FrontCounter', pos=(-0.2, 0, FRONT_Z)))
    front.child(mesh('Base', 'box', pos=(0, (FRONT_H - 0.06) / 2, 0), scale=(6.9, FRONT_H - 0.06, 0.6), tint='#3E6A5A'))
    for k in range(1, 5):
        front.child(mesh(f'Grout{k}', 'box', pos=(0, k * 0.19, 0.301), scale=(6.9, 0.012, 0.004), tint='#6F9585', shadow=False))
    front.child(mesh('Glow', 'box', pos=(0, 0.06, 0.305), scale=(6.8, 0.03, 0.01), mat=MAT_GLOW, tint='#E7DB8E', shadow=False))
    front.child(mesh('Top', 'box', pos=(0, FRONT_H - 0.03, 0.02), scale=(7.0, 0.06, 0.72), tint='#A06E44'))
    pass_root = root.child(group('PassCounter', pos=(0, FRONT_H, FRONT_Z)))
    pass_bowls = []
    for k, x in enumerate(TRAY_X):
        t = pass_root.child(group(f'Tray{k + 1}', pos=(x, 0.0, 0)))
        t.child(mesh('Board', 'box', pos=(0, 0.015, 0), scale=(1.1, 0.03, 0.5), tint='#7A4E2E'))
        t.child(mesh('Inset', 'box', pos=(0, 0.032, 0), scale=(0.98, 0.006, 0.4), tint='#5E3C27', shadow=False))
        b = t.child(model(f'Bowl{k + 1}', 'bowl', pos=(0, 0.04, 0), scale=(0.4, 0.4, 0.4),
                          placeholder=mesh('Ph', 'cylinder', scale=(0.22, 0.06, 0.22), tint='#F3E2C4')))
        b.active = False
        pass_bowls.append(b)
    # 堂食小桌、绿植、邻家暖窗
    for nm, p, s in (('PlantL', (-4.6, 0, 1.4), 1.0), ('PlantR', (4.6, 0, 1.6), 1.1), ('PlantB', (-3.6, COUNTER_H + 0.05, -2.45), 0.6),
                     ('PlantShelf', (2.6, COUNTER_H + 0.05, -2.5), 0.55)):
        root.child(plant(nm, p, s))
    # 炉口的暖光由 M_Glow 自发光表现，不再额外放点光（会在台面上打出一块白斑）
    pots = [root.child(pot_node(i)) for i in range(4)]
    seats_root = root.child(group('Seats'))
    seats, props, dirty = [], [], []
    for i, (x, z) in enumerate(SEAT_POS):
        a = seats_root.child(group(f'Seat{i + 1}', pos=(x, 0, z)))
        seats.append(a)
        p = seats_root.child(group(f'SeatProp{i + 1}', pos=(x, 0, z)))
        p.child(mesh('Stool', 'cylinder', pos=(0, 0.22, 0), scale=(0.34, 0.22, 0.34), tint='#8A5A36'))
        p.child(mesh('StoolTop', 'cylinder', pos=(0, 0.45, 0), scale=(0.38, 0.02, 0.38), tint='#A06E44'))
        p.child(mesh('Table', 'box', pos=(0, 0.74, -0.5), scale=(0.82, 0.05, 0.56), tint='#A87547'))
        for lx, lz in ((-0.34, -0.72), (0.34, -0.72), (-0.34, -0.28), (0.34, -0.28)):
            p.child(mesh(f'Leg{lx}{lz}', 'box', pos=(lx, 0.36, lz), scale=(0.05, 0.72, 0.05), tint='#6E4A31'))
        p.child(mesh('Chopsticks', 'cylinder', pos=(0.28, 0.85, -0.66), scale=(0.07, 0.09, 0.07), tint='#7A5236'))
        props.append(p)
        d = seats_root.child(group(f'Dirty{i + 1}', pos=(x + 0.16, 0.77, z - 0.5)))
        d.child(mesh('Bowl', 'cylinder', pos=(0, 0.04, 0), scale=(0.24, 0.05, 0.24), tint='#E8DDCB'))
        d.child(mesh('Spoon', 'box', pos=(0.08, 0.1, 0), scale=(0.02, 0.02, 0.16), tint='#D9D2C4'))
        dirty.append(d)
    door = root.child(group('Door', pos=(5.2, 0, 3.0)))
    exit_ = root.child(group('Exit', pos=(6.2, 0, 4.8)))
    guests = root.child(group('Guests'))
    slots = [root.child(s) for s in decor_variants()]
    root.add(C(cls('StoreView'), camera=None, pots=[p.get(cls('PotView')) for p in pots], seatAnchors=seats, seatProps=props,
               dirtyBowls=dirty, doorAnchor=door, exitAnchor=exit_, guestRoot=guests, guestPrefab=prefab_ref('prefabs/stage/Guest'),
               slots=[s.get(cls('DecorSlotView')) for s in slots], passBowls=pass_bowls))
    return root
save_prefab('prefabs/stage/Store', store_prefab())

# ───────────── 场景 ─────────────
def build_scene():
    # 场景全局设置用固定模板（不从旧场景拷贝，避免把损坏的引用带进来）
    V4 = lambda x, y, z, w: {'__type__': 'cc.Vec4', 'x': x, 'y': y, 'z': z, 'w': w}
    globals_objs = [
        {'__type__': 'cc.SceneGlobals', 'ambient': {'__id__': 1}, 'shadows': {'__id__': 2}, '_skybox': {'__id__': 3}, 'fog': {'__id__': 4},
         'octree': {'__id__': 5}, 'skin': {'__id__': 6}, 'lightProbeInfo': {'__id__': 7}, 'postSettings': {'__id__': 8},
         'bakedWithStationaryMainLight': False, 'bakedWithHighpLightmap': False},
        {'__type__': 'cc.AmbientInfo', '_skyColorHDR': V4(0.2, 0.5, 0.8, 0.52), '_skyColor': V4(0.2, 0.5, 0.8, 0.52), '_skyIllumHDR': 20000,
         '_skyIllum': 20000, '_groundAlbedoHDR': V4(0.2, 0.2, 0.2, 1), '_groundAlbedo': V4(0.2, 0.2, 0.2, 1),
         '_skyColorLDR': V4(0.2, 0.5, 0.8, 1), '_skyIllumLDR': 20000, '_groundAlbedoLDR': V4(0.2, 0.2, 0.2, 1)},
        {'__type__': 'cc.ShadowsInfo', '_enabled': False, '_type': 0, '_normal': vec3(0, 1, 0), '_distance': 0, '_planeBias': 1,
         '_shadowColor': color('#000000', 76), '_maxReceived': 4, '_size': {'__type__': 'cc.Vec2', 'x': 1024, 'y': 1024}},
        {'__type__': 'cc.SkyboxInfo', '_envLightingType': 0, '_envmapHDR': None, '_envmap': None, '_envmapLDR': None, '_diffuseMapHDR': None,
         '_diffuseMapLDR': None, '_enabled': False, '_useHDR': True, '_editableMaterial': None, '_reflectionHDR': None, '_reflectionLDR': None, '_rotationAngle': 0},
        {'__type__': 'cc.FogInfo', '_type': 0, '_fogColor': color('#C8C8C8'), '_enabled': False, '_fogDensity': 0.3, '_fogStart': 0.5,
         '_fogEnd': 300, '_fogAtten': 5, '_fogTop': 1.5, '_fogRange': 1.2, '_accurate': False},
        {'__type__': 'cc.OctreeInfo', '_enabled': False, '_minPos': vec3(-1024, -1024, -1024), '_maxPos': vec3(1024, 1024, 1024), '_depth': 8},
        {'__type__': 'cc.SkinInfo', '_enabled': True, '_blurRadius': 0.01, '_sssIntensity': 3},
        {'__type__': 'cc.LightProbeInfo', '_giScale': 1, '_giSamples': 1024, '_bounces': 2, '_reduceRinging': 0, '_showProbe': True,
         '_showWireframe': True, '_showConvex': False, '_data': None, '_lightProbeSphereVolume': 1},
        {'__type__': 'cc.PostSettingsInfo', '_toneMappingType': 0},
    ]
    scene_id = 'e418a392-8939-4acf-b32a-923acdc28bd9'
    root = N('Store', layer=DEFAULT_LAYER)
    cam = root.child(N('Main Camera', pos=(5.2, 7.5, 10.0), euler=(-30, 27.474, 0), layer=DEFAULT_LAYER, comps=[
        C('cc.Camera', _projection=1, _priority=0, _fov=36, _fovAxis=0, _near=0.1, _far=100, _color=color('#172D2E'), _depth=1,
          _stencil=0, _clearFlags=14, _rect={'__type__': 'cc.Rect', 'x': 0, 'y': 0, 'width': 1, 'height': 1}, _visibility=1073741824 | 1 << 23)]))
    light = root.child(N('Main Light', pos=(0, 6, 3), euler=(-52, -38, 0), layer=DEFAULT_LAYER, comps=[
        C('cc.DirectionalLight', _color=color('#FFF1DC'), _illuminanceHDR=16000, _illuminance=16000, _illuminanceLDR=0.42, _shadowEnabled=False)]))
    world = root.child(N('World', layer=DEFAULT_LAYER))
    canvas = root.child(N('Canvas', pos=(640, 360, 0), comps=[ui_transform(1280, 720)]))
    ui_cam = canvas.child(N('UICamera', pos=(0, 0, 1000), layer=DEFAULT_LAYER, comps=[
        C('cc.Camera', _projection=0, _priority=1073741824, _orthoHeight=360, _near=1, _far=2000, _color=color('#000000', 0),
          _depth=1, _stencil=0, _clearFlags=6, _rect={'__type__': 'cc.Rect', 'x': 0, 'y': 0, 'width': 1, 'height': 1}, _visibility=41943040)]))
    canvas.add(C('cc.Canvas', _cameraComponent=ui_cam.get('cc.Camera'), _alignCanvasWithScreen=True))
    canvas.add(widget(FULL))
    touch = canvas.child(N('WorldTouch', comps=[ui_transform(1280, 720), widget(FULL)]))
    ui_root = canvas.child(N('UIRoot', comps=[ui_transform(1280, 720), widget(FULL)]))
    boot = canvas.child(label('BootLabel', '', 20, '#FAF3E7', 900, 200, pos=(0, 0, 0), overflow=1))
    boot.get('cc.Label').fields.update(_enableOutline=True, _outlineColor=color(INK), _outlineWidth=3)
    sound = root.child(N('Sound', layer=DEFAULT_LAYER))
    music = sound.child(N('Music', layer=DEFAULT_LAYER, comps=[C('cc.AudioSource', _loop=True, _playOnAwake=False, _volume=0.35)]))
    potloop = sound.child(N('PotLoop', layer=DEFAULT_LAYER, comps=[C('cc.AudioSource', _loop=True, _playOnAwake=False, _volume=0.5)]))
    sfx = sound.child(N('Sfx', layer=DEFAULT_LAYER, comps=[C('cc.AudioSource', _loop=False, _playOnAwake=False, _volume=1)]))
    sb = sound.add(C(cls('SoundBoard'), music=music.get('cc.AudioSource'), potLoop=potloop.get('cc.AudioSource'), sfx=sfx.get('cc.AudioSource')))
    gr = root.child(N('GameRoot', layer=DEFAULT_LAYER))
    p = lambda rel: asset_ref(prefab_uuid(rel), 'cc.Prefab')
    gr.add(C(cls('GameRoot'), uiRoot=ui_root, worldTouch=touch, worldRoot=world, mainCamera=cam.get('cc.Camera'), storePrefab=p('prefabs/stage/Store'),
             store=None, sound=sb, bootLabel=boot.get('cc.Label'),
             titlePrefab=p('prefabs/ui/TitlePanel'), morningPrefab=p('prefabs/ui/MorningPanel'), hudPrefab=p('prefabs/ui/HudView'),
             reportPrefab=p('prefabs/ui/ReportPanel'), decorPrefab=p('prefabs/ui/DecorPanel'), storyPrefab=p('prefabs/ui/StoryPanel'),
             settingsPrefab=p('prefabs/ui/SettingsPanel'), practicePrefab=p('prefabs/ui/PracticePanel'),
             recipesPrefab=p('prefabs/ui/RecipeBookPanel'), lightPrefab=p('prefabs/ui/LightPanel'), chapterPrefab=p('prefabs/ui/ChapterPanel'), mainLight=light.get('cc.DirectionalLight')))

    objs = serialize(root, 'scene', 'Store')
    # 场景外壳：SceneAsset 在最前，Scene 的全局设置放最后
    shift = 1
    def bump(v):
        if isinstance(v, dict):
            if set(v.keys()) == {'__id__'}:
                return {'__id__': v['__id__'] + shift}
            return {k: bump(x) for k, x in v.items()}
        if isinstance(v, list):
            return [bump(x) for x in v]
        return v
    objs = [bump(o) for o in objs]
    base = len(objs) + 1
    def rebase(v):
        if isinstance(v, dict):
            if set(v.keys()) == {'__id__'}:
                return {'__id__': v['__id__'] + base}
            return {k: rebase(x) for k, x in v.items()}
        if isinstance(v, list):
            return [rebase(x) for x in v]
        return v
    globs = [rebase(o) for o in globals_objs]
    scene = objs[0]
    scene.update({'autoReleaseAssets': False, '_globals': {'__id__': base}, '_id': scene_id})
    for k in ('__editorExtras__',):
        scene.setdefault(k, {})
    # 环境光：暖一些、亮一些
    amb = next(o for o in globs if o.get('__type__') == 'cc.AmbientInfo')
    for key in ('_skyColorHDR', '_skyColor', '_skyColorLDR'):
        amb[key] = {'__type__': 'cc.Vec4', 'x': 0.95, 'y': 0.86, 'z': 0.74, 'w': 0.6}
    for key in ('_skyIllumHDR', '_skyIllum'):
        amb[key] = 9000
    amb['_skyIllumLDR'] = 9000
    for key in ('_groundAlbedoHDR', '_groundAlbedo', '_groundAlbedoLDR'):
        amb[key] = {'__type__': 'cc.Vec4', 'x': 0.45, 'y': 0.35, 'z': 0.28, 'w': 1}
    out = [{'__type__': 'cc.SceneAsset', '_name': 'Store', '_objFlags': 0, '__editorExtras__': {}, '_native': '', 'scene': {'__id__': 1}}] + objs + globs
    write_json('assets/scenes/Store.scene', out)
build_scene()

print('生成完成：')
for k, v in sorted(PREFAB_UUID.items()):
    print(' ', k, v)
