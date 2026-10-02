#!/usr/bin/env python3
"""Gate 1 only: inspect local resolver answers. Does not modify DNS or call website APIs."""
import argparse
import datetime
import json
import socket
import sys
import time

PROBE = 'route-test.mooncci.site'
EXPECTED = {'CN': '182.92.179.81', 'US': '107.174.123.42'}

def inspect(host, resolver=socket.getaddrinfo):
    start = time.monotonic()
    try:
        answers = resolver(host, 443, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
        return {'host': host, 'addresses': sorted(set(item[4][0] for item in answers)),
                'seconds': round(time.monotonic()-start, 4), 'error': None}
    except socket.gaierror as error:
        return {'host':host, 'addresses':[], 'seconds':round(time.monotonic()-start,4),
                'error':'resolver-error-' + str(error.errno)}

def verdict(result, region):
    return result['error'] is None and result['addresses'] == [EXPECTED[region]]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--region',required=True,choices=['CN','US'])
    args=parser.parse_args()
    print('Local system resolver; physical region is supplied by operator, not automatically verified.')
    print('Disable VPN/proxy DNS overrides. Do not add hosts-file entries for the test name.')
    results=[]
    for n in range(3):
        result=inspect(PROBE);result['sample']=n+1
        results.append(result)
        print(json.dumps(result,ensure_ascii=False),flush=True)
        if n<2: time.sleep(1)
    main_result=inspect('mooncci.site')
    print('MAIN_SITE',json.dumps(main_result,ensure_ascii=False),flush=True)
    ok=all(verdict(result,args.region) for result in results)
    main_ok=main_result['error'] is None and main_result['addresses']==[EXPECTED['CN']]
    print('TEST_DNS', 'PASS' if ok else 'FAIL', 'expected='+EXPECTED[args.region])
    print('MAIN_UNCHANGED', 'PASS' if main_ok else 'REVIEW', 'expected='+EXPECTED['CN'])
    print('UTC',datetime.datetime.now(datetime.timezone.utc).isoformat())
    print('LIMIT: DNS answers only. Does not prove HTTPS, app routing, login, availability or speed.')
    print('LIMIT: repeated samples may be cached; resolver location/ECS may differ from visitor location.')
    return 0 if ok and main_ok else 1

if __name__=='__main__':
    sys.exit(main())
