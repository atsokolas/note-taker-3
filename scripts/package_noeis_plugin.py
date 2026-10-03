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


def validate(staging_mcp_url=None):
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
    if staging_mcp_url:
        server['url'] = staging_mcp_url
    assert set(server) == {'type', 'url'}, 'No embedded headers or credentials allowed'
    assert server['type'] == 'streamable-http'
    url = urlsplit(server['url'])
    assert url.scheme == 'https' and url.hostname and not url.username and not url.password
    assert not url.query and not url.fragment
    assert url.path == '/mcp', 'Use the staging server canonical /mcp resource'
    assert url.hostname not in {'note-taker-3-unrg.onrender.com', 'www.noeis.io', 'noeis.io'}, 'This builder produces staging packages only; production requires separate review'
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
    return manifest, mcp


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    parser.add_argument('--staging-mcp-url', help='Approved staging HTTPS /mcp URL; default is explicitly unconfigured .invalid')
    args = parser.parse_args()
    manifest, mcp = validate(args.staging_mcp_url)
    endpoint = mcp['mcpServers']['noeis']['url']
    configured = not urlsplit(endpoint).hostname.endswith('.invalid')
    if args.output:
        output = args.output.resolve()
        assert not output.is_relative_to(PLUGIN.resolve()), 'ZIP must stay outside package source'
        output.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
            for relative in FILES:
                if relative == Path('mcp.json'):
                    archive.writestr('mcp.json', json.dumps(mcp, indent=2) + '\n')
                else:
                    archive.write(PLUGIN / relative, relative.as_posix())
        with ZipFile(output) as archive:
            assert set(archive.namelist()) == {p.as_posix() for p in FILES}
            assert archive.testzip() is None
        config = {'target': 'staging', 'configured': configured, 'mcpResource': endpoint, 'deploymentPerformed': False, 'accountConnectTested': False}
        output.with_suffix('.config.json').write_text(json.dumps(config, indent=2) + '\n')
        print(f'Created {output} ({len(FILES)} reviewed files; staging target)')
    print(f"PASS local package checks: {manifest['name']} {manifest['version']}")
    print(f'STAGING endpoint: {endpoint}')
    if not configured:
        print('UNCONFIGURED: .invalid placeholder cannot connect; supply an approved staging URL before installation.')
    print('Not an OpenAI portal validation, hosted OAuth approval, or deployment.')


if __name__ == '__main__':
    main()
