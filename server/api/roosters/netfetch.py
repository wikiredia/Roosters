"""Veilig ophalen van door gebruikers ingegeven URL's.

Iemand kan een link plakken naar http://192.168.1.1 of naar de database-container.
Daarom: enkel http(s)/webcal, DNS zelf opzoeken, enkel publieke IP's, verbinden met
precies dat gecontroleerde IP (geen tweede DNS-lookup), redirects opnieuw controleren,
en een limiet op grootte en tijd.
"""
import gzip
import http.client
import io
import ipaddress
import socket
import ssl
import urllib.parse

MAX_BYTES = 5 * 1024 * 1024
TIMEOUT = 20
MAX_REDIRECTS = 5
USER_AGENT = "Roosters/1.0 (+schedule sync)"


class FetchError(Exception):
    pass


def _public_ip(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return addr.is_global and not addr.is_multicast


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    elif url.lower().startswith("webcals://"):
        url = "https://" + url[len("webcals://"):]
    return url


def check_url(url: str) -> urllib.parse.SplitResult:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise FetchError("Alleen http(s)- of webcal-links zijn toegestaan.")
    if not parts.hostname:
        raise FetchError("Dat lijkt geen geldige link.")
    if parts.username or parts.password:
        raise FetchError("Links met een gebruikersnaam of wachtwoord worden niet aanvaard.")
    if parts.port not in (None, 80, 443, 8080, 8443):
        raise FetchError("Die poort is niet toegestaan.")
    return parts


def resolve_public(host: str, port: int) -> str:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise FetchError(f"Kan {host} niet vinden.")
    ips = [i[4][0] for i in infos]
    if not ips:
        raise FetchError(f"Kan {host} niet vinden.")
    for ip in ips:
        if not _public_ip(ip):
            raise FetchError("Die link wijst naar een intern netwerkadres en wordt geweigerd.")
    # IPv4 eerst: thuisnetwerken hebben niet altijd IPv6
    ips.sort(key=lambda x: ":" in x)
    return ips[0]


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host, ip, port, timeout):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, ip, port, timeout):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self._ip = ip

    def connect(self):
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def fetch(url: str, *, method="GET", body: bytes | None = None, headers: dict | None = None,
          max_bytes: int = MAX_BYTES) -> tuple[int, dict, bytes]:
    """Geeft (status, headers, body) terug. Volgt redirects veilig."""
    url = normalize_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        parts = check_url(url)
        https = parts.scheme == "https"
        port = parts.port or (443 if https else 80)
        ip = resolve_public(parts.hostname, port)
        cls = _PinnedHTTPSConnection if https else _PinnedHTTPConnection
        conn = cls(parts.hostname, ip, port, TIMEOUT)
        path = parts.path or "/"
        if parts.query:
            path += "?" + parts.query
        h = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip", "Accept": "*/*"}
        h.update(headers or {})
        try:
            conn.request(method, path, body=body, headers=h)
            resp = conn.getresponse()
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.getheader("Location")
                resp.read(1024)
                if not loc:
                    raise FetchError("Ongeldige doorverwijzing.")
                url = urllib.parse.urljoin(url, loc)
                if resp.status == 303:
                    method, body = "GET", None
                continue
            data = resp.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise FetchError("Het bestand is te groot.")
            if (resp.getheader("Content-Encoding") or "").lower() == "gzip":
                d = gzip.GzipFile(fileobj=io.BytesIO(data))
                data = d.read(max_bytes + 1)
                if len(data) > max_bytes:
                    raise FetchError("Het bestand is te groot.")
            return resp.status, {k.lower(): v for k, v in resp.getheaders()}, data
        except (OSError, http.client.HTTPException) as e:
            raise FetchError(f"Kon {parts.hostname} niet bereiken ({e.__class__.__name__}).")
        finally:
            conn.close()
    raise FetchError("Te veel doorverwijzingen.")
