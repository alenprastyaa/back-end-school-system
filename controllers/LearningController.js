const fs = require("fs");
const { getClassById } = require("../models/ClassModel");
const { getUsersByRoleAndSchool, getStudentById, getStudentsByClass } = require("../models/UserModel");
const { uploadImage } = require("../utils/upload");
const { successResponse, errorResponse } = require("../utils/response");
const {
  buildQuestionBankTemplate,
  extractTextFromDocument,
  parseQuestionBankDocument,
} = require("../utils/questionBankDocument");
const { generateQuestionBankItemsWithOpenRouter } = require("../services/openRouterQuestionBankService");
const { generatePowerPointOutlineWithOpenRouter } = require("../services/openRouterPptService");
const { buildPowerPointMaterialFile } = require("../services/pptxMaterialService");
const {
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectById,
  getSubjectsBySchool,
  getSubjectsByTeacher,
  getSubjectsByStudent,
  createMaterial,
  getMaterialById,
  updateMaterial,
  deleteMaterialById,
  createQuestionBankItem,
  createQuestionBankItemsBulk,
  getQuestionBankItemById,
  updateQuestionBankItem,
  deleteQuestionBankItem,
  deleteQuestionBankItemsBulk,
  getQuestionBankBySubject,
  getQuestionBankItemsByIds,
  getMaterialsBySubject,
  getChatMessagesBySubject,
  createChatMessage,
  markChatSubjectAsRead,
  getChatUnreadSummaryBySubjectIds,
  createAssignment,
  updateTeacherAssignment,
  getExamAssignmentByCode,
  updateExamAssignmentByAdmin,
  countSubmittedOrStartedSubmissionsByAssignment,
  deleteExamAssignmentByAdmin,
  deleteTeacherAssignmentById,
  createManualSubmissions,
  submitExamPackage,
  publishExamAssignment,
  getAssignmentById,
  getAssignmentsBySubjectForTeacher,
  getAssignmentsBySubjectForStudent,
  getAssignmentsForFinalReport,
  upsertSubmission,
  startQuizSubmissionAttempt,
  upsertQuizSubmission,
  getSubmissionsByAssignment,
  getSubmissionsByAssignmentIds,
  getSubmissionByAssignmentAndStudent,
  createQuizViolationLog,
  getQuizViolationSummaryByAssignment,
  gradeSubmission,
  getSubmissionById,
} = require("../models/LearningModel");
const { getActiveAcademicPeriod, getAcademicYearsBySchool } = require("../models/AcademicPeriodModel");
const { getIo, getLearningSubjectRoom, getUserNotificationRoom } = require("../utils/socket");

const emitNotificationToUsers = (userIds = [], payload = {}) => {
  const io = getIo();
  if (!io) {
    return;
  }

  const uniqueUserIds = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((item) => Number(item))
      .filter(Number.isInteger),
  )];

  uniqueUserIds.forEach((userId) => {
    io.to(getUserNotificationRoom(userId)).emit("learning-notification:new", {
      created_at: new Date().toISOString(),
      ...payload,
    });
  });
};

const normalizeExternalUrl = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol === "http:" && ["alentest.my.id", "school-system.my.id"].includes(parsed.hostname)) {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch (error) {
    return rawValue;
  }
};

const removeLocalUpload = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const uploadOptionalAttachment = async (file) => {
  if (!file) {
    return null;
  }

  const uploadedUrl = await uploadImage(file);
  removeLocalUpload(file.path);
  return uploadedUrl;
};

const resolveAttachmentPayload = async (req, fieldName = "attachment") => {
  const directUrl = normalizeExternalUrl(req.body?.[`${fieldName}_url`] || req.body?.attachment_url);
  if (directUrl) {
    return {
      attachmentUrl: directUrl,
      attachmentName: String(req.body?.[`${fieldName}_name`] || req.body?.attachment_name || "").trim() || null,
      attachmentMimeType: String(req.body?.[`${fieldName}_mime_type`] || req.body?.attachment_mime_type || "").trim() || null,
      attachmentSize: Number(req.body?.[`${fieldName}_size`] || req.body?.attachment_size) || null,
      source: "direct",
    };
  }

  const uploadedUrl = await uploadOptionalAttachment(req.file);
  return {
    attachmentUrl: uploadedUrl,
    attachmentName: req.file?.originalname || null,
    attachmentMimeType: req.file?.mimetype || null,
    attachmentSize: req.file?.size || null,
    source: req.file ? "backend-upload" : "none",
  };
};

const ensureTeacherInSchool = async (schoolId, teacherId) => {
  const teachers = await getUsersByRoleAndSchool(schoolId, "GURU");
  return teachers.find((item) => item.id === Number(teacherId));
};

const ensureSubjectAccess = async ({ subjectId, schoolId, userRole, userId, classId }) => {
  const subject = await getSubjectById(subjectId);

  if (!subject || Number(subject.school_id) !== Number(schoolId)) {
    return { error: { status: 404, message: "Subject not found" } };
  }

  if (userRole === "GURU" && Number(subject.teacher_id) !== Number(userId)) {
    return { error: { status: 403, message: "Forbidden subject access" } };
  }

  if (userRole === "SISWA" && Number(subject.class_id) !== Number(classId)) {
    return { error: { status: 403, message: "Forbidden subject access" } };
  }

  return { subject };
};

const normalizeAssignmentType = (value) => {
  const type = String(value || "FILE").toUpperCase();
  return ["FILE", "MCQ", "ESSAY", "MANUAL"].includes(type) ? type : null;
};

const normalizeExamCategory = (value) => {
  const category = String(value || "").trim().toUpperCase();
  return ["UTS", "UAS", "UJIAN_SEKOLAH", "CUSTOM"].includes(category) ? category : null;
};

const normalizeExamStatus = (value) => {
  const status = String(value || "").trim().toUpperCase();
  return ["REQUESTED", "SUBMITTED", "PUBLISHED"].includes(status) ? status : null;
};

const parseQuizPayload = (assignmentType, rawPayload) => {
  if (assignmentType === "FILE") {
    return null;
  }

  const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("Quiz questions are required");
  }

  return payload.map((item, index) => {
    const question = String(item.question || "").trim();
    if (!question) {
      throw new Error(`Question ${index + 1} is required`);
    }

    if (assignmentType === "MCQ") {
      const options = Array.isArray(item.options)
        ? item.options.map((option) => String(option || "").trim()).filter(Boolean)
        : [];

      const correctOption = Number(item.correct_option);
      if (options.length < 2) {
        throw new Error(`MCQ question ${index + 1} must have at least 2 options`);
      }

      if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption >= options.length) {
        throw new Error(`MCQ question ${index + 1} must have a valid correct option`);
      }

      return {
        question,
        options,
        correct_option: correctOption,
      };
    }

    return {
      question,
      rubric: item.rubric ? String(item.rubric) : null,
    };
  });
};

const buildQuizPayloadFromBankItems = (assignmentType, items) =>
  items.map((item) => {
    if (assignmentType === "MCQ") {
      return {
        question: item.question_text,
        options: item.options || [],
        correct_option: item.correct_option,
        bank_question_id: item.id,
      };
    }

    return {
      question: item.question_text,
      rubric: item.rubric || null,
      bank_question_id: item.id,
    };
  });

const shuffleArray = (items = []) => {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
};

const parseStudentAnswers = (assignmentType, rawAnswers, quizPayload) => {
  if (assignmentType === "FILE") {
    return null;
  }

  const answers = typeof rawAnswers === "string" ? JSON.parse(rawAnswers) : rawAnswers;
  if (!Array.isArray(answers)) {
    throw new Error("Answers must be an array");
  }

  if (answers.length !== quizPayload.length) {
    throw new Error("Answers count does not match questions");
  }

  return answers.map((answer, index) => {
    if (assignmentType === "MCQ") {
      const selectedOptionRaw = answer?.selected_option;
      if (selectedOptionRaw === null || selectedOptionRaw === undefined || selectedOptionRaw === "") {
        return { selected_option: null };
      }

      const selectedOption = Number(selectedOptionRaw);
      const optionCount = Array.isArray(quizPayload[index]?.options) ? quizPayload[index].options.length : 0;
      if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption >= optionCount) {
        throw new Error(`Answer for question ${index + 1} is invalid`);
      }

      return { selected_option: selectedOption };
    }

    return {
      answer_text: String(answer.answer_text || "").trim(),
    };
  });
};

