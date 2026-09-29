"""Run existing TLS gateway workflow assertions against the cache patch."""
import unittest
import test_keepalive_gateway as existing
from image_cache import patch
original = existing.render
existing.render = lambda *args, **kwargs: patch(original(*args, **kwargs))
GatewayTest = existing.GatewayTest
if __name__ == '__main__': unittest.main()
