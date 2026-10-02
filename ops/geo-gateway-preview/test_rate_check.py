import unittest
from unittest.mock import patch
import verify
class RateCheckTests(unittest.TestCase):
    def test_distinct_buckets(self):
        samples=[(200,{},b'203.0.113.77')]+[(200,{'ratelimit-remaining':str(n)},b'{}') for n in [199,199,198]]
        with patch.object(verify,'request',side_effect=samples):verify.verify_origin_ip()
    def test_shared_bucket_rejected(self):
        samples=[(200,{},b'203.0.113.77')]+[(200,{'ratelimit-remaining':str(n)},b'{}') for n in [199,198,197]]
        with patch.object(verify,'request',side_effect=samples):
            with self.assertRaisesRegex(RuntimeError,'Independent'):verify.verify_origin_ip()
    def test_missing_trust_rejected(self):
        with patch.object(verify,'request',return_value=(200,{},b'107.174.123.42')):
            with self.assertRaisesRegex(RuntimeError,'trusted-gateway'):verify.verify_origin_ip()
