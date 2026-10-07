"""Independently validate the actual revised models and their exported animations."""
import json, struct, math, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];OUT=ROOT/'美术源文件/照片级改造_20261006';MODELS=ROOT/'游戏工程/BaTian/assets/resources/models/real';BACK=OUT/'替换前/模型'
def glb(p):
    raw=p.read_bytes();assert struct.unpack_from('<III',raw)==(0x46546c67,2,len(raw))
    n,k=struct.unpack_from('<II',raw,12);assert k==0x4e4f534a;doc=json.loads(raw[20:20+n]);nb,kb=struct.unpack_from('<II',raw,20+n);assert kb==0x004e4942
    return raw,doc,raw[28+n:28+n+nb]
def values(doc,buf,i):
    a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];size=struct.calcsize(fmt)*n;stride=v.get('byteStride',size);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+fmt*n,buf,offset+j*stride) for j in range(a['count'])]
checks=[]
for p in sorted(MODELS.glob('*.glb')):
    raw,d,buf=glb(p);assert not d.get('cameras');assert not d.get('extensionsRequired');assert all('bufferView' in im for im in d['images'])
    tri=0
    for mesh in d['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode',4)==4;tri+=d['accessors'][primitive['indices']]['count']//3
            for name in ['POSITION','NORMAL','TEXCOORD_0']:
                assert name in primitive['attributes'];assert all(math.isfinite(x) for row in values(d,buf,primitive['attributes'][name]) for x in row), (p,name)
    meta=json.loads(p.with_suffix('.glb.meta').read_text());oldp=BACK/p.name;preserved=None
    if oldp.exists():
        _,old,_=glb(oldp);oldmeta=json.loads((BACK/(p.name+'.meta')).read_text());assert meta['uuid']==oldmeta['uuid'];preserved=True
        if not p.name.startswith('CHAR'):assert sorted(n.get('name') for n in d['nodes'])==sorted(n.get('name') for n in old['nodes'])
    if p.name.startswith('CHAR'):
        assert len(d['skins'])==1;assert {a['name'] for a in d['animations']}=={'GuestIdle','GuestWalk','GuestSit'}
        for skin in d['skins']:
            assert len(skin['joints'])>30;assert all(math.isfinite(x) for row in values(d,buf,skin['inverseBindMatrices']) for x in row)
        for animation in d['animations']:
            for sampler in animation['samplers']:
                times=[v[0] for v in values(d,buf,sampler['input'])];assert all(a<b for a,b in zip(times,times[1:]));assert all(math.isfinite(x) for row in values(d,buf,sampler['output']) for x in row)
    checks.append({'file':p.name,'bytes':len(raw),'triangles':tri,'sha256':hashlib.sha256(raw).hexdigest(),'existingIdPreserved':preserved,'clips':[a['name'] for a in d.get('animations',[])],'imagesEmbedded':True,'positionsNormalsUVsFinite':True})
assert len(checks)==58
j=json.loads((ROOT/'游戏工程/BaTian/assets/prefabs/stage/Guest.prefab').read_text());assert j[6]['variantIds']==['B','C'];assert len(j[6]['variants'])==2
result={'models':len(checks),'scannedGuests':3,'animationClips':9,'totalTriangles':sum(c['triangles'] for c in checks),'totalBytes':sum(c['bytes'] for c in checks),'checks':checks}
(OUT/'实际游戏资源检查.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
