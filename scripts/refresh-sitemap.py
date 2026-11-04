#!/usr/bin/env python3
"""Publish the existing public sitemap as an atomic, nginx-served XML file."""
import argparse
import os
import re
from pathlib import Path
import tempfile
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'


def validate(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('XML declarations are not permitted')
    root = ET.fromstring(data)
    if root.tag != NS + 'urlset':
        raise ValueError('Expected sitemap urlset')
    urls = []
    for row in root:
        loc = row.find(NS + 'loc')
        value = loc.text if loc is not None else ''
        parsed = urllib.parse.urlsplit(value or '')
        if row.tag != NS + 'url' or parsed.scheme != 'https' or parsed.netloc != 'moooncci.cn' or parsed.fragment or parsed.query or value != 'https://moooncci.cn' + parsed.path:
            raise ValueError('Invalid public sitemap URL')
        public = parsed.path[3:] if parsed.path.startswith('/en/') else ('/' if parsed.path == '/en' else parsed.path)
        static = {'/', '/articles', '/archives', '/about', '/links', '/projects', '/updates', '/tags', '/categories', '/rss', '/series', '/early-access', '/mail-setup'}
        if public not in static:
            match = re.fullmatch(r'/(article|updates|projects|category|tag|series)/([^/]+)', public)
            if not match:
                raise ValueError('Private or unknown sitemap route')
            part = match.group(2)
            decoded = urllib.parse.unquote(part, errors='strict')
            nested = urllib.parse.unquote(decoded, errors='strict') if match.group(1) == 'article' else decoded
            if (not decoded or len(decoded) > 255 or decoded in ('.', '..') or nested in ('.', '..') or re.search(r'[/\\#?\x00-\x1f\x7f]', nested)
                    or ('%' in decoded and match.group(1) != 'article')
                    or urllib.parse.quote(decoded, safe="~!*'()-._") != part):
                raise ValueError('Invalid sitemap content reference')
        urls.append(value)
    if not urls or len(urls) > 50000 or len(urls) != len(set(urls)):
        raise ValueError('Empty, duplicate or oversized sitemap')
    return len(urls)


def publish(data, destination):
    count = validate(data)
    destination = Path(destination)
    if destination.exists() and destination.read_bytes() == data:
        return count
    handle, temporary = tempfile.mkstemp(prefix='.sitemap-', dir=str(destination.parent))
    try:
        with os.fdopen(handle, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o644)
        os.replace(temporary, str(destination))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', required=True)
    args = parser.parse_args()
    # Always read our existing published-only query, never a public remote URL.
    with urllib.request.urlopen('http://127.0.0.1:3001/sitemap.xml', timeout=15) as response:
        data = response.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise ValueError('Sitemap exceeds refresh limit')
    print('Published {} URLs'.format(publish(data, args.destination)))


if __name__ == '__main__':
    main()
