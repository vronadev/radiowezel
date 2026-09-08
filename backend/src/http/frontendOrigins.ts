export function parseFrontendOrigins(raw: string): { primary: string; allowed: string[] } {
  const listed = raw
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const primary = listed[0] || "http://localhost";
  const allowed = new Set<string>(listed.length ? listed : [primary]);
  for (const origin of [...allowed]) {
    for (const alias of loopbackAliases(origin)) {
      allowed.add(alias);
    }
  }
  return { primary, allowed: [...allowed] };
}

function loopbackAliases(origin: string): string[] {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return [];
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return ["localhost", "127.0.0.1", "[::1]"].map((host) => formatOrigin(url.protocol, host, port));
}

function formatOrigin(protocol: string, host: string, port: string): string {
  const isDefault = (protocol === "http:" && port === "80") || (protocol === "https:" && port === "443");
  return `${protocol}//${host}${isDefault ? "" : `:${port}`}`;
}
