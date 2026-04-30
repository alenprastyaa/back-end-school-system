const {
  createAttendance,
  addCheckOut,
  checkAttendanceToday,
  getAttandace,
} = require("../models/AttendanceModel");
const { uploadImage } = require("../utils/upload");
const { getStudentById } = require("../models/UserModel");
const fs = require("fs");
const { successResponse, errorResponse } = require("../utils/response");
const { sendHomeroomAttendanceEmailReports } = require("../services/attendanceHomeroomEmailReportService");

const removeLocalUpload = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const CheckIn = async (req, res) => {
  try {
    const studentId = req.userId;
    const filePath = req.file ? req.file.path : null;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }
    const student = await getStudentById(studentId);
    if (!student) {
      removeLocalUpload(filePath);
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }
    const alreadyCheckedIn = await checkAttendanceToday(studentId);
    if (alreadyCheckedIn) {
      removeLocalUpload(filePath);
      return res.status(400).json({
        success: false,
        message: "Anda sudah melakukan absensi masuk hari ini.",
      });
    }
    const imageUrl = await uploadImage(req.file);
    removeLocalUpload(filePath);
    await createAttendance(student.id, imageUrl);
    res.json({
      success: true,
      message: "Check-in successful.",
    });
  } catch (error) {
    console.log(error);
    removeLocalUpload(req.file?.path);

    res.status(500).json({
      success: false,
      message: "Check-in failed",
    });
  }
};

const CheckOut = async (req, res) => {
  try {
    const studentId = req.userId;
    const attendance = await addCheckOut(studentId);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "You have not checked in today.",
      });
    }
    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }
    res.json({
      success: true,
      message: "Check-out successful.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Check-out failed",
    });
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


const GetListAttendance = async (req, res) => {
  try {
    const userId = req.userId;
    const {page = 1, limit = 10} = req.query
    const offset = (page - 1) * limit;
    const attendance = await getAttandace(
      userId, 
      parseInt(limit),
      parseInt(offset),);
      return successResponse(res,200,"Success Get Attendance Data",
      {
      page: parseInt(page),
      limit: parseInt(limit),
      data: attendance,
      }
    );
  } catch (error) {
    console.log(error);
    return errorResponse(res, 500,"Failed Get Attendance Data",error.message);
  }
};

const SendHomeroomEmailAttendanceReports = async (req, res) => {
  try {
    const result = await sendHomeroomAttendanceEmailReports({
      schoolId: req.userRole === "SUPER_ADMIN" ? req.body?.school_id || null : req.schoolId,
      date: req.body?.date || null,
    });

    return successResponse(res, 200, "Success Send Homeroom Email Attendance Reports", result);
  } catch (error) {
    return errorResponse(res, 500, "Failed Send Homeroom Email Attendance Reports", error.message);
  }
};

module.exports = { CheckIn, CheckOut, GetListAttendance, SendHomeroomEmailAttendanceReports };
