const express = require("express");
const { verifyToken, checkRole } = require("../middlewares/AuthMiddleware");
const {
  getSettingsSummary,
  resetAdminScope,
} = require("../controllers/AdminSettingsController");

const router = express.Router();

router.get("/summary", verifyToken, checkRole(["ADMIN"]), getSettingsSummary);
router.post("/reset", verifyToken, checkRole(["ADMIN"]), resetAdminScope);

module.exports = router;
