import json, math, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
DIR=ROOT/'游戏工程/BaTian/assets/resources/models/real'
REPORT=ROOT/'美术源文件/正式物件/检查结果.json'
report=[]
formats={5121:('B',1),5123:('H',2),5125:('I',4),5126:('f',4)}
counts={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
for file in sorted(DIR.glob('*.glb')):
    raw=file.read_bytes()
    magic,version,size=struct.unpack_from('<III',raw)
    assert magic==0x46546c67 and version==2 and size==len(raw),file
    jsize,jkind=struct.unpack_from('<II',raw,12)
    assert jkind==0x4e4f534a
    doc=json.loads(raw[20:20+jsize])
    bsize,bkind=struct.unpack_from('<II',raw,20+jsize)
    assert bkind==0x004e4942
    buf=raw[28+jsize:28+jsize+bsize]
    assert len(doc['scenes'])==1 and len(doc['nodes'])==1,file
    node=doc['nodes'][0]
    assert node.get('translation',[0,0,0])==[0,0,0]
    assert node.get('rotation',[0,0,0,1])==[0,0,0,1]
    assert node.get('scale',[1,1,1])==[1,1,1]
    assert not doc.get('cameras') and not doc.get('animations')
    assert not doc.get('extensionsRequired')
    for im in doc.get('images',[]): assert 'bufferView' in im and 'uri' not in im
    def accessor(i):
        ac=doc['accessors'][i]; view=doc['bufferViews'][ac['bufferView']]
        typ,n= formats[ac['componentType']]; c=counts[ac['type']]
        offset=view.get('byteOffset',0)+ac.get('byteOffset',0); stride=view.get('byteStride',n*c)
        assert offset+(ac['count']-1)*stride+n*c<=len(buf)
        return [struct.unpack_from('<'+typ*c,buf,offset+k*stride) for k in range(ac['count'])]
    verts=[]; triangles=0
    for prim in doc['meshes'][node['mesh']]['primitives']:
        ps=accessor(prim['attributes']['POSITION']); ns=accessor(prim['attributes']['NORMAL']); indices=accessor(prim['indices'])
        assert all(math.isfinite(v) for p in ps for v in p)
        assert all(.98<sum(v*v for v in n)<1.02 for n in ns)
        assert len(indices)%3==0 and max(i[0] for i in indices)<len(ps)
        triangles+=len(indices)//3; verts.extend(ps)
    mn=[min(p[i] for p in verts) for i in range(3)]; mx=[max(p[i] for p in verts) for i in range(3)]
    assert abs(mn[1])<1e-5,(file,mn)
    assert abs(mx[0]+mn[0])<1e-5 and abs(mx[2]+mn[2])<1e-5,(file,mn,mx)
    meta=json.loads(file.with_suffix('.glb.meta').read_text())
    scenes=[v for v in meta['subMetas'].values() if v['importer']=='gltf-scene']
    assert len(scenes)==1 and scenes[0]['imported'],file
    report.append({'file':file.name,'bytes':len(raw),'triangles':triangles,'boundsYUp':{'min':mn,'max':mx},'imported':True})
decor=json.loads((ROOT/'游戏工程/BaTian/assets/resources/data/rules/decor.json').read_text())
assert all((DIR/(d['mesh']+'.glb')).exists() for d in decor)
REPORT.write_text(json.dumps({'passed':len(report),'decor':len(decor),'totalBytes':sum(r['bytes'] for r in report),'assets':report},ensure_ascii=False,indent=2))
print('GLBs passed:',len(report),'All decor:',len(decor),'Total bytes:',sum(r['bytes'] for r in report))
