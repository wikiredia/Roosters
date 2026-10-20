FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --uid 10001 --create-home --shell /usr/sbin/nologin app

COPY roosters/ roosters/
USER app
EXPOSE 8000
# Several workers per container; more containers behind a load balancer later (the API keeps no state)
CMD ["uvicorn", "roosters.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--no-server-header", "--log-level", "warning"]
