FROM node:24-alpine AS frontend-build

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --omit=dev
COPY client ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_DEBUG=0

RUN pip install --no-cache-dir --upgrade pip

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn==22.0.0

RUN adduser --disabled-password --gecos "" appuser

COPY --chown=appuser:appuser . .
COPY --from=frontend-build --chown=appuser:appuser /app/static/react ./static/react

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/login', timeout=3)"

CMD ["gunicorn", "--workers", "2", "--threads", "8", "--timeout", "120", "--bind", "0.0.0.0:8000", "app:app"]
