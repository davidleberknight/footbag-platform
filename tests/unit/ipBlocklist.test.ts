import { describe, it, expect } from 'vitest';
import {
  isLiteralIp,
  isBlockedIp,
  isBlockedIpv4,
  isBlockedIpv6,
  stripIpv6Brackets,
  ipv6ToBytes,
} from '../../src/lib/ipBlocklist';

describe('ipBlocklist', () => {
  describe('isLiteralIp', () => {
    it('recognizes IPv4 literals', () => {
      expect(isLiteralIp('1.2.3.4')).toBe(true);
      expect(isLiteralIp('255.255.255.255')).toBe(true);
    });
    it('recognizes IPv6 literals', () => {
      expect(isLiteralIp('::1')).toBe(true);
      expect(isLiteralIp('2001:db8::1')).toBe(true);
    });
    it('rejects hostnames', () => {
      expect(isLiteralIp('example.com')).toBe(false);
      expect(isLiteralIp('localhost')).toBe(false);
    });
    it('rejects malformed input', () => {
      expect(isLiteralIp('999.999.999.999')).toBe(false);
      expect(isLiteralIp('not-an-ip')).toBe(false);
    });
  });

  describe('stripIpv6Brackets', () => {
    it('strips outer brackets', () => {
      expect(stripIpv6Brackets('[::1]')).toBe('::1');
      expect(stripIpv6Brackets('[2001:db8::1]')).toBe('2001:db8::1');
    });
    it('passes through unbracketed input', () => {
      expect(stripIpv6Brackets('::1')).toBe('::1');
      expect(stripIpv6Brackets('example.com')).toBe('example.com');
    });
  });

  describe('isBlockedIpv4', () => {
    it('blocks 10.0.0.0/8', () => {
      expect(isBlockedIpv4('10.0.0.1')).toBe(true);
      expect(isBlockedIpv4('10.255.255.255')).toBe(true);
    });
    it('blocks 172.16.0.0/12', () => {
      expect(isBlockedIpv4('172.16.0.1')).toBe(true);
      expect(isBlockedIpv4('172.31.255.255')).toBe(true);
    });
    it('does not block 172.15.x and 172.32.x', () => {
      expect(isBlockedIpv4('172.15.0.1')).toBe(false);
      expect(isBlockedIpv4('172.32.0.1')).toBe(false);
    });
    it('blocks 192.168.0.0/16', () => {
      expect(isBlockedIpv4('192.168.1.1')).toBe(true);
    });
    it('blocks 127.0.0.0/8 loopback', () => {
      expect(isBlockedIpv4('127.0.0.1')).toBe(true);
      expect(isBlockedIpv4('127.255.255.255')).toBe(true);
    });
    it('blocks 169.254.0.0/16 link-local', () => {
      expect(isBlockedIpv4('169.254.169.254')).toBe(true);
    });
    it('does not block 169.255.x', () => {
      expect(isBlockedIpv4('169.255.0.1')).toBe(false);
    });
    it('passes public addresses', () => {
      expect(isBlockedIpv4('8.8.8.8')).toBe(false);
      expect(isBlockedIpv4('1.1.1.1')).toBe(false);
    });
    it('rejects malformed', () => {
      expect(isBlockedIpv4('not.an.ip.addr')).toBe(false);
    });
  });

  describe('isBlockedIpv6', () => {
    it('blocks ::1 loopback', () => {
      expect(isBlockedIpv6('::1')).toBe(true);
    });
    it('blocks fc00::/7 unique local', () => {
      expect(isBlockedIpv6('fc00::1')).toBe(true);
      expect(isBlockedIpv6('fd12:3456::1')).toBe(true);
    });
    it('blocks fe80::/10 link-local', () => {
      expect(isBlockedIpv6('fe80::1')).toBe(true);
      expect(isBlockedIpv6('feb0::1')).toBe(true);
    });
    it('does not block fec0::', () => {
      expect(isBlockedIpv6('fec0::1')).toBe(false);
    });
    it('blocks IPv4-mapped private addresses', () => {
      expect(isBlockedIpv6('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedIpv6('::ffff:169.254.169.254')).toBe(true);
      expect(isBlockedIpv6('::ffff:10.0.0.1')).toBe(true);
    });
    it('does not block IPv4-mapped public addresses', () => {
      expect(isBlockedIpv6('::ffff:8.8.8.8')).toBe(false);
    });
    it('passes public IPv6', () => {
      expect(isBlockedIpv6('2001:db8::1')).toBe(false);
    });
  });

  describe('isBlockedIp dispatch', () => {
    it('routes IPv4 to v4 blocklist', () => {
      expect(isBlockedIp('127.0.0.1')).toBe(true);
      expect(isBlockedIp('8.8.8.8')).toBe(false);
    });
    it('routes IPv6 to v6 blocklist', () => {
      expect(isBlockedIp('::1')).toBe(true);
      expect(isBlockedIp('2001:db8::1')).toBe(false);
    });
    it('returns false for non-IP input', () => {
      expect(isBlockedIp('example.com')).toBe(false);
    });
  });

  describe('ipv6ToBytes', () => {
    it('parses :: shorthand', () => {
      const bytes = ipv6ToBytes('::1');
      expect(bytes).not.toBeNull();
      expect(bytes![15]).toBe(1);
      expect(Array.from(bytes!.slice(0, 15)).every(b => b === 0)).toBe(true);
    });
    it('parses full form', () => {
      const bytes = ipv6ToBytes('2001:0db8:0000:0000:0000:0000:0000:0001');
      expect(bytes).not.toBeNull();
      expect(bytes![0]).toBe(0x20);
      expect(bytes![1]).toBe(0x01);
      expect(bytes![15]).toBe(1);
    });
    it('parses IPv4-mapped form', () => {
      const bytes = ipv6ToBytes('::ffff:127.0.0.1');
      expect(bytes).not.toBeNull();
      expect(bytes![10]).toBe(0xff);
      expect(bytes![11]).toBe(0xff);
      expect(bytes![12]).toBe(127);
      expect(bytes![15]).toBe(1);
    });
    it('rejects multiple ::', () => {
      expect(ipv6ToBytes('::1::2')).toBeNull();
    });
    it('rejects too many groups', () => {
      expect(ipv6ToBytes('1:2:3:4:5:6:7:8:9')).toBeNull();
    });
  });
});
