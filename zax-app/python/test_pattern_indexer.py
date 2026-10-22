import base64
import tempfile
import unittest
from pathlib import Path
import importlib
cv2=importlib.import_module('cv2')
import numpy as np
indexer=importlib.import_module('pattern_indexer')
handle,image_vector,VERSION=indexer.handle,indexer.image_vector,indexer.VERSION

class PatternTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.db=str(Path(self.temp.name)/'vectors.sqlite')
        image=np.full((80,160),20,np.uint8)
        for i in range(12):cv2.rectangle(image,(i*12+4,20+i%3*5),(i*12+8,60-i%4*3),200,-1)
        self.raw=cv2.imencode('.png',image)[1].tobytes();self.b64=base64.b64encode(self.raw).decode()
        self.index=handle(dict(operation='index',owner='fixture-a',dbPath=self.db,patternId='synthetic',version=1,imageBase64=self.b64))
    def tearDown(self):self.temp.cleanup()
    def candidate(self,version=1):return dict(patternId='synthetic',version=version,sourceHash=self.index['sourceHash'],descriptorVersion=VERSION,vectorBase64=self.index['vectorBase64'])
    def query(self,owner='fixture-a',candidates=None):return handle(dict(operation='query',owner=owner,dbPath=self.db,imageBase64=self.b64,candidates=[] if candidates is None else candidates))
    def test_exact_neighbor(self):self.assertAlmostEqual(self.query(candidates=[self.candidate()])['results'][0]['similarity'],1,places=5)
    def test_other_owner_no_cached_results(self):self.assertEqual(self.query('fixture-b')['results'],[])
    def test_exact_version(self):self.assertEqual(self.query(candidates=[self.candidate(3)])['results'][0]['version'],3)
    def test_empty_candidates_ignore_cached(self):self.assertEqual(self.query()['examined'],0)
    def test_invalid_vector(self):
        c=self.candidate();c['vectorBase64']='AAAA'
        with self.assertRaises(ValueError):self.query(candidates=[c])
    def test_blank(self):
        blank=cv2.imencode('.png',np.zeros((32,32),np.uint8))[1].tobytes()
        with self.assertRaises(ValueError):image_vector(blank)
    def test_bad_image(self):
        with self.assertRaises(ValueError):image_vector(b'not-image')
    def test_roi(self):
        with self.assertRaises(ValueError):image_vector(self.raw,[.8,.1,.2,.9])
    def test_bad_bars(self):
        with self.assertRaises(ValueError):handle(dict(operation='query',owner='a',dbPath=self.db,candles=[]))
    def test_permissions(self):self.assertEqual(Path(self.db).stat().st_mode&0o777,0o600)

if __name__=='__main__':unittest.main()
