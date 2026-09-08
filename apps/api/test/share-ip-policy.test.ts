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

test("unwraps a mapped public address and accepts it", () => {
  expect(isPublicUnicast("::ffff:93.184.216.34", 6)).toBe(true);
});

test("refuses anything unparseable", () => {
  expect(isPublicUnicast("not-an-address", 4)).toBe(false);
  expect(isPublicUnicast("", 6)).toBe(false);
});
