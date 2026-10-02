#!/usr/bin/env python3
"""Outbound-only mailbox provisioning worker for the mail server."""
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

SITE = os.environ.get('MOONCCI_SITE_ORIGIN', 'https://mooncci.site').rstrip('/')
KEY = os.environ.get('MAILBOX_PROVISION_KEY', '')
PYTHON = '/www/server/panel/pyenv/bin/python3'
WORKER = os.path.join(os.path.dirname(__file__), 'create_mailbox.py')

if not SITE.startswith('https://') or not re.fullmatch(r'[a-fA-F0-9]{64}', KEY) or not os.environ.get('MOONCCI_MAIL_HOST'):
    raise SystemExit('HTTPS site origin, mail host and 64-hex MAILBOX_PROVISION_KEY are required')


def api(path, payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
    timestamp = str(int(time.time()))
    signed = timestamp.encode() + b'\n' + path.encode() + b'\n' + body
    signature = hmac.new(bytes.fromhex(KEY), signed, hashlib.sha256).hexdigest()
    request = urllib.request.Request(SITE + '/api/mailboxes/agent' + path, data=body,
        headers={'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
                 'X-Mooncci-Timestamp': timestamp, 'X-Mooncci-Signature': signature},
        method='POST')
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def process(job):
    request_id = job['requestId']
    address = job['address']
    # The password is sent only to the child process on stdin; never log it.
    try:
        done = subprocess.run([PYTHON, WORKER], input=json.dumps(job), text=True,
            capture_output=True, timeout=60, cwd='/www/server/panel')
        if done.returncode:
            print(f'job {request_id}: plugin exited {done.returncode}; manual review required', flush=True)
            created = False
        else:
            result = json.loads(done.stdout.strip().splitlines()[-1])
            created = result.get('created') is True
    except (subprocess.TimeoutExpired, ValueError, IndexError) as error:
        print(f'job {request_id}: {type(error).__name__}; manual review required', flush=True)
        created = False
    api('/complete', {'requestId': request_id, 'address': address, 'created': created})
    print(f'job {request_id}: {"created" if created else "manual review"}', flush=True)


def main():
    while True:
        try:
            response = api('/claim', {})
            if response.get('job'):
                process(response['job'])
            else:
                time.sleep(15)
        except Exception as error:
            # Never disclose the response body, job, password, or key in logs.
            print(f'agent request failed: {type(error).__name__}', flush=True)
            time.sleep(30)


if __name__ == '__main__':
    main()
