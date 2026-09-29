"""Read-only probe, run on the overseas gateway. No credentials or configuration output."""
import argparse
import datetime
import json
import statistics
import subprocess
import tempfile
from pathlib import Path

SAFE_HEADERS = {'cache-control', 'etag', 'last-modified', 'age', 'x-cache',
                'x-mooncci-node', 'x-mooncci-route', 'content-type', 'content-length'}
IMAGE = '/api/uploads/import-c75fb0e91471-bfafc384e05b5c98e6e9.webp'
FORMAT = '\nMOONCCI ' + json.dumps({k: '%{' + v + '}' for k, v in {
    'status': 'http_code', 'dns': 'time_namelookup', 'tcp': 'time_connect',
    'tls': 'time_appconnect', 'first': 'time_starttransfer', 'total': 'time_total',
    'bytes': 'size_download', 'new_connections': 'num_connects'}.items()}) + '\n'


def probe(ip, path, count, conditional=None):
    with tempfile.TemporaryDirectory(prefix='mooncci-probe-') as directory:
        headers = Path(directory) / 'headers'
        command = ['curl', '--silent', '--show-error', '--noproxy', '*', '--http1.1',
                   '--connect-timeout', '5', '--max-time', '12', '--max-filesize', '2097152',
                   '--resolve', 'mooncci.site:443:' + ip, '--dump-header', str(headers),
                   '--write-out', FORMAT]
        if conditional:
            command += ['--header', 'If-None-Match: ' + conditional]
        for _ in range(count):
            command += ['--url', 'https://mooncci.site' + path, '--output', '/dev/null']
        result = subprocess.run(command, capture_output=True, text=True, timeout=count * 15 + 10)
        rows = []
        for line in result.stdout.splitlines():
            if line.startswith('MOONCCI '):
                row = json.loads(line[8:])
                rows.append({k: float(v) if k not in ('status', 'bytes', 'new_connections')
                             else int(float(v)) for k, v in row.items()})
        blocks = []
        for line in headers.read_text(errors='replace').splitlines() if headers.exists() else []:
            if line.startswith('HTTP/'):
                blocks.append({'http': line})
            elif ':' in line and blocks:
                key, value = line.split(':', 1)
                if key.lower() in SAFE_HEADERS:
                    blocks[-1][key.lower()] = value.strip()
        return {'rows': rows, 'headers': blocks, 'curl_exit': result.returncode,
                'error': result.stderr[:2000]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=30)
    parser.add_argument('--output', default='/root/mooncci-gateway-matrix.json')
    args = parser.parse_args()
    if not 1 <= args.samples <= 30:
        parser.error('samples must be 1..30')
    report = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'vantage': 'Run on overseas gateway; caller must confirm', 'results': []}
    output = Path(args.output)

    def save():
        output.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())

    for route, ip in [('origin', '182.92.179.81'), ('gateway-loopback', '127.0.0.1')]:
        for path in ['/', IMAGE]:
            for mode in ['fresh', 'reuse']:
                entry = {'route': route, 'path': path, 'mode': mode, 'runs': []}
                report['results'].append(entry)
                try:
                    failures = 0
                    for _ in range(args.samples if mode == 'fresh' else 1):
                        run = probe(ip, path, 1 if mode == 'fresh' else args.samples)
                        entry['runs'].append(run)
                        failures = failures + 1 if run['curl_exit'] else 0
                        save()
                        if failures >= 3:
                            entry['stopped'] = 'Three consecutive transport failures'
                            break
                    rows = [r for run in entry['runs'] for r in run['rows']]
                    good = [r['total'] for r in rows if r['status'] == 200]
                    entry['summary'] = {'samples': len(rows), 'success_200': len(good),
                                        'reused_connections': sum(r['new_connections'] == 0 and r['status'] == 200 for r in rows),
                                        'median_seconds': statistics.median(good) if good else None}
                    if path == IMAGE and mode == 'reuse':
                        etags = [h['etag'] for run in entry['runs'] for h in run['headers'] if 'etag' in h]
                        if etags:
                            entry['conditional'] = probe(ip, path, 1, etags[-1])
                except (OSError, ValueError, subprocess.TimeoutExpired) as error:
                    entry['error'] = str(error)
                save()
                print(route, path, mode, entry.get('summary', entry.get('error')), flush=True)
    report['completed'] = True
    save()
    print('TEST_DONE ' + str(output), flush=True)


if __name__ == '__main__':
    main()
