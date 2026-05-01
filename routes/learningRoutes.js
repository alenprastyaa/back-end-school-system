const express = require("express");
const multer = require("multer");
const { verifyToken, checkRole } = require("../middlewares/AuthMiddleware");
const {
  createLearningSubject,
  updateLearningSubject,
  deleteLearningSubject,
  updateLearningSubjectChatIconByTeacher,
  getAdminSubjects,
  getTeacherSubjects,
  getStudentSubjects,
  createLearningMaterial,
  updateLearningMaterial,
  deleteLearningMaterial,
  generateLearningMaterialPptWithAi,
  publishLearningMaterialPptWithAi,
  createLearningQuestionBankItem,
  generateLearningQuestionBankWithAi,
  saveGeneratedLearningQuestionBankItems,
  updateLearningQuestionBankItem,
  deleteLearningQuestionBankItem,
  deleteLearningQuestionBankItemsBulk,
  downloadLearningQuestionBankTemplate,
  importLearningQuestionBankFromDocument,
  getLearningQuestionBank,
  getSubjectMaterials,
  getSubjectChatMessages,
  createSubjectChatMessage,
  markSubjectChatAsRead,
  getLearningChatSummary,
  createLearningAssignment,
  updateLearningAssignmentByTeacher,
  deleteLearningAssignmentByTeacher,
  submitExamPackageByTeacher,
  updateExamRequestByAdmin,
  deleteExamRequestByAdmin,
  getSubjectAssignments,
  getFinalGradeReportForTeacher,
  startLearningQuizAttempt,
  submitLearningAssignment,
  publishExamByAdmin,
  getAssignmentSubmissionsForTeacher,
  recordQuizViolation,
  getQuizAssignmentOverviewForTeacher,
  gradeLearningSubmission,
} = require("../controllers/LearningController");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.use(verifyToken);

router.post("/subjects", checkRole(["ADMIN"]), upload.single("chat_icon"), createLearningSubject);
router.put("/subjects/:id", checkRole(["ADMIN"]), upload.single("chat_icon"), updateLearningSubject);
router.delete("/subjects/:id", checkRole(["ADMIN"]), deleteLearningSubject);
router.get("/subjects/admin", checkRole(["ADMIN"]), getAdminSubjects);
router.get("/subjects/teacher", checkRole(["GURU"]), getTeacherSubjects);
router.get("/subjects/student", checkRole(["SISWA"]), getStudentSubjects);
router.put(
  "/subjects/:subjectId/chat-icon",
  checkRole(["GURU"]),
  upload.single("chat_icon"),
  updateLearningSubjectChatIconByTeacher,
);

router.post(
  "/materials",
  checkRole(["GURU"]),
  upload.single("attachment"),
  createLearningMaterial,
);
router.put(
  "/materials/:materialId",
  checkRole(["GURU"]),
  upload.single("attachment"),
  updateLearningMaterial,
);
router.delete(
  "/materials/:materialId",
  checkRole(["GURU"]),
  deleteLearningMaterial,
);
router.post(
  "/subjects/:subjectId/materials/generate-ai-pptx",
  checkRole(["GURU"]),
  upload.none(),
  generateLearningMaterialPptWithAi,
);
router.post(
  "/subjects/:subjectId/materials/publish-ai-pptx",
  checkRole(["GURU"]),
  upload.none(),
  publishLearningMaterialPptWithAi,
);
router.post(
  "/question-bank",
  checkRole(["GURU"]),
  createLearningQuestionBankItem,
);
router.post(
  "/subjects/:subjectId/question-bank/generate-ai",
  checkRole(["GURU"]),
  generateLearningQuestionBankWithAi,
);
router.post(
  "/subjects/:subjectId/question-bank/save-generated-ai",
  checkRole(["GURU"]),
  saveGeneratedLearningQuestionBankItems,
);
router.post(
  "/subjects/:subjectId/question-bank/bulk-delete",
  checkRole(["GURU"]),
  deleteLearningQuestionBankItemsBulk,
);
router.put(
  "/question-bank/:id",
  checkRole(["GURU"]),
  updateLearningQuestionBankItem,
);
router.delete(
  "/question-bank/:id",
  checkRole(["GURU"]),
  deleteLearningQuestionBankItem,
);
router.get(
  "/subjects/:subjectId/question-bank/template",
  checkRole(["GURU"]),
  downloadLearningQuestionBankTemplate,
);
router.post(
  "/subjects/:subjectId/question-bank/import",
  checkRole(["GURU"]),
  upload.single("document"),
  importLearningQuestionBankFromDocument,
);
router.get(
  "/subjects/:subjectId/question-bank",
  checkRole(["GURU", "ADMIN"]),
  getLearningQuestionBank,
);
router.get(
  "/chat/summary",
  checkRole(["GURU", "SISWA"]),
  getLearningChatSummary,
);
router.get(
  "/subjects/:subjectId/materials",
  checkRole(["GURU", "SISWA"]),
  getSubjectMaterials,
);
router.get(
  "/subjects/:subjectId/chat",
  checkRole(["GURU", "SISWA"]),
  getSubjectChatMessages,
);
router.post(
  "/subjects/:subjectId/chat",
  checkRole(["GURU", "SISWA"]),
  upload.single("attachment"),
  createSubjectChatMessage,
);
router.post(
  "/subjects/:subjectId/chat/read",
  checkRole(["GURU", "SISWA"]),
  markSubjectChatAsRead,
);

router.post(
  "/assignments",
  checkRole(["GURU", "ADMIN"]),
  upload.single("attachment"),
  createLearningAssignment,
);
router.put(
  "/assignments/:assignmentId",
  checkRole(["GURU"]),
  upload.single("attachment"),
  updateLearningAssignmentByTeacher,
);
router.delete(
  "/assignments/:assignmentId",
  checkRole(["GURU"]),
  deleteLearningAssignmentByTeacher,
);
router.post(
  "/assignments/:assignmentId/exam-package",
  checkRole(["GURU"]),
  submitExamPackageByTeacher,
);
router.put(
  "/assignments/:assignmentId/exam-admin",
  checkRole(["ADMIN"]),
  upload.none(),
  updateExamRequestByAdmin,
);
router.delete(
  "/assignments/:assignmentId/exam-admin",
  checkRole(["ADMIN"]),
  deleteExamRequestByAdmin,
);
router.post(
  "/assignments/:assignmentId/publish",
  checkRole(["ADMIN"]),
  publishExamByAdmin,
);
router.get(
  "/subjects/:subjectId/assignments",
  checkRole(["GURU", "SISWA", "ADMIN"]),
  getSubjectAssignments,
);
router.get(
  "/subjects/:subjectId/final-report",
  checkRole(["GURU"]),
  getFinalGradeReportForTeacher,
);
router.post(
  "/assignments/:assignmentId/start",
  checkRole(["SISWA"]),
  startLearningQuizAttempt,
);
router.post(
  "/assignments/:assignmentId/submit",
  checkRole(["SISWA"]),
  upload.single("attachment"),
  submitLearningAssignment,
);
router.post(
  "/assignments/:assignmentId/violations",
  checkRole(["SISWA"]),
  recordQuizViolation,
);
router.get(
  "/assignments/:assignmentId/submissions",
  checkRole(["GURU"]),
  getAssignmentSubmissionsForTeacher,
);
router.get(
  "/assignments/:assignmentId/overview",
  checkRole(["GURU"]),
  getQuizAssignmentOverviewForTeacher,
);
router.post(
  "/submissions/:submissionId/grade",
  checkRole(["GURU"]),
  gradeLearningSubmission,
);

module.exports = router;
