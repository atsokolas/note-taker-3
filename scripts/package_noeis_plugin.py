#!/usr/bin/env python3
"""Validate and ZIP the reviewed plugin allowlist; no credentials or repo files."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'plugins' / 'noeis'
FILES = [Path('plugin.json'), Path('mcp.json'), Path('assets/icon.svg')] + sorted(
    path.relative_to(PLUGIN) for path in (PLUGIN / 'skills').glob('*/SKILL.md'))


def validate():
    manifest = json.loads((PLUGIN / 'plugin.json').read_text())
    assert manifest['$schema'] == 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
    assert re.fullmatch(r'[a-z][a-z0-9-]*', manifest['name'])
    assert re.fullmatch(r'\d+\.\d+\.\d+', manifest['version'])
    assert manifest['description'].strip()
    interface = manifest['extensions']['com.openai']['interface']
    assert len(interface['shortDescription']) <= 30
    assert len(interface['defaultPrompt']) <= 3
    assert all(len(prompt) <= 128 for prompt in interface['defaultPrompt'])
    mcp = json.loads((PLUGIN / 'mcp.json').read_text())
    assert mcp['$schema'] == 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
    assert set(mcp['mcpServers']) == {'noeis'}
    server = mcp['mcpServers']['noeis']
    assert set(server) == {'type', 'url'}, 'No embedded headers or credentials allowed'
    assert server['type'] == 'streamable-http'
    url = urlsplit(server['url'])
    assert url.scheme == 'https' and url.hostname and not url.username and not url.password
    assert not url.query and not url.fragment
    assert len(FILES) == 6, 'Review the allowlist before changing package components'
    for relative in FILES:
        path = PLUGIN / relative
        assert not path.is_symlink() and path.resolve().is_relative_to(PLUGIN.resolve())
        text = path.read_text()
        assert not re.search(r'-----BEGIN .*PRIVATE KEY|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}', text)
        if path.name == 'SKILL.md':
            assert text.startswith('---\n')
            header = text.split('---', 2)[1]
            assert f'name: {path.parent.name}\n' in header
            assert re.search(r'^description: .+', header, re.M)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    manifest = validate()
    if args.output:
        output = args.output.resolve()
        assert not output.is_relative_to(PLUGIN.resolve()), 'ZIP must stay outside package source'
        output.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
            for relative in FILES:
                archive.write(PLUGIN / relative, relative.as_posix())
        with ZipFile(output) as archive:
            assert set(archive.namelist()) == {p.as_posix() for p in FILES}
            assert archive.testzip() is None
        print(f'Created {output} ({len(FILES)} reviewed files)')
    print(f"PASS local package checks: {manifest['name']} {manifest['version']}")
    print('Not an OpenAI schema/portal validation or hosted OAuth approval.')


if __name__ == '__main__':
    main()
