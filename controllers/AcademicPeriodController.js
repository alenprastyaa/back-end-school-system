const {
  getAcademicYearsBySchool,
  getAcademicYearById,
  createAcademicYear,
  updateAcademicYear,
  activateAcademicYear,
  getSemesterById,
  createSemester,
  updateSemester,
  activateSemester,
  getActiveAcademicPeriod,
} = require("../models/AcademicPeriodModel");
const { successResponse, errorResponse } = require("../utils/response");

const parseDateValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const normalizeName = (value) => String(value || "").trim();
const normalizeCode = (value) => String(value || "").trim().toUpperCase();

const validateRange = (startDate, endDate, startLabel = "start_date", endLabel = "end_date") => {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);

  if (!start || !end) {
    return `${startLabel} and ${endLabel} are required`;
  }

  if (end.getTime() < start.getTime()) {
    return `${endLabel} must be after or equal to ${startLabel}`;
  }

  return null;
};

const getAcademicPeriods = async (req, res) => {
  try {
    const [years, activePeriod] = await Promise.all([
      getAcademicYearsBySchool(req.schoolId),
      getActiveAcademicPeriod(req.schoolId),
    ]);

    return successResponse(res, 200, "Success Get Academic Periods", {
      years,
      active: activePeriod,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Academic Periods", error.message);
  }
};

const createNewAcademicYear = async (req, res) => {
  try {
    const name = normalizeName(req.body?.name);
    const startDate = req.body?.start_date;
    const endDate = req.body?.end_date;

    if (!name) {
      return errorResponse(res, 400, "name is required");
    }

    const rangeError = validateRange(startDate, endDate);
    if (rangeError) {
      return errorResponse(res, 400, rangeError);
    }

    const created = await createAcademicYear({
      schoolId: req.schoolId,
      name,
      startDate,
      endDate,
    });

    return successResponse(res, 201, "Success Create Academic Year", created);
  } catch (error) {
    return errorResponse(res, 500, "Failed Create Academic Year", error.message);
  }
};

const updateExistingAcademicYear = async (req, res) => {
  try {
    const { id } = req.params;
    const current = await getAcademicYearById(id);

    if (!current || Number(current.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Academic year not found");
    }

    const name = normalizeName(req.body?.name || current.name);
    const startDate = req.body?.start_date || current.start_date;
    const endDate = req.body?.end_date || current.end_date;

    if (!name) {
      return errorResponse(res, 400, "name is required");
    }

    const rangeError = validateRange(startDate, endDate);
    if (rangeError) {
      return errorResponse(res, 400, rangeError);
    }

    const updated = await updateAcademicYear({
      id,
      name,
      startDate,
      endDate,
    });

    return successResponse(res, 200, "Success Update Academic Year", updated);
  } catch (error) {
    return errorResponse(res, 500, "Failed Update Academic Year", error.message);
  }
};

const activateExistingAcademicYear = async (req, res) => {
  try {
    const { id } = req.params;
    const current = await getAcademicYearById(id);

    if (!current || Number(current.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Academic year not found");
    }

    const activated = await activateAcademicYear(id);
    return successResponse(res, 200, "Success Activate Academic Year", activated);
  } catch (error) {
    return errorResponse(res, 500, "Failed Activate Academic Year", error.message);
  }
};

const createNewSemester = async (req, res) => {
  try {
    const academicYearId = Number(req.body?.academic_year_id);
    const name = normalizeName(req.body?.name);
    const code = normalizeCode(req.body?.code);
    const startDate = req.body?.start_date;
    const endDate = req.body?.end_date;

    if (!Number.isInteger(academicYearId) || academicYearId <= 0) {
      return errorResponse(res, 400, "academic_year_id is required");
    }

    const academicYear = await getAcademicYearById(academicYearId);
    if (!academicYear || Number(academicYear.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Academic year not found");
    }

    if (!name || !code) {
      return errorResponse(res, 400, "name and code are required");
    }

    const rangeError = validateRange(startDate, endDate);
    if (rangeError) {
      return errorResponse(res, 400, rangeError);
    }

    if (new Date(startDate).getTime() < new Date(academicYear.start_date).getTime()
      || new Date(endDate).getTime() > new Date(academicYear.end_date).getTime()) {
      return errorResponse(res, 400, "Semester range must be inside the academic year range");
    }

    const created = await createSemester({
      academicYearId,
      name,
      code,
      startDate,
      endDate,
    });

    return successResponse(res, 201, "Success Create Semester", created);
  } catch (error) {
    return errorResponse(res, 500, "Failed Create Semester", error.message);
  }
};

const updateExistingSemester = async (req, res) => {
  try {
    const { id } = req.params;
    const current = await getSemesterById(id);

    if (!current || Number(current.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Semester not found");
    }

    const academicYear = await getAcademicYearById(current.academic_year_id);
    if (!academicYear || Number(academicYear.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Academic year not found");
    }

    const name = normalizeName(req.body?.name || current.name);
    const code = normalizeCode(req.body?.code || current.code);
    const startDate = req.body?.start_date || current.start_date;
    const endDate = req.body?.end_date || current.end_date;

    if (!name || !code) {
      return errorResponse(res, 400, "name and code are required");
    }

    const rangeError = validateRange(startDate, endDate);
    if (rangeError) {
      return errorResponse(res, 400, rangeError);
    }

    if (new Date(startDate).getTime() < new Date(academicYear.start_date).getTime()
      || new Date(endDate).getTime() > new Date(academicYear.end_date).getTime()) {
      return errorResponse(res, 400, "Semester range must be inside the academic year range");
    }

    const updated = await updateSemester({
      id,
      name,
      code,
      startDate,
      endDate,
    });

    return successResponse(res, 200, "Success Update Semester", updated);
  } catch (error) {
    return errorResponse(res, 500, "Failed Update Semester", error.message);
  }
};

const activateExistingSemester = async (req, res) => {
  try {
    const { id } = req.params;
    const current = await getSemesterById(id);

    if (!current || Number(current.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Semester not found");
    }

    const activated = await activateSemester(id);
    return successResponse(res, 200, "Success Activate Semester", activated);
  } catch (error) {
    return errorResponse(res, 500, "Failed Activate Semester", error.message);
  }
};

module.exports = {
  getAcademicPeriods,
  createNewAcademicYear,
  updateExistingAcademicYear,
  activateExistingAcademicYear,
  createNewSemester,
  updateExistingSemester,
  activateExistingSemester,
};