const calculateMcqScore = (quizPayload, answers) => {
  let correctCount = 0;

  quizPayload.forEach((question, index) => {
    const selectedOption = answers[index]?.selected_option;
    if (Number.isInteger(selectedOption) && Number(question.correct_option) === selectedOption) {
      correctCount += 1;
    }
  });

  return Number(((correctCount / quizPayload.length) * 100).toFixed(2));
};

const getQuizDurationWindowMs = (assignment) => {
  const configuredSeconds = Number(assignment?.question_duration_seconds || 0);
  if (configuredSeconds <= 0) {
    return 0;
  }

  if (assignment?.is_exam) {
    return configuredSeconds * 1000;
  }

  const questionCount = Array.isArray(assignment?.quiz_payload) ? assignment.quiz_payload.length : 0;
  if (questionCount <= 0) {
    return 0;
  }

  return questionCount * configuredSeconds * 1000;
};

const createLearningSubject = async (req, res) => {
  try {
    const { class_id, teacher_id, name, description } = req.body;

    if (!class_id || !teacher_id || !name) {
      return errorResponse(res, 400, "class_id, teacher_id, and name are required");
    }

    const currentClass = await getClassById(class_id);
    if (!currentClass || Number(currentClass.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Class not found");
    }

    const teacher = await ensureTeacherInSchool(req.schoolId, teacher_id);
    if (!teacher) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "Selected teacher is invalid");
    }

    const chatIconUrl = await uploadOptionalAttachment(req.file);

    const subject = await createSubject(
      req.schoolId,
      class_id,
      teacher_id,
      name,
      description,
      chatIconUrl,
    );

    return successResponse(res, 201, "Success Create Subject", subject);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Create Subject", error.message);
  }
};

const updateLearningSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await getSubjectById(id);

    if (!subject || Number(subject.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Subject not found");
    }

    const nextClassId = req.body.class_id ?? subject.class_id;
    const nextTeacherId = req.body.teacher_id ?? subject.teacher_id;

    const currentClass = await getClassById(nextClassId);
    if (!currentClass || Number(currentClass.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Class not found");
    }

    const teacher = await ensureTeacherInSchool(req.schoolId, nextTeacherId);
    if (!teacher) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "Selected teacher is invalid");
    }

    const nextChatIconUrl = req.file
      ? await uploadOptionalAttachment(req.file)
      : subject.chat_icon_url ?? null;

    const updatedSubject = await updateSubject(
      id,
      req.schoolId,
      nextClassId,
      nextTeacherId,
      req.body.name ?? subject.name,
      req.body.description ?? subject.description,
      nextChatIconUrl,
    );

    return successResponse(res, 200, "Success Update Subject", updatedSubject);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Update Subject", error.message);
  }
};

const deleteLearningSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await getSubjectById(id);

    if (!subject || Number(subject.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Subject not found");
    }

    const deletedSubject = await deleteSubject(id, req.schoolId);
    return successResponse(res, 200, "Success Delete Subject", deletedSubject);
  } catch (error) {
    return errorResponse(res, 500, "Failed Delete Subject", error.message);
  }
};

const updateLearningSubjectChatIconByTeacher = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, access.error.status, access.error.message);
    }

    if (!req.file) {
      return errorResponse(res, 400, "chat_icon is required");
    }

    const chatIconUrl = await uploadOptionalAttachment(req.file);
    const updatedSubject = await updateSubject(
      access.subject.id,
      req.schoolId,
      access.subject.class_id,
      access.subject.teacher_id,
      access.subject.name,
      access.subject.description,
      chatIconUrl,
    );

    return successResponse(res, 200, "Success Update Subject Chat Icon", updatedSubject);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Update Subject Chat Icon", error.message);
  }
};

const getAdminSubjects = async (req, res) => {
  try {
    const subjects = await getSubjectsBySchool(req.schoolId);
    return successResponse(res, 200, "Success Get Subjects", subjects);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Subjects", error.message);
  }
};

const getTeacherSubjects = async (req, res) => {
  try {
    const subjects = await getSubjectsByTeacher(req.schoolId, req.userId);
    return successResponse(res, 200, "Success Get Teacher Subjects", subjects);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Teacher Subjects", error.message);
  }
};

const getStudentSubjects = async (req, res) => {
  try {
    const student = await getStudentById(req.userId);
    if (!student || !student.class_id) {
      return errorResponse(res, 404, "Student class not found");
    }

    const subjects = await getSubjectsByStudent(req.schoolId, student.class_id);
    return successResponse(res, 200, "Success Get Student Subjects", subjects);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Student Subjects", error.message);
  }
};

const createLearningMaterial = async (req, res) => {
  try {
    const { subject_id, title, content } = req.body;

    if (!subject_id || !title) {
      return errorResponse(res, 400, "subject_id and title are required");
    }

    const access = await ensureSubjectAccess({
      subjectId: subject_id,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, access.error.status, access.error.message);
    }

    const { attachmentUrl } = await resolveAttachmentPayload(req);
    const material = await createMaterial(
      subject_id,
      title,
      content,
      attachmentUrl,
      req.userId,
    );

    return successResponse(res, 201, "Success Create Material", material);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Create Material", error.message);
  }
};

const updateLearningMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const currentMaterial = await getMaterialById(materialId);

    if (!currentMaterial || Number(currentMaterial.school_id) !== Number(req.schoolId)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 404, "Material not found");
    }

    if (Number(currentMaterial.teacher_id) !== Number(req.userId)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 403, "Forbidden material access");
    }

    const nextTitle = String(req.body?.title || currentMaterial.title || "").trim();
    if (!nextTitle) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "title is required");
    }

    let attachmentUrl = currentMaterial.attachment_url || null;
    if (String(req.body?.remove_attachment || "").toLowerCase() === "true") {
      attachmentUrl = null;
    } else {
      const attachmentPayload = await resolveAttachmentPayload(req);
      if (attachmentPayload.attachmentUrl) {
        attachmentUrl = attachmentPayload.attachmentUrl;
      }
    }

    const material = await updateMaterial(materialId, {
      title: nextTitle,
      content: req.body?.content ?? currentMaterial.content ?? "",
      attachmentUrl,
    });

    return successResponse(res, 200, "Success Update Material", material);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Update Material", error.message);
  }
};

const deleteLearningMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const currentMaterial = await getMaterialById(materialId);

    if (!currentMaterial || Number(currentMaterial.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Material not found");
    }

    if (Number(currentMaterial.teacher_id) !== Number(req.userId)) {
      return errorResponse(res, 403, "Forbidden material access");
    }

    const deletedMaterial = await deleteMaterialById(materialId);
    return successResponse(res, 200, "Success Delete Material", deletedMaterial);
  } catch (error) {
    return errorResponse(res, 500, "Failed Delete Material", error.message);
  }
};

const generateLearningMaterialPptWithAi = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const {
      title,
      topic,
      content,
      learning_goals,
      additional_instructions,
      slide_count,
    } = req.body || {};

    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const normalizedTitle = String(title || "").trim();
    const normalizedTopic = String(topic || "").trim();
    if (!normalizedTitle) {
      return errorResponse(res, 400, "title is required");
    }

    if (!normalizedTopic) {
      return errorResponse(res, 400, "topic is required");
    }

    const normalizedSlideCount = Number(slide_count);
    if (!Number.isInteger(normalizedSlideCount) || normalizedSlideCount < 3 || normalizedSlideCount > 15) {
      return errorResponse(res, 400, "slide_count must be between 3 and 15");
    }

    const outline = await generatePowerPointOutlineWithOpenRouter({
      subjectName: access.subject.name,
      className: access.subject.class_name,
      topic: normalizedTopic,
      materialTitle: normalizedTitle,
      slideCount: normalizedSlideCount,
      teacherSummary: String(content || "").trim(),
      learningGoals: String(learning_goals || "").trim(),
      additionalInstructions: String(additional_instructions || "").trim(),
    });

    return successResponse(res, 200, "Success Generate AI PowerPoint Preview", {
      presentation_title: outline.presentationTitle || normalizedTitle,
      summary: outline.summary,
      slides_total: outline.slides.length,
      slides: outline.slides,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Generate AI PowerPoint Preview", error.message);
  }
};

