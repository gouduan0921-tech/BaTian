"""Verify the actual game exports, independently of the authoring scene."""
import hashlib, json, math, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / '美术源文件/写实改造_20261005'
MODELS = ROOT / '游戏工程/BaTian/assets/resources/models/real'
BACKUP = OUT / '替换前/assets/resources/models/real'

def load_glb(p):
    raw = p.read_bytes()
    assert struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw)), p
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(raw[20:20+size])
    bs, bk = struct.unpack_from('<II', raw, 20+size)
    assert bk == 0x004e4942
    return raw, doc, raw[28+size:28+size+bs]

def floats(doc, buf, index):
    a = doc['accessors'][index]; v = doc['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126
    count = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', 4*count)
    return [struct.unpack_from('<'+'f'*count, buf, offset+i*stride) for i in range(a['count'])]

checks = []
for p in sorted(MODELS.glob('*.glb')):
    raw, d, buf = load_glb(p)
    _, old, _ = load_glb(BACKUP/p.name)
    assert not d.get('extensionsRequired') and not d.get('animations') and not d.get('cameras')
    assert all('bufferView' in im and 'uri' not in im for im in d.get('images', []))
    assert sorted(n.get('name') for n in d['nodes']) == sorted(n.get('name') for n in old['nodes']), p
    tri = 0
    for mesh in d['meshes']:
        for prim in mesh['primitives']:
            assert prim.get('mode', 4) == 4
            tri += d['accessors'][prim['indices']]['count']//3
            assert 'NORMAL' in prim['attributes'] and 'TEXCOORD_0' in prim['attributes'], p
            for attribute in ['POSITION','NORMAL','TEXCOORD_0']:
                assert all(math.isfinite(x) for row in floats(d, buf, prim['attributes'][attribute]) for x in row), p
    meta = json.loads(p.with_suffix('.glb.meta').read_text())
    oldmeta = json.loads((BACKUP/(p.name+'.meta')).read_text())
    assert meta['uuid'] == oldmeta['uuid'], p
    scenes = [x['uuid'] for x in meta['subMetas'].values() if x['importer'] == 'gltf-scene']
    oldscenes = [x['uuid'] for x in oldmeta['subMetas'].values() if x['importer'] == 'gltf-scene']
    # The old importer left unused duplicate scene subassets in some metadata.
    assert scenes and set(scenes).issubset(oldscenes), p
    checks.append(dict(asset=p.stem, bytes=len(raw), triangles=tri,
        sha256=hashlib.sha256(raw).hexdigest(), nodesPreserved=True,
        finitePositionsNormalsUVs=True, embeddedImages=True,
        assetIdPreserved=True, sceneIdsPreserved=True,
        scenePrefab=scenes[0], extensionsRequired=d.get('extensionsRequired', [])))

assert len(checks) == 53
guest = json.loads((ROOT/'游戏工程/BaTian/assets/prefabs/stage/Guest.prefab').read_text())
char = next(x for x in checks if x['asset'] == 'CHAR_Common_Guest_A')
assert guest[6]['model']['__uuid__'] == char['scenePrefab']
report = dict(models=len(checks), totalBytes=sum(x['bytes'] for x in checks),
    totalTriangles=sum(x['triangles'] for x in checks),
    guestUsesNewModel=True, checks=checks)
(OUT/'最终导出检查.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k != 'checks'}, ensure_ascii=False))
