require("dotenv").config();
const app = require("./app");
const port = process.env.PORT || 3001;

// Use HTTP for production (Render handles HTTPS), HTTPS for local development
if (process.env.NODE_ENV === "production") {
  app.listen(port, () => {
    console.log(`stock-app-backend listening on http://0.0.0.0:${port}`);
  });
} else {
  // Local development with HTTPS
  const httpsLocalhost = require("https-localhost")();
  httpsLocalhost.getCerts().then((certs) => {
    const https = require("https");
    https.createServer(certs, app).listen(port, () => {
      console.log(`stock-app-backend listening on https://localhost:${port}`);
    });
  }).catch((error) => {
    console.error("Failed to get SSL certificates:", error);
    // Fallback to HTTP if HTTPS fails
    app.listen(port, () => {
      console.log(`stock-app-backend listening on http://localhost:${port} (HTTP fallback)`);
    });
  });
}