const express = require("express");
const cors = require("cors");
const senatorRoutes = require("./routes/senatorRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    message: "stock-app-backend is running (senator transactions only)",
  });
});

app.use("/api/senator-transactions", senatorRoutes);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

module.exports = app;
