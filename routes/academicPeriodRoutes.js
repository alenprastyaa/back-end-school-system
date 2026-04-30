const express = require("express");
const { verifyToken, checkRole } = require("../middlewares/AuthMiddleware");
const {
  getAcademicPeriods,
  createNewAcademicYear,
  updateExistingAcademicYear,
  activateExistingAcademicYear,
  createNewSemester,
  updateExistingSemester,
  activateExistingSemester,
} = require("../controllers/AcademicPeriodController");

const router = express.Router();

router.use(verifyToken);

router.get("/", checkRole(["ADMIN", "GURU"]), getAcademicPeriods);
router.use(checkRole(["ADMIN"]));

router.post("/years", createNewAcademicYear);
router.put("/years/:id", updateExistingAcademicYear);
router.post("/years/:id/activate", activateExistingAcademicYear);
router.post("/semesters", createNewSemester);
router.put("/semesters/:id", updateExistingSemester);
router.post("/semesters/:id/activate", activateExistingSemester);

module.exports = router;
