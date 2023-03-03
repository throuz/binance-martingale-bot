import { readFile } from "node:fs/promises";

const path =
  process.env.NODE_ENV === "production" ? "./env-prod.json" : "./env-dev.json";
const filePath = new URL(path, import.meta.url);
const contents = await readFile(filePath, { encoding: "utf8" });
const env = JSON.parse(contents);

export default env;
