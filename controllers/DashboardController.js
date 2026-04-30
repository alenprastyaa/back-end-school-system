const pool = require("../config/database");
const { successResponse, errorResponse } = require("../utils/response");

const mapOverview = (rows) =>
  rows.reduce((result, item) => {
    result[item.key] = Number(item.value || 0);
    return result;
  }, {});

const getSuperAdminDashboard = async (req, res) => {
  try {
    const [overviewResult, schoolStatsResult, attendanceResult, receiptResult] =
      await Promise.all([
        pool.query(`
          SELECT 'schools' AS key, COUNT(*)::int AS value FROM schools
          UNION ALL
          SELECT 'users' AS key, COUNT(*)::int AS value FROM users
          UNION ALL
          SELECT 'admins' AS key, COUNT(*)::int AS value FROM users WHERE role = 'ADMIN'
          UNION ALL
          SELECT 'teachers' AS key, COUNT(*)::int AS value FROM users WHERE role = 'GURU'
          UNION ALL
          SELECT 'students' AS key, COUNT(*)::int AS value FROM users WHERE role = 'SISWA'
        `),
        pool.query(`
          SELECT
            s.id,
            s.name,
            COUNT(DISTINCT u.id)::int AS total_users,
            COUNT(DISTINCT CASE WHEN u.role = 'GURU' THEN u.id END)::int AS total_teachers,
            COUNT(DISTINCT CASE WHEN u.role = 'SISWA' THEN u.id END)::int AS total_students,
            COUNT(DISTINCT c.id)::int AS total_classes
          FROM schools s
          LEFT JOIN users u ON u.school_id = s.id
          LEFT JOIN class c ON c.school_id = s.id
          GROUP BY s.id, s.name
          ORDER BY total_students DESC, s.name ASC
          LIMIT 8
        `),
        pool.query(`
          SELECT
            u.username,
            s.name AS school_name,
            a.attendance_date,
            a.clock_in,
            a.clock_out,
            a.status
          FROM attendance a
          INNER JOIN users u ON u.id = a.user_id
          LEFT JOIN schools s ON s.id = u.school_id
          ORDER BY a.clock_in DESC NULLS LAST
          LIMIT 8
        `),
        pool.query(`
          SELECT
            u.username,
            s.name AS school_name,
            pr.periode,
            pr.description,
            pr.created_at
          FROM payment_receipt pr
          INNER JOIN users u ON u.id = pr.user_id
          LEFT JOIN schools s ON s.id = u.school_id
          ORDER BY pr.created_at DESC
          LIMIT 8
        `),
      ]);

    return successResponse(res, 200, "Success Get Super Admin Dashboard", {
      generatedAt: new Date().toISOString(),
      overview: mapOverview(overviewResult.rows),
      schools: schoolStatsResult.rows,
      recentAttendance: attendanceResult.rows,
      recentReceipts: receiptResult.rows,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Super Admin Dashboard", error.message);
  }
};

const getAdminDashboard = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const [overviewResult, schoolResult, classResult, attendanceResult, receiptResult] =
      await Promise.all([
        pool.query(
          `
            SELECT 'teachers' AS key, COUNT(*)::int AS value FROM users WHERE school_id = $1 AND role = 'GURU'
            UNION ALL
            SELECT 'students' AS key, COUNT(*)::int AS value FROM users WHERE school_id = $1 AND role = 'SISWA'
            UNION ALL
            SELECT 'admins' AS key, COUNT(*)::int AS value FROM users WHERE school_id = $1 AND role = 'ADMIN'
            UNION ALL
            SELECT 'classes' AS key, COUNT(*)::int AS value FROM class WHERE school_id = $1
            UNION ALL
            SELECT 'attendance_today' AS key, COUNT(*)::int AS value
            FROM attendance a
            INNER JOIN users u ON u.id = a.user_id
            WHERE u.school_id = $1 AND a.attendance_date = CURRENT_DATE
            UNION ALL
            SELECT 'receipts_this_month' AS key, COUNT(*)::int AS value
            FROM payment_receipt pr
            INNER JOIN users u ON u.id = pr.user_id
            WHERE u.school_id = $1
              AND DATE_TRUNC('month', pr.created_at) = DATE_TRUNC('month', CURRENT_DATE)
          `,
          [schoolId],
        ),
        pool.query(
          `
            SELECT id, name
            FROM schools
            WHERE id = $1
          `,
          [schoolId],
        ),
        pool.query(
          `
            SELECT
              c.id,
              c.class_name,
              COALESCE(w.username, '-') AS wali_guru_name,
              w.parent_email AS wali_guru_email,
              w.phone_number AS wali_guru_phone_number,
              COUNT(u.id)::int AS student_count
            FROM class c
            LEFT JOIN users w ON w.id = c.wali_guru_id
            LEFT JOIN users u ON u.class_id = c.id AND u.role = 'SISWA'
            WHERE c.school_id = $1
            GROUP BY c.id, c.class_name, w.username, w.parent_email, w.phone_number
            ORDER BY student_count DESC, c.class_name ASC
            LIMIT 8
          `,
          [schoolId],
        ),
        pool.query(
          `
            SELECT
              u.username,
              c.class_name,
              a.attendance_date,
              a.clock_in,
              a.clock_out,
              a.status
            FROM attendance a
            INNER JOIN users u ON u.id = a.user_id
            LEFT JOIN class c ON c.id = u.class_id
            WHERE u.school_id = $1
            ORDER BY a.clock_in DESC NULLS LAST
            LIMIT 8
          `,
          [schoolId],
        ),
        pool.query(
          `
            SELECT
              u.username,
              c.class_name,
              pr.periode,
              pr.description,
              pr.created_at,
              pr.image_path
            FROM payment_receipt pr
            INNER JOIN users u ON u.id = pr.user_id
            LEFT JOIN class c ON c.id = u.class_id
            WHERE u.school_id = $1
            ORDER BY pr.created_at DESC
            LIMIT 8
          `,
          [schoolId],
        ),
      ]);

    return successResponse(res, 200, "Success Get Admin Dashboard", {
      generatedAt: new Date().toISOString(),
      school: schoolResult.rows[0] || null,
      overview: mapOverview(overviewResult.rows),
      classes: classResult.rows,
      recentAttendance: attendanceResult.rows,
      recentReceipts: receiptResult.rows,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Admin Dashboard", error.message);
  }
};

const getGuruDashboard = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const teacherId = req.userId;

    const [homeroomResult, overviewResult, attendanceResult, receiptResult, studentResult] =
      await Promise.all([
        pool.query(
          `
            SELECT c.id, c.class_name, c.school_id, u.username AS wali_guru_name
            FROM class c
            LEFT JOIN users u ON u.id = c.wali_guru_id
            WHERE c.school_id = $1 AND c.wali_guru_id = $2
          `,
          [schoolId, teacherId],
        ),
        pool.query(
          `
            SELECT 'students' AS key, COUNT(*)::int AS value
            FROM users u
            INNER JOIN class c ON c.id = u.class_id
            WHERE u.role = 'SISWA' AND u.school_id = $1 AND c.wali_guru_id = $2
            UNION ALL
            SELECT 'attendance_today' AS key, COUNT(*)::int AS value
            FROM attendance a
            INNER JOIN users u ON u.id = a.user_id
            INNER JOIN class c ON c.id = u.class_id
            WHERE u.school_id = $1 AND c.wali_guru_id = $2 AND a.attendance_date = CURRENT_DATE
            UNION ALL
            SELECT 'receipts_this_month' AS key, COUNT(*)::int AS value
            FROM payment_receipt pr
            INNER JOIN users u ON u.id = pr.user_id
            INNER JOIN class c ON c.id = u.class_id
            WHERE u.school_id = $1 AND c.wali_guru_id = $2
              AND DATE_TRUNC('month', pr.created_at) = DATE_TRUNC('month', CURRENT_DATE)
          `,
          [schoolId, teacherId],
        ),
        pool.query(
          `
            SELECT
              u.id AS student_id,
              u.username,
              a.attendance_date,
              a.clock_in,
              a.clock_out,
              a.status,
              a.image
            FROM attendance a
            INNER JOIN users u ON u.id = a.user_id
            INNER JOIN class c ON c.id = u.class_id
            WHERE u.school_id = $1 AND c.wali_guru_id = $2
            ORDER BY a.clock_in DESC NULLS LAST
            LIMIT 8
          `,
          [schoolId, teacherId],
        ),
        pool.query(
          `
            SELECT
              u.id AS student_id,
              u.username,
              pr.periode,
              pr.description,
              pr.created_at,
              pr.image_path
            FROM payment_receipt pr
            INNER JOIN users u ON u.id = pr.user_id
            INNER JOIN class c ON c.id = u.class_id
            WHERE u.school_id = $1 AND c.wali_guru_id = $2
            ORDER BY pr.created_at DESC
            LIMIT 8
          `,
          [schoolId, teacherId],
        ),
        pool.query(
          `
            SELECT
              u.id,
              u.username,
              u.parent_email,
              u.phone_number,
              CASE WHEN a.user_id IS NULL THEN false ELSE true END AS checked_in_today
            FROM users u
            INNER JOIN class c ON c.id = u.class_id
            LEFT JOIN attendance a
              ON a.user_id = u.id
             AND a.attendance_date = CURRENT_DATE
            WHERE u.role = 'SISWA' AND u.school_id = $1 AND c.wali_guru_id = $2
            ORDER BY checked_in_today DESC, u.username ASC
            LIMIT 8
          `,
          [schoolId, teacherId],
        ),
      ]);

    const overview = mapOverview(overviewResult.rows);
    overview.absent_today = Math.max(
      0,
      Number(overview.students || 0) - Number(overview.attendance_today || 0),
    );

    return successResponse(res, 200, "Success Get Guru Dashboard", {
      generatedAt: new Date().toISOString(),
      homeroom: homeroomResult.rows[0] || null,
      overview,
      students: studentResult.rows,
      recentAttendance: attendanceResult.rows,
      recentReceipts: receiptResult.rows,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Guru Dashboard", error.message);
  }
};

const getSiswaDashboard = async (req, res) => {
  try {
    const studentId = req.userId;
    const [studentResult, attendanceTodayResult, overviewResult, attendanceResult, receiptResult, assignmentResult] =
      await Promise.all([
        pool.query(
          `
            SELECT
              u.id,
              u.username,
              u.parent_email,
              u.phone_number,
              c.class_name,
              s.name AS school_name
            FROM users u
            LEFT JOIN class c ON c.id = u.class_id
            LEFT JOIN schools s ON s.id = u.school_id
            WHERE u.id = $1
          `,
          [studentId],
        ),
        pool.query(
          `
            SELECT attendance_date, clock_in, clock_out, status, image
            FROM attendance
            WHERE user_id = $1 AND attendance_date = CURRENT_DATE
          `,
          [studentId],
        ),
        pool.query(
          `
            SELECT 'attendance_total' AS key, COUNT(*)::int AS value
            FROM attendance
            WHERE user_id = $1
            UNION ALL
            SELECT 'receipts_total' AS key, COUNT(*)::int AS value
            FROM payment_receipt
            WHERE user_id = $1
            UNION ALL
            SELECT 'receipts_this_month' AS key, COUNT(*)::int AS value
            FROM payment_receipt
            WHERE user_id = $1
              AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
          `,
          [studentId],
        ),
        pool.query(
          `
            SELECT attendance_date, clock_in, clock_out, status, image
            FROM attendance
            WHERE user_id = $1
            ORDER BY attendance_date DESC, clock_in DESC
            LIMIT 8
          `,
          [studentId],
        ),
        pool.query(
          `
            SELECT id, periode, description, created_at, image_path
            FROM payment_receipt
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 8
          `,
          [studentId],
        ),
        pool.query(
          `
            SELECT
              la.id,
              la.title,
              la.due_date,
              ls.name AS subject_name,
              c.class_name,
              sub.id AS submission_id,
              sub.score
            FROM users u
            INNER JOIN class c ON c.id = u.class_id
            INNER JOIN learning_subjects ls ON ls.class_id = c.id
            INNER JOIN learning_assignments la ON la.subject_id = ls.id
            LEFT JOIN learning_submissions sub
              ON sub.assignment_id = la.id
             AND sub.student_id = u.id
            WHERE u.id = $1
            ORDER BY la.due_date ASC NULLS LAST, la.created_at DESC
            LIMIT 12
          `,
          [studentId],
        ),
      ]);

    const todayAttendance = attendanceTodayResult.rows[0] || null;
    const overview = mapOverview(overviewResult.rows);
    const pendingAssignments = assignmentResult.rows.filter((item) => !item.submission_id);
    const gradedAssignments = assignmentResult.rows.filter(
      (item) => item.score !== null && item.score !== undefined,
    );

    overview.pending_assignments = pendingAssignments.length;
    overview.graded_assignments = gradedAssignments.length;

    return successResponse(res, 200, "Success Get Siswa Dashboard", {
      generatedAt: new Date().toISOString(),
      student: studentResult.rows[0] || null,
      todayAttendance,
      overview,
      recentAttendance: attendanceResult.rows,
      recentReceipts: receiptResult.rows,
      pendingAssignments,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Siswa Dashboard", error.message);
  }
};

module.exports = {
  getSuperAdminDashboard,
  getAdminDashboard,
  getGuruDashboard,
  getSiswaDashboard,
};
