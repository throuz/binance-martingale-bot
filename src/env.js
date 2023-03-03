import { readFile } from "node:fs/promises";

const filePath =
  process.env.NODE_ENV === "production" ? "env-prod.json" : "env-dev.json";
const contents = await readFile(filePath);
const env = JSON.parse(contents);

export default env;