const normalizeAiPresentationSlides = (slides, fallbackTitle = "Slide") =>
  (Array.isArray(slides) ? slides : [])
    .map((slide, index) => {
      const title = String(slide?.title || "").trim() || `${fallbackTitle} ${index + 1}`;
      const bullets = Array.isArray(slide?.bullets)
        ? slide.bullets.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
        : [];

      if (!bullets.length) {
        return null;
      }

      return {
        title,
        bullets,
        speaker_notes: String(slide?.speaker_notes || "").trim() || null,
      };
    })
    .filter(Boolean);

const publishLearningMaterialPptWithAi = async (req, res) => {
  let generatedFile = null;

  try {
    const { subjectId } = req.params;
    const {
      title,
      content,
      presentation_title,
      slides,
    } = req.body || {};

    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) {
      return errorResponse(res, 400, "title is required");
    }

    const normalizedSlides = normalizeAiPresentationSlides(slides, presentation_title || normalizedTitle);
    if (normalizedSlides.length === 0) {
      return errorResponse(res, 400, "slides preview is required");
    }

    generatedFile = await buildPowerPointMaterialFile({
      presentationTitle: String(presentation_title || normalizedTitle).trim() || normalizedTitle,
      subtitle: `${access.subject.name} • ${access.subject.class_name}`,
      subjectName: access.subject.name,
      className: access.subject.class_name,
      slides: normalizedSlides,
      outputDir: "uploads",
    });

    const attachmentUrl = await uploadImage({
      path: generatedFile.outputPath,
      originalname: generatedFile.fileName,
      mimetype: generatedFile.mimeType,
    });
    removeLocalUpload(generatedFile.outputPath);
    generatedFile = null;

    const material = await createMaterial(
      Number(subjectId),
      normalizedTitle,
      String(content || "").trim() || `Materi PowerPoint untuk ${access.subject.name}`,
      attachmentUrl,
      req.userId,
    );

    return successResponse(res, 201, "Success Publish AI PowerPoint Material", {
      material,
      slides_total: normalizedSlides.length,
      attachment_url: attachmentUrl,
    });
  } catch (error) {
    if (generatedFile?.outputPath) {
      removeLocalUpload(generatedFile.outputPath);
    }

    return errorResponse(res, 500, "Failed Publish AI PowerPoint Material", error.message);
  }
};

const getSubjectMaterials = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const student = req.userRole === "SISWA" ? await getStudentById(req.userId) : null;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
      classId: student?.class_id,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const materials = await getMaterialsBySubject(subjectId);
    return successResponse(res, 200, "Success Get Materials", materials);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Materials", error.message);
  }
};

const getSubjectChatMessages = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const student = req.userRole === "SISWA" ? await getStudentById(req.userId) : null;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
      classId: student?.class_id,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const messages = await getChatMessagesBySubject(subjectId, req.userId, req.query.limit);
    return successResponse(res, 200, "Success Get Chat Messages", messages);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Chat Messages", error.message);
  }
};

const createSubjectChatMessage = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const message = String(req.body.message || "").trim();
    const student = req.userRole === "SISWA" ? await getStudentById(req.userId) : null;

    if (!message && !req.file && !req.body?.attachment_url) {
      return errorResponse(res, 400, "message or attachment is required");
    }

    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
      classId: student?.class_id,
    });

    if (access.error) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, access.error.status, access.error.message);
    }

    const attachmentPayload = await resolveAttachmentPayload(req);
    const attachmentUrl = attachmentPayload.attachmentUrl;
    let messageType = "TEXT";

    if (attachmentUrl) {
      const mimeType = String(
        attachmentPayload.attachmentMimeType
        || req.body?.attachment_mime_type
        || req.body?.mime_type
        || req.body?.message_mime_type
        || "",
      ).toLowerCase();
      if (mimeType.startsWith("audio/")) {
        messageType = "VOICE";
      } else if (mimeType.startsWith("image/")) {
        messageType = "IMAGE";
      } else if (mimeType === "application/pdf") {
        messageType = "PDF";
      } else {
        messageType = "FILE";
      }
    }

    const chatMessage = await createChatMessage(subjectId, req.userId, {
      message,
      messageType,
      attachmentUrl,
      attachmentName: attachmentPayload.attachmentName,
      attachmentMimeType: attachmentPayload.attachmentMimeType,
      attachmentSize: attachmentPayload.attachmentSize,
    });
    const io = getIo();
    if (io) {
      io.to(getLearningSubjectRoom(subjectId)).emit("learning-chat:new-message", chatMessage);
    }

    return successResponse(res, 201, "Success Create Chat Message", chatMessage);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Create Chat Message", error.message);
  }
};

const markSubjectChatAsRead = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const lastMessageId = Number(req.body.last_message_id) || 0;
    const student = req.userRole === "SISWA" ? await getStudentById(req.userId) : null;

    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
      classId: student?.class_id,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const readState = await markChatSubjectAsRead(subjectId, req.userId, lastMessageId);
    const io = getIo();
    if (io) {
      io.to(getLearningSubjectRoom(subjectId)).emit("learning-chat:read-updated", readState);
    }

    return successResponse(res, 200, "Success Mark Chat As Read", readState);
  } catch (error) {
    return errorResponse(res, 500, "Failed Mark Chat As Read", error.message);
  }
};

const getLearningChatSummary = async (req, res) => {
  try {
    let subjects = [];

    if (req.userRole === "GURU") {
      subjects = await getSubjectsByTeacher(req.schoolId, req.userId);
    } else if (req.userRole === "SISWA") {
      const student = await getStudentById(req.userId);
      if (!student || !student.class_id) {
        return errorResponse(res, 404, "Student class not found");
      }
      subjects = await getSubjectsByStudent(req.schoolId, student.class_id);
    } else {
      return errorResponse(res, 403, "Forbidden chat summary access");
    }

    const summary = await getChatUnreadSummaryBySubjectIds(
      subjects.map((item) => item.id),
      req.userId,
    );

    return successResponse(res, 200, "Success Get Chat Summary", summary);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Chat Summary", error.message);
  }
};

const createLearningQuestionBankItem = async (req, res) => {
  try {
    const { subject_id, question_type, question_text, options, correct_option, rubric } = req.body;

    if (!subject_id || !question_type || !question_text) {
      return errorResponse(res, 400, "subject_id, question_type, and question_text are required");
    }

    const nextType = normalizeAssignmentType(question_type);
    if (!["MCQ", "ESSAY"].includes(nextType)) {
      return errorResponse(res, 400, "question_type must be Pilihan Ganda atau Uraian");
    }

    const access = await ensureSubjectAccess({
      subjectId: subject_id,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    let parsedOptions = null;
    let parsedCorrectOption = null;

    if (nextType === "MCQ") {
      parsedOptions = typeof options === "string" ? JSON.parse(options) : options;
      parsedOptions = Array.isArray(parsedOptions)
        ? parsedOptions.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      parsedCorrectOption = Number(correct_option);

      if (parsedOptions.length < 2) {
        return errorResponse(res, 400, "MCQ must have at least 2 options");
      }

      if (!Number.isInteger(parsedCorrectOption) || parsedCorrectOption < 0 || parsedCorrectOption >= parsedOptions.length) {
        return errorResponse(res, 400, "MCQ correct_option is invalid");
      }
    }

    const question = await createQuestionBankItem(
      subject_id,
      nextType,
      question_text,
      parsedOptions,
      parsedCorrectOption,
      rubric,
      req.userId,
    );

    return successResponse(res, 201, "Success Create Question Bank Item", question);
  } catch (error) {
    return errorResponse(res, 500, "Failed Create Question Bank Item", error.message);
  }
};

const normalizeAiGeneratedQuestionItems = (items, questionType) => {
  const nextType = normalizeAssignmentType(questionType);
  if (!["MCQ", "ESSAY"].includes(nextType)) {
    return [];
  }

  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const questionText = String(item?.question_text || "").trim();
      if (!questionText) {
        return null;
      }

      if (nextType === "MCQ") {
        const options = Array.isArray(item?.options)
          ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 5)
          : [];
        const correctOption = Number(item?.correct_option);

        if (options.length !== 5 || !Number.isInteger(correctOption) || correctOption < 0 || correctOption > 4) {
          return null;
        }

        return {
          question_type: "MCQ",
          question_text: questionText,
          options,
          correct_option: correctOption,
          rubric: null,
        };
      }

      return {
        question_type: "ESSAY",
        question_text: questionText,
        options: null,
        correct_option: null,
        rubric: String(item?.rubric || "").trim() || "Jawaban dinilai berdasarkan ketepatan konsep, kelengkapan penjelasan, dan kejelasan alasan.",
      };
    })
    .filter(Boolean);
};

