import { config } from "@repo/eslint-config/astro";

export default [...config, { ignores: ["dist/**", ".astro/**"] }];
