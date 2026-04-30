const bcrypt = require("bcryptjs");
const { getAllSchools } = require("../models/SchoolModel");
const { getClass, getClassById } = require("../models/ClassModel");
const { createStudent, findByUsername } = require("../models/UserModel");
const { successResponse, errorResponse } = require("../utils/response");

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPhoneNumber = (value) => /^[0-9+\-\s]{8,20}$/.test(value);

const getPublicRegistrationOptions = async (req, res) => {
  try {
    const schools = await getAllSchools();
    const schoolsWithClasses = await Promise.all(
      schools.map(async (school) => ({
        ...school,
        classes: await getClass(school.id),
      })),
    );

    return successResponse(res, 200, "Success Get Registration Options", schoolsWithClasses);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Registration Options", error.message);
  }
};

const registerStudentPublic = async (req, res) => {
  try {
    const {
      username,
      password,
      class_id,
      parent_email,
      phone_number,
    } = req.body;

    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");
    const normalizedParentEmail = parent_email ? String(parent_email).trim().toLowerCase() : null;
    const normalizedPhoneNumber = phone_number ? String(phone_number).trim() : null;
    const normalizedClassId = Number(class_id);

    if (!normalizedUsername || !normalizedPassword || !normalizedClassId) {
      return errorResponse(res, 400, "username, password, and class_id are required");
    }

    if (normalizedUsername.length < 3) {
      return errorResponse(res, 400, "Username minimal 3 karakter");
    }

    if (normalizedPassword.length < 6) {
      return errorResponse(res, 400, "Password minimal 6 karakter");
    }

    if (normalizedParentEmail && !isValidEmail(normalizedParentEmail)) {
      return errorResponse(res, 400, "Format email orang tua tidak valid");
    }

    if (normalizedPhoneNumber && !isValidPhoneNumber(normalizedPhoneNumber)) {
      return errorResponse(res, 400, "Format nomor HP tidak valid");
    }

    const existingUser = await findByUsername(normalizedUsername);
    if (existingUser) {
      return errorResponse(res, 400, "Username already exists");
    }

    const currentClass = await getClassById(normalizedClassId);
    if (!currentClass) {
      return errorResponse(res, 404, "Class not found");
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 8);
    const user = await createStudent(
      normalizedUsername,
      hashedPassword,
      "SISWA",
      currentClass.school_id,
      normalizedClassId,
      normalizedParentEmail,
      normalizedPhoneNumber,
    );

    return successResponse(res, 201, "Registrasi siswa berhasil", user);
  } catch (error) {
    return errorResponse(res, 500, "Failed Student Registration", error.message);
  }
};

module.exports = {
  getPublicRegistrationOptions,
  registerStudentPublic,
};