const generateLearningQuestionBankWithAi = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const {
      topic,
      question_type,
      question_count,
      difficulty,
      grade_label,
      phase_name,
      curriculum_name,
      additional_instructions,
    } = req.body || {};

    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const nextType = normalizeAssignmentType(question_type);
    if (!["MCQ", "ESSAY"].includes(nextType)) {
      return errorResponse(res, 400, "question_type must be MCQ atau ESSAY");
    }

    const normalizedTopic = String(topic || "").trim();
    if (!normalizedTopic) {
      return errorResponse(res, 400, "topic is required");
    }

    const normalizedCount = Number(question_count);
    if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > 20) {
      return errorResponse(res, 400, "question_count must be between 1 and 20");
    }

    const normalizedDifficulty = String(difficulty || "MENENGAH").trim().toUpperCase();
    if (!["MUDAH", "MENENGAH", "SULIT"].includes(normalizedDifficulty)) {
      return errorResponse(res, 400, "difficulty must be MUDAH, MENENGAH, atau SULIT");
    }

    const generatedItems = await generateQuestionBankItemsWithOpenRouter({
      subjectName: access.subject.name,
      className: access.subject.class_name,
      gradeLabel: String(grade_label || "").trim(),
      phaseName: String(phase_name || "").trim(),
      curriculumName: String(curriculum_name || "").trim(),
      topic: normalizedTopic,
      questionType: nextType,
      questionCount: normalizedCount,
      difficulty: normalizedDifficulty,
      additionalInstructions: String(additional_instructions || "").trim(),
    });

    return successResponse(res, 200, "Success Generate Question Bank Preview", {
      total: generatedItems.length,
      items: generatedItems,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Generate Question Bank With AI", error.message);
  }
};

const saveGeneratedLearningQuestionBankItems = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const {
      question_type,
      items,
    } = req.body || {};

    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const normalizedItems = normalizeAiGeneratedQuestionItems(items, question_type);
    if (normalizedItems.length === 0) {
      return errorResponse(res, 400, "Tidak ada soal AI valid yang dipilih untuk disimpan");
    }

    const createdQuestions = await createQuestionBankItemsBulk(
      Number(subjectId),
      normalizedItems,
      req.userId,
    );

    return successResponse(res, 201, "Success Save Generated Question Bank Items", {
      total: createdQuestions.length,
      items: createdQuestions,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Save Generated Question Bank Items", error.message);
  }
};

const updateLearningQuestionBankItem = async (req, res) => {
  try {
    const { id } = req.params;
    const currentQuestion = await getQuestionBankItemById(id);

    if (!currentQuestion) {
      return errorResponse(res, 404, "Question bank item not found");
    }

    const access = await ensureSubjectAccess({
      subjectId: currentQuestion.subject_id,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const nextType = currentQuestion.question_type;
    const nextQuestionText = String(req.body.question_text || currentQuestion.question_text || "").trim();

    if (!nextQuestionText) {
      return errorResponse(res, 400, "question_text is required");
    }

    let parsedOptions = null;
    let parsedCorrectOption = null;
    let nextRubric = req.body.rubric ?? currentQuestion.rubric ?? null;

    if (nextType === "MCQ") {
      parsedOptions = req.body.options ?? currentQuestion.options ?? [];
      parsedOptions = typeof parsedOptions === "string" ? JSON.parse(parsedOptions) : parsedOptions;
      parsedOptions = Array.isArray(parsedOptions)
        ? parsedOptions.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      parsedCorrectOption = req.body.correct_option ?? currentQuestion.correct_option;
      parsedCorrectOption = Number(parsedCorrectOption);

      if (parsedOptions.length < 2) {
        return errorResponse(res, 400, "Pilihan ganda minimal memiliki 2 opsi");
      }

      if (!Number.isInteger(parsedCorrectOption) || parsedCorrectOption < 0 || parsedCorrectOption >= parsedOptions.length) {
        return errorResponse(res, 400, "Jawaban benar tidak valid");
      }

      nextRubric = null;
    } else {
      parsedOptions = null;
      parsedCorrectOption = null;
      nextRubric = String(nextRubric || "").trim() || null;
    }

    const updatedQuestion = await updateQuestionBankItem(
      id,
      nextQuestionText,
      parsedOptions,
      parsedCorrectOption,
      nextRubric,
    );

    return successResponse(res, 200, "Success Update Question Bank Item", updatedQuestion);
  } catch (error) {
    return errorResponse(res, 500, "Failed Update Question Bank Item", error.message);
  }
};

const deleteLearningQuestionBankItem = async (req, res) => {
  try {
    const { id } = req.params;
    const currentQuestion = await getQuestionBankItemById(id);

    if (!currentQuestion) {
      return errorResponse(res, 404, "Question bank item not found");
    }

    const access = await ensureSubjectAccess({
      subjectId: currentQuestion.subject_id,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const deletedQuestion = await deleteQuestionBankItem(id);
    return successResponse(res, 200, "Success Delete Question Bank Item", deletedQuestion);
  } catch (error) {
    return errorResponse(res, 500, "Failed Delete Question Bank Item", error.message);
  }
};

const deleteLearningQuestionBankItemsBulk = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { question_ids } = req.body || {};

    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const normalizedIds = Array.isArray(question_ids)
      ? question_ids.map((item) => Number(item)).filter(Number.isInteger)
      : [];

    if (normalizedIds.length === 0) {
      return errorResponse(res, 400, "question_ids must contain selected questions");
    }

    const deletedQuestions = await deleteQuestionBankItemsBulk(Number(subjectId), normalizedIds);
    return successResponse(res, 200, "Success Delete Question Bank Items", {
      total: deletedQuestions.length,
      items: deletedQuestions,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Delete Question Bank Items", error.message);
  }
};

const downloadLearningQuestionBankTemplate = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { question_type = "MCQ" } = req.query;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const nextType = normalizeAssignmentType(question_type);
    if (!["MCQ", "ESSAY"].includes(nextType)) {
      return errorResponse(res, 400, "question_type must be MCQ or ESSAY");
    }

    const templateContent = buildQuestionBankTemplate(nextType);
    const fileName = `template-bank-soal-${String(access.subject.name || "mapel")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mapel"}-${nextType.toLowerCase()}.doc`;

    res.setHeader("Content-Type", "application/msword; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(templateContent, "utf8"));
  } catch (error) {
    return errorResponse(res, 500, "Failed Download Question Bank Template", error.message);
  }
};

const importLearningQuestionBankFromDocument = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, access.error.status, access.error.message);
    }

    if (!req.file) {
      return errorResponse(res, 400, "document is required");
    }

    const documentText = extractTextFromDocument(req.file.path, req.file.originalname);
    const parsedQuestions = parseQuestionBankDocument(documentText);
    const createdQuestions = await createQuestionBankItemsBulk(subjectId, parsedQuestions, req.userId);

    const summary = createdQuestions.reduce(
      (accumulator, item) => {
        if (item.question_type === "MCQ") {
          accumulator.mcq += 1;
        } else if (item.question_type === "ESSAY") {
          accumulator.essay += 1;
        }
        return accumulator;
      },
      { total: createdQuestions.length, mcq: 0, essay: 0 },
    );

    return successResponse(res, 201, "Success Import Question Bank", summary);
  } catch (error) {
    return errorResponse(res, 400, "Failed Import Question Bank", error.message);
  } finally {
    removeLocalUpload(req.file?.path);
  }
};

const getLearningQuestionBank = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { keyword = "", question_type = "", page = 1, limit = 20 } = req.query;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const questions = await getQuestionBankBySubject(subjectId, {
      keyword,
      questionType: question_type,
      page,
      limit,
    });
    return successResponse(res, 200, "Success Get Question Bank", questions);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Question Bank", error.message);
  }
};

