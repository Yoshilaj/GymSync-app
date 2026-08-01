# GymSync API.
#
# Two things here are not boilerplate and shouldn't be "tidied" away:
#
# 1. The RAG models are downloaded at BUILD time, not first request. fastembed
#    defaults its cache to a temp directory, so without this every cold start
#    would pull hundreds of megabytes from HuggingFace before the first premium
#    search could answer — and would fail outright whenever HuggingFace is down.
#    Baking them costs image size and buys a predictable, offline-capable boot.
#
# 2. It runs ONE uvicorn worker. app/ratelimit.py keeps its counters in a plain
#    module-level dict, so N workers would multiply every limit by N (its own
#    docstring says so). One worker is a deliberate constraint, not an oversight
#    — see app/cache.py for the shared-store path that would lift it.

FROM python:3.12-slim AS base

# Python 3.12 rather than the 3.14 in the local venv: onnxruntime and fastembed
# have the widest wheel coverage here, and neither needs a compiler on 3.12.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    FASTEMBED_CACHE_PATH=/opt/models

WORKDIR /app

# curl is for the container-level health probe; nothing else needs a toolchain
# because every dependency ships manylinux wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, in their own layer, so an application edit doesn't
# reinstall onnxruntime.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Warm the model cache. The names must match app/config.py's embedder/reranker
# defaults for production (EMBEDDER=nomic, RERANKER=cross_encoder) — if those
# settings change, change these too or the download comes back at runtime,
# silently, on the first premium search.
RUN python -c "\
from fastembed import TextEmbedding; \
from fastembed.rerank.cross_encoder import TextCrossEncoder; \
TextEmbedding(model_name='nomic-ai/nomic-embed-text-v1.5'); \
TextCrossEncoder(model_name='Xenova/ms-marco-MiniLM-L-6-v2'); \
print('model cache warmed')"

COPY app ./app

# Drop privileges.
#
# /opt/models MUST be chowned too, not just /app. The models are downloaded above
# as root; the app then runs as uid 10001 and can read them but not write. That
# is not enough: huggingface_hub writes tree-cache metadata every time it loads a
# model, so a root-owned cache produces
#
#   Ignoring corrupted tree cache file ...: [Errno 13] Permission denied
#
# and the load stalls long enough to fail Fly's health check. Read-only looks
# sufficient right up until the first premium search in production.
RUN useradd --create-home --uid 10001 gymsync \
    && chown -R gymsync:gymsync /app /opt/models
USER gymsync

EXPOSE 8000

# --proxy-headers so uvicorn trusts Fly's forwarding for scheme/port. Client IP
# for rate limiting is resolved separately in app/ratelimit.py, gated on the
# TRUSTED_PROXY setting, and takes the LAST X-Forwarded-For hop — which is the
# one Fly appends and a client cannot forge.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
