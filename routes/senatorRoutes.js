const express = require("express");
const { getSenatorTransactions } = require("../controllers/senatorController");

const router = express.Router();

router.get("/", getSenatorTransactions);

module.exports = router;
