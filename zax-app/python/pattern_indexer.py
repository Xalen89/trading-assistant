#!/usr/bin/env python3
"""Private geometric image neighbors; cosine similarity is NOT trade probability."""
import os
os.environ['OPENCV_IO_MAX_IMAGE_PIXELS'] = '16000000'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import argparse
import base64
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
import cv2
import numpy as np

VERSION = 'opencv-hog-128x64-v1'
DIMENSIONS = 3780
cv2.setNumThreads(1)
HOG = cv2.HOGDescriptor((128, 64), (16, 16), (8, 8), (8, 8), 9)
LIMITATIONS = ('Visual neighbors only. Theme, crop, labels and chart geometry affect cosine similarity; '
               'this does not detect semantic setups, confirm confluences or predict trade success.')

def image_vector(raw, roi=None):
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise ValueError('Images must be between 1 byte and 8 MiB.')
    if not (raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff') or
            raw[:4] == b'RIFF' and raw[8:12] == b'WEBP'):
        raise ValueError('Supported image signatures: PNG, JPEG and WebP.')
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None or not image.size or image.size > 16000000:
        raise ValueError('Unreadable or oversized image.')
    if roi is not None:
        if (len(roi) != 4 or not all(np.isfinite(roi)) or
                not 0 <= roi[0] < roi[2] <= 1 or not 0 <= roi[1] < roi[3] <= 1):
            raise ValueError('ROI must be ordered normalized coordinates.')
        h, w = image.shape
        image = image[int(roi[1]*h):int(np.ceil(roi[3]*h)), int(roi[0]*w):int(np.ceil(roi[2]*w))]
    return descriptor(image)

def descriptor(image):
    if image.size < 16 or float(image.std()) < 2:
        raise ValueError('Blank or low-variance images cannot be indexed.')
    h, w = image.shape
    scale = min(128/w, 64/h)
    nw, nh = max(1, round(w*scale)), max(1, round(h*scale))
    resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((64,128), int(np.median(image)), np.uint8)
    x, y = (128-nw)//2, (64-nh)//2
    canvas[y:y+nh, x:x+nw] = resized
    v = HOG.compute(canvas).ravel().astype('<f4')
    norm = float(np.linalg.norm(v))
    if v.size != DIMENSIONS or not np.isfinite(v).all() or norm <= 0:
        raise ValueError('Invalid image descriptor.')
    return (v/norm).astype('<f4')

def decode_vector(encoded):
    raw = base64.b64decode(encoded, validate=True)
    v = np.frombuffer(raw, dtype='<f4')
    if v.size != DIMENSIONS or not np.isfinite(v).all() or abs(float(np.dot(v,v))-1) > .01:
        raise ValueError('Invalid normalized vector.')
    return v

def candle_vector(candles):
    if not isinstance(candles,list) or not 8 <= len(candles) <= 1000:
        raise ValueError('Need 8–1000 actual chronological OHLC bars.')
    previous = 0
    for c in candles:
        values = [float(c[k]) for k in ['time','open','high','low','close','volume']]
        t,o,h,l,close,volume = values
        if not all(np.isfinite(values)) or t <= previous or min(o,h,l,close) <= 0 or volume < 0 or h < max(o,close) or l > min(o,close) or h < l:
            raise ValueError('Malformed or nonchronological OHLC bars.')
        previous = t
    bars = candles[-32:]
    low, high = min(c['low'] for c in bars), max(c['high'] for c in bars)
    if high <= low:
        raise ValueError('Flat candle window cannot be compared.')
    # Internal reproducible dataset raster, not a user-facing generated chart or forecast.
    image = np.full((64,128), 20, np.uint8)
    def y(price): return int(np.clip(59-(price-low)/(high-low)*54, 2, 61))
    for i,c in enumerate(bars):
        x = int((i+.5)*128/len(bars))
        cv2.line(image,(x,y(c['high'])),(x,y(c['low'])),180,1)
        cv2.rectangle(image,(max(0,x-1),min(y(c['open']),y(c['close']))),
                      (min(127,x+1),max(y(c['open']),y(c['close']))),230 if c['close']>=c['open'] else 100,-1)
    return descriptor(image)

def connect(path):
    p = Path(path).expanduser().resolve()
    existed=p.parent.exists()
    p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if not existed:os.chmod(p.parent,0o700)
    db = sqlite3.connect(p, timeout=5)
    os.chmod(p,0o600)
    db.execute('CREATE TABLE IF NOT EXISTS chart_vectors (owner TEXT NOT NULL, pattern TEXT NOT NULL, version INTEGER NOT NULL, algo TEXT NOT NULL, hash TEXT NOT NULL, vector BLOB NOT NULL, PRIMARY KEY(owner,pattern,algo))')
    return db

