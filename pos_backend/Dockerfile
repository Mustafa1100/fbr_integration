FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Only the application code: databases, keys and .env stay out (.dockerignore).
COPY app ./app

RUN useradd --create-home --uid 10001 pos && chown -R pos /app
USER pos

EXPOSE 8080

# ONE worker on purpose: live updates to the desktop apps (/api/pos/events)
# are passed between requests inside this process. Run a single machine too.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
