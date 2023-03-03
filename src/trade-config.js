import { readFile } from "node:fs/promises";

const filePath = new URL("./trade-config.json", import.meta.url);
const contents = await readFile(filePath, { encoding: "utf8" });
const tradeConfig = JSON.parse(contents);

export default tradeConfig;