const createLearningAssignment = async (req, res) => {
  try {
    const {
      subject_id,
      title,
      description,
      due_date,
      assignment_type,
      is_exam,
      exam_category,
      exam_code,
      start_at,
      exam_target_question_count,
      quiz_payload,
      question_bank_ids,
      shuffle_questions,
      question_duration_seconds,
    } = req.body;

    if (!subject_id || !title) {
      return errorResponse(res, 400, "subject_id and title are required");
    }

    const nextAssignmentType = normalizeAssignmentType(assignment_type);
    if (!nextAssignmentType) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "Invalid assignment_type");
    }

    const access = await ensureSubjectAccess({
      subjectId: subject_id,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, access.error.status, access.error.message);
    }

    let normalizedQuizPayload = null;
    let selectedQuestionBankIds = null;
    const shouldShuffleQuestions = String(shuffle_questions || "false").toLowerCase() === "true";
    const isExamMode = String(is_exam || "false").toLowerCase() === "true";
    const normalizedExamCategory = isExamMode ? normalizeExamCategory(exam_category) : null;
    const normalizedExamCode = isExamMode ? String(exam_code || "").trim().toUpperCase() : null;
    const normalizedStartAt = isExamMode && start_at ? new Date(start_at) : null;
    const normalizedExamTargetQuestionCount = isExamMode ? Number(exam_target_question_count) : null;
    const normalizedQuestionDurationSeconds = ["FILE", "MANUAL"].includes(nextAssignmentType)
      ? null
      : Number(question_duration_seconds);
    const activeAcademicPeriod = await getActiveAcademicPeriod(req.schoolId);

    if (!activeAcademicPeriod?.academic_year_id || !activeAcademicPeriod?.semester_id) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "Active academic year and semester must be set before creating assignments");
    }

    if (isExamMode) {
      if (req.userRole !== "ADMIN") {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 403, "Only admin can create official exams");
      }

      if (!["MCQ", "ESSAY"].includes(nextAssignmentType)) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "Official exams must use MCQ or ESSAY type");
      }

      if (!normalizedExamCategory) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "Invalid exam_category");
      }

      if (!normalizedExamCode || normalizedExamCode.length < 3 || normalizedExamCode.length > 50) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "exam_code must be between 3 and 50 characters");
      }

      if (!normalizedStartAt || Number.isNaN(normalizedStartAt.getTime())) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "start_at is required for official exams");
      }

      if (!due_date || Number.isNaN(new Date(due_date).getTime())) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "due_date is required for official exams");
      }

      if (new Date(due_date).getTime() <= normalizedStartAt.getTime()) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "due_date must be after start_at");
      }

      if (
        !Number.isInteger(normalizedExamTargetQuestionCount)
        || normalizedExamTargetQuestionCount < 1
        || normalizedExamTargetQuestionCount > 200
      ) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "exam_target_question_count must be between 1 and 200");
      }

      const existingExam = await getExamAssignmentByCode(req.schoolId, normalizedExamCode);
      if (existingExam) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "exam_code is already used in this school");
      }
    }

    if (["MCQ", "ESSAY"].includes(nextAssignmentType) && question_bank_ids) {
      const parsedQuestionBankIds = typeof question_bank_ids === "string"
        ? JSON.parse(question_bank_ids)
        : question_bank_ids;

      if (!Array.isArray(parsedQuestionBankIds) || parsedQuestionBankIds.length === 0) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "question_bank_ids must contain selected questions");
      }

      const bankItems = await getQuestionBankItemsByIds(
        Number(subject_id),
        parsedQuestionBankIds.map((item) => Number(item)).filter(Number.isInteger),
      );

      if (bankItems.length !== parsedQuestionBankIds.length) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "Some selected bank questions were not found");
      }

      if (bankItems.some((item) => item.question_type !== nextAssignmentType)) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "Selected bank questions must match assignment type");
      }

      const preparedItems = shouldShuffleQuestions ? shuffleArray(bankItems) : bankItems;
      normalizedQuizPayload = buildQuizPayloadFromBankItems(nextAssignmentType, preparedItems);
      selectedQuestionBankIds = parsedQuestionBankIds;
    } else if (["MCQ", "ESSAY"].includes(nextAssignmentType) && !isExamMode) {
      const parsedPayload = parseQuizPayload(nextAssignmentType, quiz_payload);
      normalizedQuizPayload = shouldShuffleQuestions ? shuffleArray(parsedPayload) : parsedPayload;
    }

    if (["MCQ", "ESSAY"].includes(nextAssignmentType) && (!isExamMode || normalizedQuizPayload)) {
      if (
        !Number.isInteger(normalizedQuestionDurationSeconds)
        || normalizedQuestionDurationSeconds < 1
        || normalizedQuestionDurationSeconds > 3600
      ) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 400, "question_duration_seconds must be between 1 and 3600");
      }
    }

    const { attachmentUrl } = await resolveAttachmentPayload(req);
    const assignment = await createAssignment(
      subject_id,
      title,
      description,
      nextAssignmentType,
      isExamMode,
      normalizedExamCategory,
      normalizedExamCode,
      isExamMode ? "REQUESTED" : null,
      normalizedStartAt ? normalizedStartAt.toISOString() : null,
      req.userRole === "ADMIN",
      normalizedExamTargetQuestionCount,
      Number(activeAcademicPeriod.academic_year_id),
      Number(activeAcademicPeriod.semester_id),
      shouldShuffleQuestions,
      normalizedQuestionDurationSeconds,
      selectedQuestionBankIds,
      normalizedQuizPayload,
      attachmentUrl,
      due_date,
      req.userId,
    );

    if (nextAssignmentType === "MANUAL") {
      const students = await getStudentsByClass(req.schoolId, access.subject.class_id);
      await createManualSubmissions(
        assignment.id,
        students
          .map((item) => Number(item.id))
          .filter(Number.isInteger),
      );
    }

    if (isExamMode) {
      emitNotificationToUsers(
        [access.subject.teacher_id],
        {
          type: "EXAM_REQUESTED",
          subject_id: Number(subject_id),
          subject_name: access.subject.name,
          assignment_id: assignment.id,
          assignment_title: assignment.title,
          title: "Tugas penyusunan ujian",
          body: `Admin meminta ${access.subject.teacher_name || access.subject.name} menyiapkan soal untuk ${assignment.title}`,
          route: "/learning-exams-teacher",
          route_query: {
            subject: String(subject_id),
            exam_request: String(assignment.id),
          },
        },
      );
    } else {
      const students = await getStudentsByClass(req.schoolId, access.subject.class_id);
      emitNotificationToUsers(
        students.map((item) => item.id),
        {
          type: "NEW_ASSIGNMENT",
          subject_id: Number(subject_id),
          subject_name: access.subject.name,
          assignment_id: assignment.id,
          assignment_title: assignment.title,
          title: "Tugas baru",
          body: `${access.subject.name}: ${assignment.title}`,
          route: nextAssignmentType === "FILE" || nextAssignmentType === "MANUAL"
            ? "/learning-student"
            : "/learning-quiz-student",
          route_query: {
            subject: String(subject_id),
            assignment: String(assignment.id),
          },
        },
      );
    }

    return successResponse(res, 201, "Success Create Assignment", assignment);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Create Assignment", error.message);
  }
};

const updateLearningAssignmentByTeacher = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 404, "Assignment not found");
    }

    if (Number(assignment.teacher_id) !== Number(req.userId)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 403, "Forbidden assignment access");
    }

    if (assignment.is_exam || !["FILE", "MANUAL"].includes(assignment.assignment_type)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "Assignment type cannot be edited from this module");
    }

    const nextTitle = String(req.body?.title || assignment.title || "").trim();
    if (!nextTitle) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "title is required");
    }

    const nextAssignmentType = normalizeAssignmentType(req.body?.assignment_type || assignment.assignment_type);
    if (!["FILE", "MANUAL"].includes(nextAssignmentType)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "Invalid assignment_type");
    }

    const hasActivity = await countSubmittedOrStartedSubmissionsByAssignment(assignmentId);
    if (hasActivity > 0 && nextAssignmentType !== assignment.assignment_type) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "assignment_type cannot be changed after student activity exists");
    }

    let attachmentUrl = assignment.attachment_url || null;
    if (nextAssignmentType === "MANUAL" || String(req.body?.remove_attachment || "").toLowerCase() === "true") {
      attachmentUrl = null;
    } else {
      const attachmentPayload = await resolveAttachmentPayload(req);
      if (attachmentPayload.attachmentUrl) {
        attachmentUrl = attachmentPayload.attachmentUrl;
      }
    }

    const updatedAssignment = await updateTeacherAssignment(assignmentId, {
      title: nextTitle,
      description: req.body?.description ?? assignment.description ?? "",
      assignmentType: nextAssignmentType,
      attachmentUrl,
      dueDate: req.body?.due_date || null,
    });

    return successResponse(res, 200, "Success Update Assignment", updatedAssignment);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Update Assignment", error.message);
  }
};

