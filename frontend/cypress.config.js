import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5174",
    supportFile: "cypress/support/e2e.js",
  },
});
