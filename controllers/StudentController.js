const { getClassById } = require("../models/ClassModel");
const { getAttendanceByStudentId } = require("../models/AttendanceModel");
const { GetReceiptsByStudentId } = require("../models/ReceiptModel");
const {
  createStudent,
  GetStudent,
  GetStudentsByHomeroomTeacher,
  getStudentById,
  EditStudent,
} = require("../models/UserModel");
const { successResponse, errorResponse } = require("../utils/response");
const bcrypt = require("bcryptjs");

const RegisterStudent = async (req, res) => {
  try {
    const { username, password, role, class_id, parent_email, phone_number } = req.body;
    const school_id = req.schoolId;
    const hashedPassword = await bcrypt.hash(password, 8);
    const checkClassId = await getClassById(class_id);
    if (!checkClassId) {
      return res.json({
        success: false,
        message: "nothing class avaible",
      });
    }
    const user = await createStudent(
      username,
      hashedPassword,
      role,
      school_id,
      class_id,
      parent_email,
      phone_number,
    );
    return successResponse(res, 201, "User registered successfully", user);
  } catch (error) {
    return errorResponse(res, 500, "Registration failed", error.message);
  }
};

const GetStudents = async (req, res) => {
  try {
    const school_id = req.schoolId;
    const { class_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const listStudent = await GetStudent(
      school_id,
      class_id,
      parseInt(limit),
      parseInt(offset),
    );
    return successResponse(res, 200, "Success Get Data Student", {
      page: parseInt(page),
      limit: parseInt(limit),
      data: listStudent,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Data Student");
  }
};
const EditStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, role, class_id, parent_email, phone_number } = req.body;
    const school_id = req.schoolId;

    const checkUser = await getStudentById(id);

    if (!checkUser) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }
    const student = await EditStudent(
      id,
      username ?? checkUser.username,
      role ?? checkUser.role,
      class_id ?? checkUser.class_id,
      parent_email ?? checkUser.parent_email,
      phone_number ?? checkUser.phone_number,
      school_id,                          
     
    );

    return successResponse(res, 200, "Success Edit Student", student);

  } catch (error) {
    console.log(error);
    return errorResponse(res, 500, "Failed Edit Data Student", error.message);
  }
};

const GetMyClassStudents = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const students = await GetStudentsByHomeroomTeacher(
      req.userId,
      req.schoolId,
      parseInt(limit),
      parseInt(offset),
    );

    return successResponse(res, 200, "Success Get My Class Students", {
      page: parseInt(page),
      limit: parseInt(limit),
      data: students,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get My Class Students", error.message);
  }
};

const GetStudentAttendanceForTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const student = await getStudentById(id);

    if (!student || Number(student.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Student not found");
    }

    const students = await GetStudentsByHomeroomTeacher(req.userId, req.schoolId, 1000, 0);
    const allowedStudent = students.find((item) => item.id === Number(id));

    if (!allowedStudent) {
      return errorResponse(res, 403, "Forbidden: student is not in your homeroom class");
    }

    const attendance = await getAttendanceByStudentId(
      id,
      parseInt(limit),
      parseInt(offset),
    );

    return successResponse(res, 200, "Success Get Student Attendance", {
      page: parseInt(page),
      limit: parseInt(limit),
      data: attendance,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Student Attendance", error.message);
  }
};

const GetStudentReceiptForTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await getStudentById(id);

    if (!student || Number(student.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "Student not found");
    }

    const students = await GetStudentsByHomeroomTeacher(req.userId, req.schoolId, 1000, 0);
    const allowedStudent = students.find((item) => item.id === Number(id));

    if (!allowedStudent) {
      return errorResponse(res, 403, "Forbidden: student is not in your homeroom class");
    }

    const receipt = await GetReceiptsByStudentId(id);
    return successResponse(res, 200, "Success Get Student Receipt", receipt);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Student Receipt", error.message);
  }
};

module.exports = { RegisterStudent, GetStudents, EditStudents, GetMyClassStudents, GetStudentAttendanceForTeacher, GetStudentReceiptForTeacher };
