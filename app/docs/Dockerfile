FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --uid 10001 --create-home --shell /usr/sbin/nologin docs \
 && mkdir /data && chown docs /data

COPY roostersdocs/ roostersdocs/
USER docs
EXPOSE 8000
# The code is mounted read-only at /src, the SQLite file lives in the /data volume
CMD ["uvicorn", "roostersdocs.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header", "--log-level", "warning"]