const deleteLearningAssignmentByTeacher = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (Number(assignment.teacher_id) !== Number(req.userId)) {
      return errorResponse(res, 403, "Forbidden assignment access");
    }

    if (assignment.is_exam || !["FILE", "MANUAL"].includes(assignment.assignment_type)) {
      return errorResponse(res, 400, "Assignment type cannot be deleted from this module");
    }

    const hasActivity = await countSubmittedOrStartedSubmissionsByAssignment(assignmentId);
    if (hasActivity > 0) {
      return errorResponse(res, 400, "Assignment already has student activity and cannot be deleted");
    }

    const deletedAssignment = await deleteTeacherAssignmentById(assignmentId);
    return successResponse(res, 200, "Success Delete Assignment", deletedAssignment);
  } catch (error) {
    return errorResponse(res, 500, "Failed Delete Assignment", error.message);
  }
};

const submitExamPackageByTeacher = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const {
      question_bank_ids,
      shuffle_questions,
      question_duration_seconds,
    } = req.body || {};

    const assignment = await getAssignmentById(assignmentId);
    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (!assignment.is_exam || assignment.exam_status !== "REQUESTED") {
      return errorResponse(res, 400, "Exam request is not available for submission");
    }

    if (Number(assignment.teacher_id) !== Number(req.userId)) {
      return errorResponse(res, 403, "Forbidden exam request access");
    }

    const parsedQuestionBankIds = typeof question_bank_ids === "string"
      ? JSON.parse(question_bank_ids)
      : question_bank_ids;

    if (!Array.isArray(parsedQuestionBankIds) || parsedQuestionBankIds.length === 0) {
      return errorResponse(res, 400, "question_bank_ids must contain selected questions");
    }

    const expectedQuestionCount = Number(assignment.exam_target_question_count || 0);
    if (
      Number.isInteger(expectedQuestionCount)
      && expectedQuestionCount > 0
      && parsedQuestionBankIds.length !== expectedQuestionCount
    ) {
      return errorResponse(
        res,
        400,
        `Guru harus menyerahkan tepat ${expectedQuestionCount} soal sesuai task admin`,
      );
    }

    const bankItems = await getQuestionBankItemsByIds(
      Number(assignment.subject_id),
      parsedQuestionBankIds.map((item) => Number(item)).filter(Number.isInteger),
    );

    if (bankItems.length !== parsedQuestionBankIds.length) {
      return errorResponse(res, 400, "Some selected bank questions were not found");
    }

    if (bankItems.some((item) => item.question_type !== assignment.assignment_type)) {
      return errorResponse(res, 400, "Selected bank questions must match assignment type");
    }

    const shouldShuffleQuestions = String(shuffle_questions || "false").toLowerCase() === "true";
    const normalizedQuestionDurationSeconds = Number(question_duration_seconds);
    if (
      !Number.isInteger(normalizedQuestionDurationSeconds)
      || normalizedQuestionDurationSeconds < 1
      || normalizedQuestionDurationSeconds > 3600
    ) {
      return errorResponse(res, 400, "question_duration_seconds must be between 1 and 3600");
    }

    const preparedItems = shouldShuffleQuestions ? shuffleArray(bankItems) : bankItems;
    const normalizedQuizPayload = buildQuizPayloadFromBankItems(assignment.assignment_type, preparedItems);
    const updatedAssignment = await submitExamPackage(assignmentId, {
      questionBankIds: parsedQuestionBankIds,
      quizPayload: normalizedQuizPayload,
      shuffleQuestions: shouldShuffleQuestions,
      questionDurationSeconds: normalizedQuestionDurationSeconds,
      examTargetQuestionCount: expectedQuestionCount || null,
    });

    emitNotificationToUsers(
      [updatedAssignment.created_by],
      {
        type: "EXAM_PACKAGE_SUBMITTED",
        subject_id: Number(updatedAssignment.subject_id),
        subject_name: updatedAssignment.subject_name,
        assignment_id: updatedAssignment.id,
        assignment_title: updatedAssignment.title,
        title: "Paket ujian siap ditinjau",
        body: `Guru mapel sudah menyerahkan paket soal untuk ${updatedAssignment.title}`,
        route: "/learning-exams-admin",
      },
    );

    return successResponse(res, 200, "Success Submit Exam Package", updatedAssignment);
  } catch (error) {
    return errorResponse(res, 500, "Failed Submit Exam Package", error.message);
  }
};

const publishExamByAdmin = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (req.userRole !== "ADMIN") {
      return errorResponse(res, 403, "Only admin can publish official exams");
    }

    if (!assignment.is_exam || assignment.exam_status !== "SUBMITTED") {
      return errorResponse(res, 400, "Exam is not ready to publish");
    }

    const publishedAssignment = await publishExamAssignment(assignmentId);
    const students = await getStudentsByClass(req.schoolId, assignment.class_id);

    emitNotificationToUsers(
      students.map((item) => item.id),
      {
        type: "NEW_ASSIGNMENT",
        subject_id: Number(assignment.subject_id),
        subject_name: assignment.subject_name,
        assignment_id: publishedAssignment.id,
        assignment_title: publishedAssignment.title,
        title: "Ujian resmi diterbitkan",
        body: `${assignment.subject_name}: ${publishedAssignment.title}`,
        route: "/learning-exams-student",
        route_query: {
          subject: String(assignment.subject_id),
          assignment: String(publishedAssignment.id),
        },
      },
    );

    return successResponse(res, 200, "Success Publish Exam", publishedAssignment);
  } catch (error) {
    return errorResponse(res, 500, "Failed Publish Exam", error.message);
  }
};

const updateExamRequestByAdmin = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const {
      subject_id,
      title,
      description,
      due_date,
      assignment_type,
      exam_category,
      exam_code,
      start_at,
      exam_target_question_count,
      question_duration_seconds,
    } = req.body || {};

    const assignment = await getAssignmentById(assignmentId);
    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (req.userRole !== "ADMIN") {
      return errorResponse(res, 403, "Only admin can update official exams");
    }

    if (!assignment.is_exam) {
      return errorResponse(res, 400, "Assignment is not an official exam");
    }

    if (assignment.exam_status === "PUBLISHED") {
      return errorResponse(res, 400, "Published exams cannot be edited from the pipeline");
    }

    if (!subject_id || !title) {
      return errorResponse(res, 400, "subject_id and title are required");
    }

    const nextAssignmentType = normalizeAssignmentType(assignment_type);
    if (!["MCQ", "ESSAY"].includes(nextAssignmentType)) {
      return errorResponse(res, 400, "Official exams must use MCQ or ESSAY type");
    }

    const access = await ensureSubjectAccess({
      subjectId: subject_id,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const normalizedExamCategory = normalizeExamCategory(exam_category);
    if (!normalizedExamCategory) {
      return errorResponse(res, 400, "Invalid exam_category");
    }

    const normalizedExamCode = String(exam_code || "").trim().toUpperCase();
    if (!normalizedExamCode || normalizedExamCode.length < 3 || normalizedExamCode.length > 50) {
      return errorResponse(res, 400, "exam_code must be between 3 and 50 characters");
    }

    const normalizedStartAt = start_at ? new Date(start_at) : null;
    if (!normalizedStartAt || Number.isNaN(normalizedStartAt.getTime())) {
      return errorResponse(res, 400, "start_at is required for official exams");
    }

    if (!due_date || Number.isNaN(new Date(due_date).getTime())) {
      return errorResponse(res, 400, "due_date is required for official exams");
    }

    if (new Date(due_date).getTime() <= normalizedStartAt.getTime()) {
      return errorResponse(res, 400, "due_date must be after start_at");
    }

    const normalizedQuestionDurationSeconds = Number(question_duration_seconds);
    if (
      !Number.isInteger(normalizedQuestionDurationSeconds)
      || normalizedQuestionDurationSeconds < 1
      || normalizedQuestionDurationSeconds > 3600
    ) {
      return errorResponse(res, 400, "question_duration_seconds must be between 1 and 3600");
    }

    const normalizedExamTargetQuestionCount = Number(exam_target_question_count);
    if (
      !Number.isInteger(normalizedExamTargetQuestionCount)
      || normalizedExamTargetQuestionCount < 1
      || normalizedExamTargetQuestionCount > 200
    ) {
      return errorResponse(res, 400, "exam_target_question_count must be between 1 and 200");
    }

    const existingExam = await getExamAssignmentByCode(req.schoolId, normalizedExamCode, assignmentId);
    if (existingExam) {
      return errorResponse(res, 400, "exam_code is already used in this school");
    }

    const updatedAssignment = await updateExamAssignmentByAdmin(assignmentId, {
      subjectId: Number(subject_id),
      title,
      description,
      assignmentType: nextAssignmentType,
      examCategory: normalizedExamCategory,
      examCode: normalizedExamCode,
      startAt: normalizedStartAt.toISOString(),
      dueDate: due_date,
      questionDurationSeconds: normalizedQuestionDurationSeconds,
      examTargetQuestionCount: normalizedExamTargetQuestionCount,
    });

    return successResponse(res, 200, "Success Update Exam Request", updatedAssignment);
  } catch (error) {
    return errorResponse(res, 500, "Failed Update Exam Request", error.message);
  }
};

