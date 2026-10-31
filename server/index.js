import { createApp } from "./app.js";

const port = Number(process.env.PORT || 8989);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a valid TCP port.");
  process.exit(1);
}
const app = createApp();
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`BlueClash is listening on http://0.0.0.0:${port}`);
  if (!app.locals.db.prepare("SELECT 1 FROM users WHERE is_admin = 1").get()) {
    console.log("No admin exists yet. Run npm run admin to create one.");
  }
});

function stop() {
  server.close(() => {
    app.locals.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
