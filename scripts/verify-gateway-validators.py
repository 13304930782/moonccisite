"""Read-only post-deployment checks. Run on the overseas gateway with Python 3.6+."""
import argparse
import datetime
import hashlib
import http.client
import json
import socket
import ssl
import time
from pathlib import Path

IMAGE = '/api/uploads/import-c75fb0e91471-bfafc384e05b5c98e6e9.webp'
SAFE = {'etag', 'last-modified', 'cache-control', 'content-type',
        'content-length', 'x-mooncci-node', 'x-mooncci-route', 'vary'}


class PinnedTLS(http.client.HTTPSConnection):
    def __init__(self, ip):
        super().__init__('mooncci.site', timeout=12)
        self.ip = ip

    def connect(self):
        raw = socket.create_connection((self.ip, 443), timeout=self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def request(ip, path=IMAGE, headers=None):
    conn = PinnedTLS(ip)
    start = time.monotonic()
    try:
        conn.request('GET', path, headers=headers or {})
        response = conn.getresponse()
        first = time.monotonic() - start
        body = response.read(2097153)
        if len(body) > 2097152:
            raise ValueError('Response exceeds 2 MiB limit')
        return {'status': response.status, 'bytes': len(body),
                'sha256': hashlib.sha256(body).hexdigest(),
                'first_s': first, 'total_s': time.monotonic() - start,
                'headers': {k.lower(): v for k, v in response.getheaders()
                            if k.lower() in SAFE}}
    finally:
        conn.close()


def collect(samples, save):
    report = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'vantage': 'overseas server (must be run there)',
              'note': 'Fresh TLS connections; no browser cache or DNS timing measurement',
              'results': [], 'passed': False}
    for layer, ip in [('origin', '182.92.179.81'), ('gateway', '127.0.0.1')]:
        for attempt in range(1, samples + 1):
            row = {'layer': layer, 'attempt': attempt}
            report['results'].append(row)
            try:
                baseline = request(ip)
                row['baseline'] = baseline
                if baseline['status'] != 200:
                    raise ValueError('Baseline must return 200')
                if layer == 'gateway' and baseline['headers'].get('x-mooncci-node') != 'US':
                    raise ValueError('Loopback response is not the US gateway')
                for mode, header, key in [('etag', 'If-None-Match', 'etag'),
                                          ('modified', 'If-Modified-Since', 'last-modified')]:
                    value = baseline['headers'].get(key)
                    if not value:
                        raise ValueError('Missing validator: ' + key)
                    row[mode] = request(ip, headers={header: value})
                row['unmatched'] = request(ip, headers={'If-None-Match': '"mooncci-deliberate-mismatch"'})
                row['passed'] = all(row[m]['status'] == 304 and row[m]['bytes'] == 0
                                    for m in ('etag', 'modified')) and (
                    row['unmatched']['status'] == 200 and
                    row['unmatched']['sha256'] == baseline['sha256'])
            except (OSError, ValueError, http.client.HTTPException) as error:
                row['error'] = str(error)
                row['passed'] = False
            save(report)
            print('{} {}/{} {}'.format(layer, attempt, samples,
                                      'PASS' if row['passed'] else 'FAIL'), flush=True)
    baselines = [r['baseline']['sha256'] for r in report['results'] if 'baseline' in r]
    report['same_image_across_layers'] = len(set(baselines)) == 1
    report['passed'] = (len(report['results']) == samples * 2 and
                        all(r['passed'] for r in report['results']) and
                        report['same_image_across_layers'])
    save(report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=3)
    parser.add_argument('--output', default='/root/mooncci-gateway-validators.json')
    args = parser.parse_args()
    if not 1 <= args.samples <= 30:
        parser.error('samples must be 1..30')
    def save(report):
        Path(args.output).write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
    report = collect(args.samples, save)
    print('TEST_DONE {} {}'.format('PASS' if report['passed'] else 'FAIL', args.output), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
