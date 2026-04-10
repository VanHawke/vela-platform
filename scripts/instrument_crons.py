#!/usr/bin/env python3
"""
instrument_crons.py — Wrap every cron handler with withHeartbeat HOF.

For each target file:
  1. Add `withHeartbeat` to the existing './cron-utils.js' import, OR add a new import line
  2. Rename `export default async function handler` → `async function handler`
  3. Append `export default withHeartbeat('cron-name', handler);` at file end

Skips cron-utils.js, cron-partner-reconcile.js, cron-selfcheck-watcher.js
(those self-instrument with cronHeartbeat from kiko-tools.js).
"""
import os, re, sys

API_DIR = 'api'
SKIP = {'cron-utils.js', 'cron-partner-reconcile.js', 'cron-selfcheck-watcher.js'}
EXTRA_TARGETS = ['ingest-knowledge.js', 'news-agent.js']

def cron_name_for(fname):
    base = os.path.basename(fname).replace('.js', '')
    if base.startswith('cron-'):
        return base
    return f'cron-{base}'  # ingest-knowledge → cron-ingest-knowledge

def already_instrumented(content):
    return 'withHeartbeat' in content and 'export default withHeartbeat' in content

def patch_imports(content):
    """Add withHeartbeat to existing cron-utils import or add a new import line."""
    pattern = r"import\s*\{\s*([^}]+)\}\s*from\s*['\"]\.\/cron-utils\.js['\"]"
    m = re.search(pattern, content)
    if m:
        existing = [s.strip() for s in m.group(1).split(',') if s.strip()]
        if 'withHeartbeat' not in existing:
            existing.append('withHeartbeat')
        new_import = "import { " + ", ".join(existing) + " } from './cron-utils.js'"
        return content[:m.start()] + new_import + content[m.end():]
    last_import_match = list(re.finditer(r'^import .+from .+;?\s*$', content, re.M))
    if last_import_match:
        last = last_import_match[-1]
        new_line = "\nimport { withHeartbeat } from './cron-utils.js';"
        return content[:last.end()] + new_line + content[last.end():]
    return "import { withHeartbeat } from './cron-utils.js';\n\n" + content

def patch_export(content, cron_name):
    new_content = re.sub(
        r'export default async function handler\(req, res\) \{',
        'async function handler(req, res) {',
        content,
        count=1,
    )
    if new_content == content:
        return None
    if not new_content.endswith('\n'):
        new_content += '\n'
    new_content += f"\nexport default withHeartbeat('{cron_name}', handler);\n"
    return new_content

def main():
    targets = []
    for f in sorted(os.listdir(API_DIR)):
        if f.startswith('cron-') and f.endswith('.js') and f not in SKIP:
            targets.append(os.path.join(API_DIR, f))
    for extra in EXTRA_TARGETS:
        path = os.path.join(API_DIR, extra)
        if os.path.exists(path):
            targets.append(path)

    print(f"Targeting {len(targets)} files")
    instrumented = 0
    skipped = 0
    failed = 0
    for fpath in targets:
        with open(fpath) as f:
            original = f.read()
        if already_instrumented(original):
            skipped += 1
            print(f"  SKIP (already wrapped): {os.path.basename(fpath)}")
            continue
        cron_name = cron_name_for(fpath)
        with_imports = patch_imports(original)
        with_export = patch_export(with_imports, cron_name)
        if with_export is None:
            failed += 1
            print(f"  FAIL (no export default match): {os.path.basename(fpath)}")
            continue
        with open(fpath, 'w') as f:
            f.write(with_export)
        instrumented += 1
        print(f"  OK   {os.path.basename(fpath):42}  →  {cron_name}")

    print()
    print(f"Done: {instrumented} instrumented, {skipped} skipped, {failed} failed")
    return 0 if failed == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
