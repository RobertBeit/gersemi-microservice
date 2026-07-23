const express = require("express");
const cors = require("cors");
const senatorRoutes = require("./routes/senatorRoutes");
const representativeRoutes = require("./routes/representativeRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    message: "stock-app-backend is running (senator and representative transactions)",
  });
});

app.use("/api/senator-transactions", senatorRoutes);
app.use("/api/representative-transactions", representativeRoutes);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

module.exports = app;
