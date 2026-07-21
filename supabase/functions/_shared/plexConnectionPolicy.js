// Plex resource metadata is user-influenced. Only accept connection targets
// that do not require an attacker-controlled DNS lookup at request time.

function ipv4IsPrivate(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6IsPrivate(ip) {
  const host = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '::1' || host === '::') return true;
  const firstHextet = Number.parseInt(host.split(':')[0], 16);
  if (Number.isInteger(firstHextet) && firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;
  if (host.startsWith('fc') || host.startsWith('fd')) return true;
  const mappedDotted = host.match(/(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedDotted) return ipv4IsPrivate(mappedDotted[1]);
  const mappedHex = host.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return ipv4IsPrivate(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  return false;
}

function hostIsBlocked(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host || host === 'localhost' || host === 'metadata.google.internal') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return ipv4IsPrivate(host);
  if (host.includes(':')) return ipv6IsPrivate(host);
  return false;
}

function isPlexDirectHostWithPublicIpv4(hostname) {
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  const match = host.match(/^(\d{1,3}(?:-\d{1,3}){3})\.[a-z0-9-]+\.plex\.direct$/);
  return Boolean(match) && !ipv4IsPrivate(match[1].replaceAll('-', '.'));
}

export function isSafePlexConnectionUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (hostIsBlocked(url.hostname)) return false;

  // Literal public addresses do not need DNS. Plex Direct hostnames are served
  // by Plex's domain and encode the destination IPv4 address in their first
  // label, so an account holder cannot rebind one through their own DNS zone.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':')) return true;
  return isPlexDirectHostWithPublicIpv4(url.hostname);
}
