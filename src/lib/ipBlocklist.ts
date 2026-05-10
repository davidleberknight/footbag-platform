// Pure IP-blocklist helpers shared by externalUrlValidator and
// httpReachabilityAdapter. Both call sites need to apply the same
// SSRF policy: the validator runs once on submit, the reachability
// adapter re-applies the check at every redirect hop. Keeping the
// predicate in one place prevents drift.
//
// Blocks the IP ranges enumerated in DD §3.17 plus IPv6 equivalents:
//   IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
//   IPv6: ::1, fc00::/7, fe80::/10, and IPv4-mapped ::ffff:a.b.c.d that
//         re-enters an IPv4 blocked range.

import { isIPv4, isIPv6 } from 'node:net';

export function isLiteralIp(hostname: string): boolean {
  return isIPv4(hostname) || isIPv6(hostname);
}

export function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

export function isBlockedIp(address: string): boolean {
  if (isIPv4(address)) return isBlockedIpv4(address);
  if (isIPv6(address)) return isBlockedIpv6(address);
  return false;
}

export function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(o => Number.parseInt(o, 10));
  if (octets.length !== 4 || octets.some(o => Number.isNaN(o))) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isBlockedIpv6(address: string): boolean {
  const bytes = ipv6ToBytes(address);
  if (bytes === null) return false;
  if (bytes.slice(0, 15).every(b => b === 0) && bytes[15] === 1) return true;
  if (bytes[0] === 0xfc || bytes[0] === 0xfd) return true;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  if (
    bytes.slice(0, 10).every(b => b === 0) &&
    bytes[10] === 0xff && bytes[11] === 0xff
  ) {
    const v4 = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    if (isBlockedIpv4(v4)) return true;
  }
  return false;
}

export function ipv6ToBytes(address: string): Uint8Array | null {
  const lower = address.toLowerCase();
  const doubleColonParts = lower.split('::');
  if (doubleColonParts.length > 2) return null;
  let leftStr: string, rightStr: string;
  if (doubleColonParts.length === 2) {
    [leftStr, rightStr] = doubleColonParts;
  } else {
    leftStr = lower;
    rightStr = '';
  }
  const leftGroups = leftStr.length > 0 ? leftStr.split(':') : [];
  const rightGroups = rightStr.length > 0 ? rightStr.split(':') : [];
  const lastRight = rightGroups[rightGroups.length - 1];
  const lastLeft = leftStr === lower ? leftGroups[leftGroups.length - 1] : undefined;
  const trailingV4 = (rightGroups.length > 0 ? lastRight : lastLeft) ?? '';
  if (trailingV4.includes('.')) {
    const v4Octets = trailingV4.split('.').map(o => Number.parseInt(o, 10));
    if (v4Octets.length !== 4 || v4Octets.some(o => Number.isNaN(o) || o < 0 || o > 255)) {
      return null;
    }
    const hi = ((v4Octets[0] << 8) | v4Octets[1]).toString(16);
    const lo = ((v4Octets[2] << 8) | v4Octets[3]).toString(16);
    if (rightGroups.length > 0) {
      rightGroups.splice(-1, 1, hi, lo);
    } else {
      leftGroups.splice(-1, 1, hi, lo);
    }
  }
  const totalGroups = leftGroups.length + rightGroups.length;
  if (totalGroups > 8) return null;
  const fillCount = doubleColonParts.length === 2 ? 8 - totalGroups : 0;
  if (doubleColonParts.length !== 2 && totalGroups !== 8) return null;
  const allGroups = [
    ...leftGroups,
    ...Array(fillCount).fill('0'),
    ...rightGroups,
  ];
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const g = allGroups[i];
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = Number.parseInt(g, 16);
    bytes[i * 2] = (v >> 8) & 0xff;
    bytes[i * 2 + 1] = v & 0xff;
  }
  return bytes;
}
