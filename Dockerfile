FROM node:20-bookworm-slim AS node-runtime

FROM python:3.13-slim

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/bin/npm /usr/local/bin/npm
COPY --from=node-runtime /usr/local/bin/npx /usr/local/bin/npx
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    COACH_HOST=0.0.0.0 \
    COACH_PORT=8001 \
    COACH_DATABASE_PATH=/data/coach.db \
    COACH_SERVE_FRONTEND=1 \
    JOB_MATCHER_BASE_URL=http://127.0.0.1:3000 \
    JOB_MATCHER_HOST=127.0.0.1 \
    JOB_MATCHER_PORT=3000 \
    AUTH_DEV_SHOW_CODE=0 \
    AUTH_DEMO_MODE=1

WORKDIR /app
RUN useradd --create-home --uid 10001 isyou && mkdir -p /data && chown isyou:isyou /data
COPY --chown=isyou:isyou . /app
RUN cd /app/job-matcher && npm ci --omit=dev

USER isyou
EXPOSE 8001
VOLUME ["/data"]

CMD ["python", "scripts/run_stack.py"]
