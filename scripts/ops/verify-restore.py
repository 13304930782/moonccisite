#!/usr/bin/env python3
"""Verify a restic restore in a NEW isolated directory. Never writes to production."""
import argparse, hashlib, json, pathlib, re, subprocess, sys

def verify(directory):
    root=pathlib.Path(directory).resolve(strict=True)
    manifest=json.loads((root/'MANIFEST.json').read_text())
    if not manifest.get('files') or 'database.sql' not in manifest['files'] or 'app.env' not in manifest['files']:
        raise ValueError('Incomplete manifest')
    for name,expected in manifest['files'].items():
        p=root/name
        if p.is_symlink(): raise ValueError('Unsafe restored path')
        try:
            p.resolve().relative_to(root)
        except ValueError:
            raise ValueError('Unsafe restored path')
        h=hashlib.sha256()
        with p.open('rb') as stream:
            for block in iter(lambda:stream.read(1024*1024),b''): h.update(block)
        if h.hexdigest()!=expected: raise ValueError('Restored data checksum mismatch')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory');args=parser.parse_args()
    try:
        info=verify(args.directory)
        print(f"Verified {len(info['files'])} restored files. Database import and application smoke test still required.")
    except Exception as error:
        print('Restore verification failed: '+type(error).__name__,file=sys.stderr);sys.exit(1)
