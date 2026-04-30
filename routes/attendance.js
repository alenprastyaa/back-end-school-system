const express = require("express");
const multer = require("multer");
const { verifyToken, checkRole } = require("../middlewares/AuthMiddleware");
const { CheckIn, CheckOut, GetListAttendance, SendHomeroomEmailAttendanceReports } = require("../controllers/AttendanceController");

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/", verifyToken, upload.single("image"), CheckIn);
router.post("/checkout", verifyToken, CheckOut);
router.get("/", verifyToken, GetListAttendance);
router.post(
  "/report/homeroom-email",
  verifyToken,
  checkRole(["SUPER_ADMIN", "ADMIN"]),
  SendHomeroomEmailAttendanceReports,
);

module.exports = router;
