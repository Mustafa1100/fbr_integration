"""Live updates to desktop apps.

Each signed-in PC that is online keeps one connection open
(GET /api/pos/events, server-sent events). When an admin changes something
for that client — the subscription, settings, items, a decision on a request,
the password — the server sends "changed" down the connection and the PC
fetches the update at once. No polling.

Subscribers live in this process's memory, so this works with one server
process. Running several would need a shared message bus (e.g. Redis pub/sub).
"""

import asyncio
import threading
from collections import defaultdict

_lock = threading.Lock()
_subscribers: dict[int, set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = defaultdict(set)


def subscribe(client_id: int) -> tuple[asyncio.Queue, callable]:
    """Register a connection; returns its queue and a function to remove it."""
    entry = (asyncio.get_running_loop(), asyncio.Queue())
    with _lock:
        _subscribers[client_id].add(entry)

    def unsubscribe() -> None:
        with _lock:
            _subscribers[client_id].discard(entry)
            if not _subscribers[client_id]:
                _subscribers.pop(client_id, None)

    return entry[1], unsubscribe


def publish(client_id: int, event: str = "changed") -> None:
    """Tell every open connection of this client. Safe to call from the
    worker threads FastAPI runs ordinary endpoints in."""
    with _lock:
        targets = list(_subscribers.get(client_id, ()))
    for loop, queue in targets:
        loop.call_soon_threadsafe(queue.put_nowait, event)


def connections(client_id: int) -> int:
    with _lock:
        return len(_subscribers.get(client_id, ()))
