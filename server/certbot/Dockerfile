FROM python:3.12-slim

# Certbot 5.4+ kan certificaten voor een IP-adres aanvragen (--ip-address).
RUN pip install --no-cache-dir "certbot>=5.4,<6"

COPY renew.py /renew.py
CMD ["python", "-u", "/renew.py"]
