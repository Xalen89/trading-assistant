from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
s=(root/'requirements/zax-fixes-scope-07.txt').read_text()
items=list(re.finditer(r'^(C\d+|H\d+|M\d+|E\d+) · (.+)$',s,re.M))
pending={'C4':'Pending deployment and physical force-quit test; authenticated worker and dated per-position evidence exist, but not verified deployed.', 'C5':'Native channel/sound/badge preferences implemented; physical iOS/Android delivery still required.', 'C6':'Autosave and private exports implemented; kill/reopen device test pending.', 'M7':'Aggregation/session projection implemented; genuine missing-session data remains refused.', 'M11':'Partial: archived references preserved; exact destructive legacy migration is not silently applied to existing owner records.', 'M12':'Omitted by explicit owner instruction: everything owner-only, no public links.', 'M17':'Optional PIN/native crypto and background mask implemented; physical device resume/re-auth test pending.', 'M23':'Conversation transcript persisted/rendered; physical retention/reopen check pending.', 'M14':'Original-first 25 MiB jobs/progress implemented; interrupted jobs fail visibly and allow explicit retry. Uninterrupted deployed-worker proof pending.', 'M1':'Separate deeper source surface implemented; provider-specific history availability governs actual retrieved depth.', 'M24':'Separate chart and analogue limits implemented; deeper replay availability remains provider-dependent.'}
out=['# Zax repair tracker — complete original acceptance clauses','', 'Version: 18 October 2026. Source: requirements/zax-fixes-scope-07.txt.','', 'This is the full scope tracker, not a claim that every physical-device or statistical acceptance test passed. Core source work is being validated; unresolved deployment/data/device outcomes remain explicit.','']
for i,m in enumerate(items):
 chunk=s[m.start():items[i+1].start() if i+1<len(items) else len(s)].strip()
 out+=['## '+m.group(1)+' — '+m.group(2),'','**Status:** '+pending.get(m.group(1),'Implemented source path; see ZAX_UPDATE.md for current diagnostics and regression evidence. A listed source implementation is not an unperformed device acceptance test.'),'','### Original requirement','',chunk,'']
(root/'ZAX_FIX_TRACKER.md').write_text('\n'.join(out).rstrip()+'\n')
print('Tracker clauses:',len(items))
