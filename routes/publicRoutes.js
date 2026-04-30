const express = require("express");
const {
  getPublicRegistrationOptions,
  registerStudentPublic,
} = require("../controllers/PublicController");

const router = express.Router();

router.get("/registration-options", getPublicRegistrationOptions);
router.post("/student-registration", registerStudentPublic);

module.exports = router;
