#!/usr/bin/env python3
"""Audit owned source files, including untracked work, against the 500-line rule."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 500
SOURCE_EXTENSIONS = {'.go', '.rs', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.vue', '.svelte', '.sh', '.lua', '.css', '.scss', '.sass', '.less', '.html', '.sql', '.c', '.h', '.cpp', '.hpp', '.java', '.kt', '.swift', '.rb', '.php', '.mts', '.cts'}
# Known non-program text formats; new source extensions must be classified explicitly.
DATA_EXTENSIONS = {'.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.lock', '.sum', '.mod', '.svg', '.csv', '.xml', '.sse', '.patch'}
DOCUMENT_NAMES = {'LICENSE', 'NOTICE', 'COPYING'}
# Exact exceptions are intentional: a directory name is not a business-code exemption.
EXCEPTIONS = {
    'web/src/routeTree.gen.ts': 'Generated TanStack route tree',
    'web/src/i18n/static-keys.ts': 'Translation extraction data',
    'tools/codex-transport/scripts/test-deployment.py': 'Deployment regression test runner',
    'tools/codex-transport/scripts/live-verification.py': 'Live transport verification runner',
    'tools/codex-transport/fixtures/protocol/sample.py': 'Protocol verification fixture',
}


def exclusion(path):
    if path.as_posix() in EXCEPTIONS:
        return EXCEPTIONS[path.as_posix()]
    if path.parts[:3] == ('tools', 'codex-transport', 'vendor') or 'node_modules' in path.parts:
        return 'Third-party dependency'
    if (
        '__tests__' in path.parts
        or path.parts[:2] == ('scripts', 'tests')
        or path.parts[:3] == ('tools', 'codex-transport', 'tests')
        or path.name.endswith('_test.go')
        or any(marker in path.name for marker in ('.test.', '.spec.'))
    ):
        return 'Test code'
    return None


def audit(root=ROOT):
    output = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        cwd=root,
    )
    violations, exempt, unclassified = [], [], []
    checked = 0
    for name in sorted(set(output.decode().split('\0')) - {''}):
        path = Path(name)
        absolute = root / path
        if not absolute.is_file():
            continue
        try:
            content = absolute.read_text(encoding='utf-8')
        except UnicodeError:
            continue  # Binary assets are not source text.
        lines = len(content.splitlines())
        reason = exclusion(path)
        is_source = path.suffix in SOURCE_EXTENSIONS or content.startswith('#!')
        if not is_source:
            if (
                lines > LIMIT
                and not reason
                and path.suffix not in DATA_EXTENSIONS
                and path.name not in DOCUMENT_NAMES
            ):
                unclassified.append({'path': name, 'lines': lines})
            continue
        if reason:
            if lines > LIMIT:
                exempt.append({'path': name, 'lines': lines, 'reason': reason})
            continue
        checked += 1
        if lines > LIMIT:
            violations.append({'path': name, 'lines': lines})
    return {
        'limit': LIMIT,
        'checked': checked,
        'violations': violations,
        'exempt': exempt,
        'unclassified': unclassified,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true', help='Print the complete machine-readable audit')
    args = parser.parse_args()
    report = audit()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Checked {report['checked']} owned production source files; limit: {LIMIT} physical lines")
        for item in report['violations']:
            print(f"{item['lines']:5}  {item['path']}")
        for item in report['unclassified']:
            print(f"Unclassified oversized text: {item['path']} ({item['lines']} lines)")
        print(f"Violations: {len(report['violations'])}; oversized exempt files: {len(report['exempt'])}")
    return 1 if report['violations'] or report['unclassified'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
