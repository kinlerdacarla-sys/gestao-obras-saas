import "dotenv/config";
import { createApp } from "./app.js";
import { configuration } from "../../../packages/config/src/index.js";
const app = await createApp();
await app.listen(configuration().PORT, "0.0.0.0");