const deleteExamRequestByAdmin = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (req.userRole !== "ADMIN") {
      return errorResponse(res, 403, "Only admin can delete official exams");
    }

    if (!assignment.is_exam) {
      return errorResponse(res, 400, "Assignment is not an official exam");
    }

    if (assignment.exam_status === "PUBLISHED") {
      return errorResponse(res, 400, "Published exams cannot be deleted from the pipeline");
    }

    const submissionCount = await countSubmittedOrStartedSubmissionsByAssignment(assignmentId);
    if (submissionCount > 0) {
      return errorResponse(res, 400, "Exam already has participant activity and cannot be deleted");
    }

    const deletedAssignment = await deleteExamAssignmentByAdmin(assignmentId);
    return successResponse(res, 200, "Success Delete Exam Request", deletedAssignment);
  } catch (error) {
    return errorResponse(res, 500, "Failed Delete Exam Request", error.message);
  }
};

const getSubjectAssignments = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const student = req.userRole === "SISWA" ? await getStudentById(req.userId) : null;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
      classId: student?.class_id,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const assignments = req.userRole === "SISWA"
      ? await getAssignmentsBySubjectForStudent(subjectId, req.userId)
      : await getAssignmentsBySubjectForTeacher(subjectId);

    return successResponse(res, 200, "Success Get Assignments", assignments);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Assignments", error.message);
  }
};

const getFinalGradeReportForTeacher = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const requestedSemesterId = req.query?.semester_id ? Number(req.query.semester_id) : null;
    const access = await ensureSubjectAccess({
      subjectId,
      schoolId: req.schoolId,
      userRole: req.userRole,
      userId: req.userId,
    });

    if (access.error) {
      return errorResponse(res, access.error.status, access.error.message);
    }

    const activeAcademicPeriod = await getActiveAcademicPeriod(req.schoolId);
    const effectiveSemesterId = requestedSemesterId || Number(activeAcademicPeriod?.semester_id || 0) || null;

    const [academicPeriods, assignments, students] = await Promise.all([
      getAcademicYearsBySchool(req.schoolId),
      getAssignmentsForFinalReport(
        Number(subjectId),
        effectiveSemesterId,
      ),
      getStudentsByClass(req.schoolId, access.subject.class_id),
    ]);
    const filteredAssignments = assignments;

    const submissions = await getSubmissionsByAssignmentIds(filteredAssignments.map((item) => item.id));
    const submissionMap = new Map(
      submissions.map((item) => [`${item.assignment_id}:${item.student_id}`, item]),
    );

    const reportStudents = students.map((student) => {
      const scoreEntries = filteredAssignments.map((assignment) => {
        const submission = submissionMap.get(`${assignment.id}:${student.id}`) || null;
        const score = submission?.score !== null && submission?.score !== undefined
          ? Number(submission.score)
          : null;

        return {
          assignment_id: assignment.id,
          score,
          assignment_type: assignment.assignment_type,
          is_exam: Boolean(assignment.is_exam),
        };
      });

      const validScores = scoreEntries.filter((item) => item.score !== null);
      const taskScores = scoreEntries.filter((item) => !item.is_exam && ["FILE", "MANUAL"].includes(item.assignment_type) && item.score !== null);
      const quizScores = scoreEntries.filter((item) => !item.is_exam && ["MCQ", "ESSAY"].includes(item.assignment_type) && item.score !== null);
      const examScores = scoreEntries.filter((item) => item.is_exam && item.score !== null);

      const average = (items) => {
        if (!items.length) return null;
        return Number((items.reduce((sum, item) => sum + Number(item.score || 0), 0) / items.length).toFixed(2));
      };

      return {
        student_id: student.id,
        student_name: student.username,
        class_id: student.class_id,
        scores: scoreEntries.reduce((result, item) => {
          result[item.assignment_id] = item.score;
          return result;
        }, {}),
        scored_count: validScores.length,
        avg_task_score: average(taskScores),
        avg_quiz_score: average(quizScores),
        avg_exam_score: average(examScores),
        final_score: average(validScores),
      };
    });

    const selectedPeriod = academicPeriods
      .flatMap((year) => (year.semesters || []).map((semester) => ({
        academic_year_id: year.id,
        academic_year_name: year.name,
        semester_id: semester.id,
        semester_name: semester.name,
        semester_code: semester.code,
        is_active: Boolean(semester.is_active),
      })))
      .find((item) => Number(item.semester_id) === Number(effectiveSemesterId))
      || null;

    return successResponse(res, 200, "Success Get Final Grade Report", {
      subject: access.subject,
      active_period: activeAcademicPeriod,
      selected_period: selectedPeriod,
      periods: academicPeriods,
      assignments: filteredAssignments,
      students: reportStudents,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Final Grade Report", error.message);
  }
};

