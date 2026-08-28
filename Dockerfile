FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    COACH_HOST=0.0.0.0 \
    COACH_PORT=8001 \
    COACH_DATABASE_PATH=/data/coach.db \
    COACH_SERVE_FRONTEND=1 \
    AUTH_DEV_SHOW_CODE=0 \
    AUTH_DEMO_MODE=1

WORKDIR /app
RUN useradd --create-home --uid 10001 isyou && mkdir -p /data && chown isyou:isyou /data
COPY --chown=isyou:isyou . /app

USER isyou
EXPOSE 8001
VOLUME ["/data"]

CMD ["python", "backend/server.py"]
