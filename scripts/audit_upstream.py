#!/usr/bin/env python3
"""Inventory source and release member metadata only. Never extract game binaries.
python3 audit_upstream.py REPO RELEASE_ARCHIVE_DIR OUTPUT_JSON
"""
from pathlib import Path
import hashlib,json,subprocess,sys
up,archives,dest=map(Path,sys.argv[1:4])
def git(*args):return subprocess.check_output(['git','-C',str(up),*args],text=True)
refs=git('for-each-ref','--format=%(refname) %(objectname)').splitlines()
commits=git('rev-list','--all').splitlines();trees={}
for commit in commits:
 entries=[]
 for line in git('ls-tree','-r','--long',commit).splitlines():
  meta,name=line.split('\t',1);mode,kind,sha,size=meta.split();entries.append({'path':name,'mode':mode,'type':kind,'sha1':sha,'bytes':int(size) if size!='-' else None})
 trees[commit]=entries
releases=[]
for archive in sorted(archives.glob('*.rar')):
 members=subprocess.check_output(['tar','-tvf',str(archive)],text=True)
 paths=subprocess.check_output(['tar','-tf',str(archive)],text=True).splitlines()
 texts={}
 for path in paths:
  if path.endswith(('README.txt','LICENSES.txt','PLAY.bat','DIAGNOSTICS.bat')):
   texts[path]=subprocess.check_output(['tar','-xOf',str(archive),path]).decode('utf8',errors='replace')
 releases.append({'tag':archive.stem,'archiveBytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'listing':members,'textFiles':texts,'containsGeneratedC':any('ps2_code_' in p and p.endswith('.c') for p in paths)})
documents={}
for entry in trees[git('rev-parse','HEAD').strip()]:
 path=entry['path']
 if path.endswith(('.md','.html')) and not path.startswith('third_party/imgui/'):
  # Record documentation content to verify reviewed dependencies and notices.
  documents[path]=git('show','HEAD:'+path)
# HLE audit was deliberately deleted from current main; inspect its historical text.
for commit in commits:
 if any(e['path']=='HLE_AUDIT.md' for e in trees[commit]):
  documents['historical/HLE_AUDIT.md@'+commit]=git('show',commit+':HLE_AUDIT.md');break
report={'head':git('rev-parse','HEAD').strip(),'refs':refs,'commitCount':len(commits),'trees':trees,'releases':releases,'documents':documents,'submoduleEntries':[e for tree in trees.values() for e in tree if e['mode']=='160000'],'actions':json.loads((archives/'actions-artifacts.json').read_text())}
dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'commits':len(commits),'currentFiles':len(trees[report['head']]),'releaseArchives':len(releases),'submoduleEntries':len(report['submoduleEntries']),'actionsArtifacts':report['actions']['total_count']},indent=2))
