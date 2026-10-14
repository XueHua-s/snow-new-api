"""Regression coverage for the repository's CI source-size boundary."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    'business_size', Path(__file__).resolve().parents[1] / 'check-business-file-size.py'
)
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class BusinessFileSizeAuditTest(unittest.TestCase):
    def test_tracks_new_files_and_flags_unclassified_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '--quiet', directory], check=True)
            (root / 'boundary.go').write_text('// line\n' * 500)
            (root / 'deleted.go').write_text('// removed\n')
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            (root / 'deleted.go').unlink()
            (root / 'business.ts').write_text('// line\n' * 501)
            (root / 'business.futurelang').write_text('source\n' * 501)
            (root / 'runner').write_text('#!/bin/sh\n' + '# line\n' * 500)
            (root / 'behavior.test.ts').write_text('// test\n' * 501)
            (root / 'README.md').write_text('documentation\n' * 501)
            (root / '.gitignore').write_text('ignored.ts\n')
            (root / 'ignored.ts').write_text('// dependency\n' * 501)

            report = CHECKER.audit(root)
            self.assertEqual(report['checked'], 3)
            self.assertEqual(
                [item['path'] for item in report['violations']],
                ['business.ts', 'runner'],
            )
            self.assertEqual(report['unclassified'], [
                {'path': 'business.futurelang', 'lines': 501},
            ])
            self.assertEqual(report['exempt'], [
                {'path': 'behavior.test.ts', 'lines': 501, 'reason': 'Test code'},
            ])


if __name__ == '__main__':
    unittest.main()
