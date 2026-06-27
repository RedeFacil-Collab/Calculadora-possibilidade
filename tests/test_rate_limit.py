"""Testes para rate limiting via PresenceStore."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from presence import PresenceStore, RATE_LIMIT_PREFIX


def make_store():
    with patch.object(PresenceStore, "__init__", lambda self, *a, **kw: None):
        store = PresenceStore.__new__(PresenceStore)
        store.client = MagicMock()
        store.ttl_seconds = 300
        return store


class TestCheckRateLimit:
    def test_allows_when_no_attempts(self):
        store = make_store()
        store.client.get.return_value = None
        allowed, retry_after = store.check_rate_limit("1.2.3.4")
        assert allowed is True
        assert retry_after == 0

    def test_allows_below_limit(self):
        store = make_store()
        store.client.get.return_value = "4"
        allowed, _ = store.check_rate_limit("1.2.3.4", max_attempts=5)
        assert allowed is True

    def test_blocks_at_limit(self):
        store = make_store()
        store.client.get.return_value = "5"
        store.client.ttl.return_value = 120
        allowed, retry_after = store.check_rate_limit("1.2.3.4", max_attempts=5)
        assert allowed is False
        assert retry_after == 120

    def test_blocks_above_limit(self):
        store = make_store()
        store.client.get.return_value = "10"
        store.client.ttl.return_value = 60
        allowed, _ = store.check_rate_limit("1.2.3.4", max_attempts=5)
        assert allowed is False


class TestRecordLoginAttempt:
    def test_increments_and_sets_expiry(self):
        store = make_store()
        pipe = MagicMock()
        store.client.pipeline.return_value = pipe
        store.record_login_attempt("1.2.3.4", window_seconds=300)
        pipe.incr.assert_called_once_with(f"{RATE_LIMIT_PREFIX}1.2.3.4")
        pipe.expire.assert_called_once_with(f"{RATE_LIMIT_PREFIX}1.2.3.4", 300, nx=True)
        pipe.execute.assert_called_once()


class TestClearLoginAttempts:
    def test_deletes_key(self):
        store = make_store()
        store.clear_login_attempts("1.2.3.4")
        store.client.delete.assert_called_once_with(f"{RATE_LIMIT_PREFIX}1.2.3.4")
