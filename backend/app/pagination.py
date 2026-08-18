"""Shared pagination for list endpoints.

Validates page/page_size, applies offset/limit to a SQLAlchemy query, and
reports the total match count via the ``X-Total-Count`` response header —
so response bodies stay plain arrays and no existing caller (a picker that
just wants "everything", an older integration, a test) breaks when an
endpoint gains pagination. ``page_size`` defaults high enough that a caller
who never passes it still gets the full result set in one response.
"""

from fastapi import HTTPException, Response
from sqlalchemy.orm import Query

DEFAULT_PAGE_SIZE = 1000
MAX_PAGE_SIZE = 1000


def paginate(query: Query, response: Response, page: int, page_size: int) -> list:
    if page < 1:
        raise HTTPException(400, "page must be >= 1")
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        raise HTTPException(400, f"page_size must be between 1 and {MAX_PAGE_SIZE}")
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    response.headers["X-Total-Count"] = str(total)
    return items
