#!/usr/bin/env bash
# Read-only DNS diagnostic. No resolver or site configuration changes.
set -u
command -v dig >/dev/null || { echo 'Missing dig'; exit 1; }
command -v curl >/dev/null || { echo 'Missing curl'; exit 1; }
exec > >(tee /tmp/mooncci-dns-check.log) 2>&1
date -u
cat /etc/resolv.conf
for resolver in 8.8.8.8 8.8.4.4 1.1.1.1 ns1.alidns.com ns2.alidns.com; do
  for kind in A AAAA; do
    for round in 1 2 3 4 5; do
      echo "CHECK resolver=$resolver type=$kind round=$round"
      dig @"$resolver" route-test.mooncci.site "$kind" +time=2 +tries=1 +noall +comments +answer +stats
    done
  done
done
for resolver in 8.8.8.8 1.1.1.1; do
  echo "CONTROL resolver=$resolver"
  dig @"$resolver" example.com A +time=2 +tries=1 +noall +comments +answer +stats
  echo "TCP resolver=$resolver"
  dig @"$resolver" route-test.mooncci.site A +tcp +time=3 +tries=1 +noall +comments +answer +stats
  echo "DELEGATION resolver=$resolver"
  dig @"$resolver" route-test.mooncci.site NS +time=2 +tries=1 +noall +comments +answer +stats
done
for round in 1 2 3 4 5; do
  echo "HTTP normal round=$round"
  curl --noproxy '*' -sS --max-time 15 -o /dev/null -w 'code=%{http_code} ip=%{remote_ip} dns=%{time_namelookup} total=%{time_total}\n' 'https://route-test.mooncci.site/api/posts?format=paged&page=1&pageSize=1'
  echo "HTTP pinned round=$round"
  curl --noproxy '*' --resolve 'route-test.mooncci.site:443:107.174.123.42' -sS --max-time 15 -o /dev/null -w 'code=%{http_code} ip=%{remote_ip} dns=%{time_namelookup} total=%{time_total}\n' 'https://route-test.mooncci.site/api/posts?format=paged&page=1&pageSize=1'
done
echo 'DONE: /tmp/mooncci-dns-check.log'
