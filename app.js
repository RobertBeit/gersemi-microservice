const express = require("express");
const cors = require("cors");
const stockRoutes = require("./routes/stockRoutes");
const senatorRoutes = require("./routes/senatorRoutes");
const mlJobRoutes = require("./routes/mlJobRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    message: "stock-app-backend is running",
  });
});

app.use("/api/stocks", stockRoutes);
app.use("/api/senator-transactions", senatorRoutes);
app.use("/api/ml-jobs", mlJobRoutes);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

module.exports = app;
