import { expect, test } from "vitest";

import { isPublicUnicast } from "../src/share/ip-policy.js";

test.each([
  ["93.184.216.34", 4],
  ["1.1.1.1", 4],
  ["2606:4700:4700::1111", 6],
] as const)("accepts public %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(true);
});

test.each([
  ["0.0.0.1", 4],
  ["10.1.2.3", 4],
  ["100.64.0.1", 4],
  ["127.0.0.1", 4],
  ["169.254.169.254", 4],
  ["172.16.0.1", 4],
  ["172.31.255.255", 4],
  ["192.0.0.1", 4],
  ["192.168.1.1", 4],
  ["198.18.0.1", 4],
  ["224.0.0.1", 4],
  ["240.0.0.1", 4],
  ["255.255.255.255", 4],
] as const)("refuses ipv4 %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

test.each([
  ["::", 6],
  ["::1", 6],
  ["fc00::1", 6],
  ["fd12:3456::1", 6],
  ["fe80::1", 6],
  ["ff02::1", 6],
] as const)("refuses ipv6 %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

// The bypass that matters: loopback wearing an IPv6 hat.
test.each([
  ["::ffff:127.0.0.1", 6],
  ["::ffff:10.0.0.5", 6],
  ["::ffff:7f00:1", 6],
  ["64:ff9b::127.0.0.1", 6],
  ["64:ff9b::a00:5", 6],
] as const)("unwraps and refuses %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

// Round 2 policy change: ::ffff:0:0/96 sits outside 2000::/3, so it is refused
// outright rather than unwrapped, even though the wrapped v4 is public. This
// is what closes the embedding class for good instead of chasing every new
// RFC's transition prefix (see fix-brief-round2.md).
test("refuses an ipv4-mapped address even though the wrapped v4 is public", () => {
  expect(isPublicUnicast("::ffff:93.184.216.34", 6)).toBe(false);
});

test("refuses anything unparseable", () => {
  expect(isPublicUnicast("not-an-address", 4)).toBe(false);
  expect(isPublicUnicast("", 6)).toBe(false);
});

test.each([
  ["0::ffff:127.0.0.1", 6],
  ["0:0:0:0:0:ffff:127.0.0.1", 6],
  ["0:0:0:0:0:ffff:7f00:1", 6],
  ["::127.0.0.1", 6],
  ["::10.0.0.5", 6],
  ["0:0:0:0:0:0:7f00:1", 6],
  ["64:ff9b:0:0:0:0:a00:5", 6],
  ["2002:7f00:0001::", 6],
  ["2002:0a00:0005::", 6],
  ["2002:a9fe:a9fe::", 6],
] as const)("refuses embedded ipv4 whatever the spelling: %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

test.each([
  ["192.0.2.1", 4],
  ["198.51.100.1", 4],
  ["203.0.113.1", 4],
] as const)("refuses documentation range %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

test.each([
  ["2002:5db8:d822::", 6],
  ["2606:4700:4700::1111", 6],
] as const)("still accepts public addresses however spelled: %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(true);
});

// These are ipv4-mapped forms, not global unicast (see round-2 policy change
// above): they are refused outright regardless of the wrapped v4.
test.each([
  ["::ffff:93.184.216.34", 6],
  ["0:0:0:0:0:ffff:5db8:d822", 6],
] as const)("refuses ipv4-mapped forms even when the wrapped v4 is public: %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

test.each([
  ["::ffff:0:127.0.0.1", 6],
  ["::ffff:0:10.0.0.5", 6],
  ["0:0:0:0:ffff:0:127.0.0.1", 6],
  ["::FfFf:0:127.0.0.1", 6],
  ["::ffff:0:7f00:1", 6],
  ["64:ff9b:1::7f00:1", 6],
  ["2001:0:1234::1", 6],
  ["2001:db8::1", 6],
  ["100::1", 6],
  ["4000::1", 6],
  ["8000::1", 6],
  ["::2", 6],
] as const)("refuses everything outside global unicast: %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

test.each([
  ["2606:4700:4700::1111", 6],
  ["2001:4860:4860::8888", 6],
  ["2002:5db8:d822::", 6],
  ["2400:cb00::1", 6],
  ["3fff::1", 6],
] as const)("accepts global unicast: %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(true);
});