def handle(data):
    owner = data.get('owner')
    if not isinstance(owner,str) or not 1 <= len(owner) <= 100:
        raise ValueError('An explicit owner scope is required.')
    if data.get('operation') not in ['index','query']:
        raise ValueError('Unknown operation.')
    raw = base64.b64decode(data['imageBase64'],validate=True) if data.get('imageBase64') else None
    v = image_vector(raw,data.get('roi')) if raw is not None else candle_vector(data.get('candles'))
    with connect(data['dbPath']) as db:
        if data['operation'] == 'index':
            pattern,version = data.get('patternId'),data.get('version')
            if not isinstance(pattern,str) or not 1 <= len(pattern) <= 100 or not isinstance(version,int) or version < 1:
                raise ValueError('A pattern and positive revision are required.')
            digest = hashlib.sha256(raw).hexdigest()
            if data.get('sourceHash') and data['sourceHash'] != digest:
                raise ValueError('Source hash mismatch.')
            db.execute('INSERT INTO chart_vectors VALUES (?,?,?,?,?,?) ON CONFLICT(owner,pattern,algo) DO UPDATE SET version=excluded.version,hash=excluded.hash,vector=excluded.vector', (owner,pattern,version,VERSION,digest,v.tobytes()))
            return dict(vectorBase64=base64.b64encode(v.tobytes()).decode(),descriptorVersion=VERSION,dimensions=DIMENSIONS,sourceHash=digest)
        candidates = data.get('candidates',[])
        top = data.get('topK',5)
        if not isinstance(candidates,list) or len(candidates)>500 or not isinstance(top,int) or not 1 <= top <= 5:
            raise ValueError('At most 500 candidates and five results allowed.')
        scored = []
        for c in candidates:
            if c.get('descriptorVersion') != VERSION or not isinstance(c.get('version'),int) or c['version'] < 1:
                raise ValueError('Candidate descriptor/version mismatch.')
            d = decode_vector(c['vectorBase64'])
            db.execute('INSERT INTO chart_vectors VALUES (?,?,?,?,?,?) ON CONFLICT(owner,pattern,algo) DO UPDATE SET version=excluded.version,hash=excluded.hash,vector=excluded.vector', (owner,c['patternId'],c['version'],VERSION,c['sourceHash'],d.tobytes()))
            row = db.execute('SELECT vector FROM chart_vectors WHERE owner=? AND pattern=? AND version=? AND algo=? AND hash=?', (owner,c['patternId'],c['version'],VERSION,c['sourceHash'])).fetchone()
            if row:
                score = float(np.clip(np.dot(v,np.frombuffer(row[0],dtype='<f4')),0,1))
                scored.append(dict(patternId=c['patternId'],version=c['version'],similarity=score))
        return dict(results=sorted(scored,key=lambda c:c['similarity'],reverse=True)[:top],examined=len(candidates),limitations=LIMITATIONS)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json',action='store_true')
    parser.add_argument('operation',nargs='?',choices=['index','query'])
    parser.add_argument('--db');parser.add_argument('--owner');parser.add_argument('--image')
    parser.add_argument('--id');parser.add_argument('--version',type=int,default=1)
    parser.add_argument('--roi');parser.add_argument('--top-k',type=int,default=5)
    args = parser.parse_args()
    if args.json:
        raw = sys.stdin.buffer.read(13*1024*1024+1)
        if len(raw)>13*1024*1024: raise ValueError('Input exceeds limit.')
        data=json.loads(raw)
    else:
        if not all([args.operation,args.db,args.owner,args.image]): parser.error('Provide operation, --db, --owner and --image.')
        image=Path(args.image).read_bytes()
        data=dict(operation=args.operation,owner=args.owner,dbPath=args.db,imageBase64=base64.b64encode(image).decode(),patternId=args.id,version=args.version,topK=args.top_k)
        if args.roi:data['roi']=[float(v) for v in args.roi.split(',')]
        if args.operation=='query':
            with connect(args.db) as db:
                rows=db.execute('SELECT pattern,version,hash,vector FROM chart_vectors WHERE owner=? AND algo=? LIMIT 501',(args.owner,VERSION)).fetchall()
            data['candidates']=[dict(patternId=p,version=v,sourceHash=h,vectorBase64=base64.b64encode(b).decode(),descriptorVersion=VERSION) for p,v,h,b in rows]
    print(json.dumps(handle(data),allow_nan=False))

if __name__ == '__main__':
    try:main()
    except Exception as e:
        print('Pattern indexing failed: '+str(e)[:400],file=sys.stderr)
        sys.exit(1)
