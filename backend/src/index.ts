import { createServer } from "./server";
import { config } from "./config";


const app = createServer();
app.listen(config.port, () => {
console.log(`API running on http://localhost:${config.port}`);
});