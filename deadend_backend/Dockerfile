FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY deadend_backend/requirements.txt .
RUN pip install -r requirements.txt
COPY deadend_backend/app ./app
COPY deadend_backend/start.sh /usr/local/bin/start.sh
# repo-root scripts the curator/verify tooling uses (curator.py, retrieval.py, ...)
COPY scripts ./scripts
# runner package so backend-side tooling can package/inspect it
COPY deadend-runner ./deadend-runner
RUN chmod +x /usr/local/bin/start.sh
EXPOSE 8000
CMD ["start.sh"]