const startLearningQuizAttempt = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { exam_code } = req.body || {};
    const assignment = await getAssignmentById(assignmentId);
    const student = await getStudentById(req.userId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (!["MCQ", "ESSAY"].includes(assignment.assignment_type)) {
      return errorResponse(res, 400, "This assignment is not a quiz");
    }

    if (!student || Number(student.class_id) !== Number(assignment.class_id)) {
      return errorResponse(res, 403, "Forbidden assignment access");
    }

    if (assignment.is_exam) {
      if (assignment.exam_status !== "PUBLISHED") {
        return errorResponse(res, 400, "Exam is not published yet");
      }

      if (!assignment.start_at || new Date(assignment.start_at).getTime() > Date.now()) {
        return errorResponse(res, 400, "Exam has not started yet");
      }

      if (
        !String(exam_code || "").trim()
        || String(exam_code || "").trim().toUpperCase() !== String(assignment.exam_code || "").trim().toUpperCase()
      ) {
        return errorResponse(res, 400, "Exam code is invalid");
      }
    }

    if (assignment.due_date && new Date(assignment.due_date).getTime() < Date.now()) {
      return errorResponse(res, 400, "Quiz deadline has passed");
    }

    const existingSubmission = await getSubmissionByAssignmentAndStudent(assignmentId, req.userId);
    if (existingSubmission?.is_submitted) {
      return errorResponse(res, 400, "Quiz has already been submitted");
    }

    const attempt = existingSubmission || await startQuizSubmissionAttempt(assignmentId, req.userId);
    const startedAt = attempt.started_at ? new Date(attempt.started_at) : new Date();
    const durationWindowMs = getQuizDurationWindowMs(assignment);
    const expiresAt = durationWindowMs > 0 ? new Date(startedAt.getTime() + durationWindowMs) : null;

    return successResponse(res, 200, "Success Start Quiz Attempt", {
      assignment_id: assignment.id,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      question_duration_seconds: assignment.question_duration_seconds,
      question_count: Array.isArray(assignment.quiz_payload) ? assignment.quiz_payload.length : 0,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Start Quiz Attempt", error.message);
  }
};

const submitLearningAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { submission_text, answers } = req.body;
    const assignment = await getAssignmentById(assignmentId);
    const student = await getStudentById(req.userId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 404, "Assignment not found");
    }

    if (!student || Number(student.class_id) !== Number(assignment.class_id)) {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 403, "Forbidden assignment access");
    }

    let submission;

    if (assignment.assignment_type === "MANUAL") {
      removeLocalUpload(req.file?.path);
      return errorResponse(res, 400, "Manual assessment is graded directly by the teacher");
    }

    if (assignment.assignment_type === "FILE") {
      const { attachmentUrl } = await resolveAttachmentPayload(req);
      submission = await upsertSubmission(
        assignmentId,
        req.userId,
        submission_text,
        attachmentUrl,
      );
    } else {
      removeLocalUpload(req.file?.path);
      const existingSubmission = await getSubmissionByAssignmentAndStudent(assignmentId, req.userId);
      if (existingSubmission?.is_submitted) {
        return errorResponse(res, 400, "Quiz has already been submitted");
      }

      if (!existingSubmission?.started_at) {
        return errorResponse(res, 400, "Quiz attempt has not been started");
      }

      const durationWindowMs = getQuizDurationWindowMs(assignment);
      if (durationWindowMs > 0) {
        const expiresAt = new Date(new Date(existingSubmission.started_at).getTime() + durationWindowMs);
        if (expiresAt.getTime() + 2000 < Date.now()) {
          return errorResponse(res, 400, "Quiz time has expired");
        }
      }

      const parsedAnswers = parseStudentAnswers(
        assignment.assignment_type,
        answers,
        assignment.quiz_payload || [],
      );

      if (assignment.assignment_type === "MCQ") {
        const score = calculateMcqScore(assignment.quiz_payload || [], parsedAnswers);
        submission = await upsertQuizSubmission(
          assignmentId,
          req.userId,
          null,
          parsedAnswers,
          score,
          true,
        );
      } else {
        submission = await upsertQuizSubmission(
          assignmentId,
          req.userId,
          submission_text,
          parsedAnswers,
          null,
          false,
        );
      }
    }

    emitNotificationToUsers(
      [assignment.teacher_id],
      {
        type: "ASSIGNMENT_SUBMITTED",
        subject_id: Number(assignment.subject_id),
        subject_name: assignment.subject_name,
        assignment_id: Number(assignment.id),
        assignment_title: assignment.title,
        student_id: req.userId,
        student_name: student.username,
        title: "Tugas dikumpulkan",
        body: `${student.username} mengumpulkan ${assignment.title}`,
        route: "/learning-teacher",
        route_query: {
          subject: String(assignment.subject_id),
          assignment: String(assignment.id),
        },
      },
    );

    return successResponse(res, 201, "Success Submit Assignment", submission);
  } catch (error) {
    removeLocalUpload(req.file?.path);
    return errorResponse(res, 500, "Failed Submit Assignment", error.message);
  }
};

const getAssignmentSubmissionsForTeacher = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (Number(assignment.teacher_id) !== Number(req.userId)) {
      return errorResponse(res, 403, "Forbidden assignment access");
    }

    const submissions = await getSubmissionsByAssignment(assignmentId);
    return successResponse(res, 200, "Success Get Assignment Submissions", submissions);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Assignment Submissions", error.message);
  }
};

const recordQuizViolation = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { violation_type, violation_message } = req.body;
    const assignment = await getAssignmentById(assignmentId);
    const student = await getStudentById(req.userId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (!student || req.userRole !== "SISWA" || Number(assignment.class_id) !== Number(student.class_id)) {
      return errorResponse(res, 403, "Forbidden assignment access");
    }

    if (!["MCQ", "ESSAY"].includes(String(assignment.assignment_type || "").toUpperCase())) {
      return errorResponse(res, 400, "Violation log only supported for quiz assignments");
    }

    const submission = await getSubmissionByAssignmentAndStudent(assignmentId, req.userId);
    if (!submission) {
      return errorResponse(res, 404, "Quiz attempt not found");
    }

    const savedViolation = await createQuizViolationLog(
      submission.id,
      assignment.id,
      req.userId,
      violation_type,
      violation_message,
    );

    return successResponse(res, 201, "Success Record Quiz Violation", savedViolation);
  } catch (error) {
    return errorResponse(res, 500, "Failed Record Quiz Violation", error.message);
  }
};

const gradeLearningSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    const submission = await getSubmissionById(submissionId);

    if (!submission || Number(submission.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Submission not found");
    }

    if (Number(submission.teacher_id) !== Number(req.userId)) {
      return errorResponse(res, 403, "Forbidden submission access");
    }

    const graded = await gradeSubmission(submissionId, score, feedback, req.userId);
    return successResponse(res, 200, "Success Grade Submission", graded);
  } catch (error) {
    return errorResponse(res, 500, "Failed Grade Submission", error.message);
  }
};

const getQuizAssignmentOverviewForTeacher = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment || Number(assignment.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Assignment not found");
    }

    if (Number(assignment.teacher_id) !== Number(req.userId)) {
      return errorResponse(res, 403, "Forbidden assignment access");
    }

    const [students, submissions, violationSummaryRows] = await Promise.all([
      getStudentsByClass(req.schoolId, assignment.class_id),
      getSubmissionsByAssignment(assignmentId),
      getQuizViolationSummaryByAssignment(assignmentId),
    ]);

    const violationSummaryByStudentId = new Map(
      violationSummaryRows.map((item) => [
        Number(item.student_id),
        {
          violation_count: Number(item.violation_count || 0),
          violation_logs: Array.isArray(item.violation_logs) ? item.violation_logs : [],
        },
      ]),
    );

    const submittedStudentIds = new Set(submissions.map((item) => Number(item.student_id)));
    const submittedStudents = submissions.map((item) => ({
      id: item.student_id,
      username: item.student_name,
      submitted_at: item.submitted_at,
      score: item.score,
      feedback: item.feedback,
      assignment_type: item.assignment_type,
      answer_payload: item.answer_payload,
      violation_count: violationSummaryByStudentId.get(Number(item.student_id))?.violation_count || 0,
      violation_logs: violationSummaryByStudentId.get(Number(item.student_id))?.violation_logs || [],
    }));
    const pendingStudents = students
      .filter((student) => !submittedStudentIds.has(Number(student.id)))
      .map((student) => ({
        ...student,
        violation_count: violationSummaryByStudentId.get(Number(student.id))?.violation_count || 0,
        violation_logs: violationSummaryByStudentId.get(Number(student.id))?.violation_logs || [],
      }));

    const analytics = {
      total_students: students.length,
      submitted_count: submissions.length,
      pending_count: pendingStudents.length,
      graded_count: submissions.filter((item) => item.score !== null && item.score !== undefined).length,
      average_score: null,
      total_violations: violationSummaryRows.reduce((sum, item) => sum + Number(item.violation_count || 0), 0),
      flagged_students_count: violationSummaryRows.filter((item) => Number(item.violation_count || 0) > 0).length,
      question_breakdown: [],
    };

    const scoredRows = submissions.filter((item) => item.score !== null && item.score !== undefined);
    if (scoredRows.length > 0) {
      analytics.average_score = Number(
        (scoredRows.reduce((sum, item) => sum + Number(item.score || 0), 0) / scoredRows.length).toFixed(2),
      );
    }

    if (assignment.assignment_type === "MCQ") {
      const questions = Array.isArray(assignment.quiz_payload) ? assignment.quiz_payload : [];
      analytics.question_breakdown = questions.map((question, index) => {
        let correctCount = 0;
        let answeredCount = 0;

        submissions.forEach((submission) => {
          const answers = Array.isArray(submission.answer_payload) ? submission.answer_payload : [];
          const selectedOption = answers[index]?.selected_option;
          if (selectedOption === undefined || selectedOption === null) {
            return;
          }

          answeredCount += 1;
          if (Number(selectedOption) === Number(question.correct_option)) {
            correctCount += 1;
          }
        });

        return {
          question_number: index + 1,
          question: question.question,
          answered_count: answeredCount,
          correct_count: correctCount,
          wrong_count: Math.max(answeredCount - correctCount, 0),
          correct_rate: answeredCount > 0 ? Number(((correctCount / answeredCount) * 100).toFixed(2)) : 0,
        };
      });
    }

    return successResponse(res, 200, "Success Get Quiz Overview", {
      assignment,
      analytics,
      submitted_students: submittedStudents,
      pending_students: pendingStudents,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Quiz Overview", error.message);
  }
};

module.exports = {
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
};
