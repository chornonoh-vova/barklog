import { parseStatusParam } from "@/features/backlog/status-param";

describe("parseStatusParam", () => {
  it("accepts a backlog status", () => {
    expect(parseStatusParam("waiting")).toBe("waiting");
  });

  it("takes the first value of a repeated param", () => {
    expect(parseStatusParam(["playing"])).toBe("playing");
  });

  it("ignores anything that is not a status", () => {
    expect(parseStatusParam("nope")).toBeUndefined();
    expect(parseStatusParam(undefined)).toBeUndefined();
  });
});
