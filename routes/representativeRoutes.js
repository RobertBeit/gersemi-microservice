const express = require("express");
const { getRepresentativeTransactions } = require("../controllers/representativeController");

const router = express.Router();

router.get("/", getRepresentativeTransactions);

module.exports = router;
