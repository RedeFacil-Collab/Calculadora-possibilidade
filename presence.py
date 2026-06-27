"""Presença em tempo real e eventos administrativos via Redis."""

from __future__ import annotations

import json
from collections.abc import Iterator

import redis


PRESENCE_PREFIX = "presence:user:"
RATE_LIMIT_PREFIX = "ratelimit:login:"
ACTIVITY_CHANNEL = "admin:activity"
EXPIRATION_CHANNEL = "__keyevent@0__:expired"


class PresenceStore:
    def __init__(self, redis_url: str, ttl_seconds: int = 300) -> None:
        if not redis_url:
            raise RuntimeError("REDIS_URL não foi configurada.")
        self.client = redis.Redis.from_url(redis_url, decode_responses=True)
        self.ttl_seconds = ttl_seconds

    def ping(self) -> bool:
        return bool(self.client.ping())

    def mark_online(self, user_id: int) -> None:
        key = f"{PRESENCE_PREFIX}{user_id}"
        was_online = bool(self.client.exists(key))
        self.client.set(key, "1", ex=self.ttl_seconds)
        if not was_online:
            self.publish("presence_changed", user_id)

    def mark_offline(self, user_id: int) -> None:
        if self.client.delete(f"{PRESENCE_PREFIX}{user_id}"):
            self.publish("presence_changed", user_id)

    def online_user_ids(self, user_ids: list[int]) -> set[int]:
        if not user_ids:
            return set()
        values = self.client.mget([f"{PRESENCE_PREFIX}{user_id}" for user_id in user_ids])
        return {user_id for user_id, value in zip(user_ids, values) if value}

    def check_rate_limit(self, ip: str, max_attempts: int = 5, window_seconds: int = 300) -> tuple[bool, int]:
        key = f"{RATE_LIMIT_PREFIX}{ip}"
        current = self.client.get(key)
        attempts = int(current) if current else 0
        if attempts >= max_attempts:
            ttl = self.client.ttl(key)
            return False, max(ttl, 0)
        return True, 0

    def record_login_attempt(self, ip: str, window_seconds: int = 300) -> None:
        key = f"{RATE_LIMIT_PREFIX}{ip}"
        pipe = self.client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        pipe.execute()

    def clear_login_attempts(self, ip: str) -> None:
        self.client.delete(f"{RATE_LIMIT_PREFIX}{ip}")

    def publish(self, event: str, user_id: int | None = None) -> None:
        self.client.publish(
            ACTIVITY_CHANNEL,
            json.dumps({"event": event, "user_id": user_id}),
        )

    def listen(self) -> Iterator[str | None]:
        pubsub = self.client.pubsub(ignore_subscribe_messages=True)
        pubsub.subscribe(ACTIVITY_CHANNEL, EXPIRATION_CHANNEL)
        try:
            while True:
                message = pubsub.get_message(timeout=15)
                if not message:
                    yield None
                    continue
                if message["channel"] == EXPIRATION_CHANNEL:
                    if str(message["data"]).startswith(PRESENCE_PREFIX):
                        yield json.dumps({"event": "presence_changed"})
                    continue
                yield str(message["data"])
        finally:
            pubsub.close()
