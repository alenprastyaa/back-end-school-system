const pool = require("../config/database");
const { successResponse, errorResponse } = require("../utils/response");

const RESET_SCOPES = {
  teachers: {
    label: "Guru",
    description: "Menghapus semua akun guru pada sekolah ini.",
  },
  students: {
    label: "Siswa",
    description: "Menghapus semua akun siswa pada sekolah ini beserta data terkait siswa.",
  },
  classes: {
    label: "Kelas",
    description: "Menghapus semua kelas pada sekolah ini.",
  },
  subjects: {
    label: "Mapel Pembelajaran",
    description: "Menghapus semua mapel pembelajaran beserta materi, chat, quiz, ujian, dan bank soal yang terkait.",
  },
  question_bank: {
    label: "Bank Soal",
    description: "Menghapus seluruh bank soal pada sekolah ini.",
  },
  quizzes: {
    label: "Quiz",
    description: "Menghapus semua quiz biasa beserta submission siswa.",
  },
  official_exams: {
    label: "Ujian Resmi",
    description: "Menghapus semua ujian resmi beserta submission siswa.",
  },
  attendance: {
    label: "Absensi",
    description: "Menghapus seluruh riwayat absensi siswa pada sekolah ini.",
  },
  receipts: {
    label: "Bukti Pembayaran",
    description: "Menghapus seluruh bukti pembayaran siswa pada sekolah ini.",
  },
};

const getSettingsSummary = async (req, res) => {
  try {
    const schoolId = Number(req.schoolId);
    const countsResult = await pool.query(
      `
        WITH subject_scope AS (
          SELECT id
          FROM learning_subjects
          WHERE school_id = $1
        )
        SELECT json_build_object(
          'teachers', (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'GURU'),
          'students', (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'SISWA'),
          'classes', (SELECT COUNT(*)::int FROM class WHERE school_id = $1),
          'subjects', (SELECT COUNT(*)::int FROM learning_subjects WHERE school_id = $1),
          'question_bank', (SELECT COUNT(*)::int FROM learning_question_bank WHERE subject_id IN (SELECT id FROM subject_scope)),
          'quizzes', (SELECT COUNT(*)::int FROM learning_assignments WHERE subject_id IN (SELECT id FROM subject_scope) AND COALESCE(is_exam, false) = false AND assignment_type IN ('MCQ', 'ESSAY')),
          'official_exams', (SELECT COUNT(*)::int FROM learning_assignments WHERE subject_id IN (SELECT id FROM subject_scope) AND COALESCE(is_exam, false) = true),
          'attendance', (SELECT COUNT(*)::int FROM attendance WHERE user_id IN (SELECT id FROM users WHERE school_id = $1 AND role = 'SISWA')),
          'receipts', (SELECT COUNT(*)::int FROM payment_receipt WHERE user_id IN (SELECT id FROM users WHERE school_id = $1 AND role = 'SISWA'))
        ) AS counts
      `,
      [schoolId],
    );

    const counts = countsResult.rows[0]?.counts || {};
    const items = Object.entries(RESET_SCOPES).map(([key, meta]) => ({
      key,
      label: meta.label,
      description: meta.description,
      count: Number(counts[key] || 0),
    }));

    return successResponse(res, 200, "Success Get Admin Settings Summary", { items });
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Admin Settings Summary", error.message);
  }
};

const resetAdminScope = async (req, res) => {
  const { scope, confirm_text } = req.body || {};
  const normalizedScope = String(scope || "").trim().toLowerCase();

  if (!RESET_SCOPES[normalizedScope]) {
    return errorResponse(res, 400, "Invalid reset scope");
  }

  if (String(confirm_text || "").trim().toUpperCase() !== "RESET") {
    return errorResponse(res, 400, "confirm_text must be RESET");
  }

  const schoolId = Number(req.schoolId);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (normalizedScope === "teachers") {
      await client.query(`UPDATE class SET wali_guru_id = NULL WHERE school_id = $1`, [schoolId]);
      await client.query(`DELETE FROM users WHERE school_id = $1 AND role = 'GURU'`, [schoolId]);
    }

    if (normalizedScope === "students") {
      await client.query(`DELETE FROM users WHERE school_id = $1 AND role = 'SISWA'`, [schoolId]);
    }

    if (normalizedScope === "classes") {
      await client.query(`UPDATE users SET class_id = NULL WHERE school_id = $1 AND role = 'SISWA'`, [schoolId]);
      await client.query(`UPDATE class SET wali_guru_id = NULL WHERE school_id = $1`, [schoolId]);
      await client.query(`DELETE FROM class WHERE school_id = $1`, [schoolId]);
    }

    if (normalizedScope === "subjects") {
      await client.query(`DELETE FROM learning_subjects WHERE school_id = $1`, [schoolId]);
    }

    if (normalizedScope === "question_bank") {
      await client.query(
        `
          DELETE FROM learning_question_bank
          WHERE subject_id IN (
            SELECT id
            FROM learning_subjects
            WHERE school_id = $1
          )
        `,
        [schoolId],
      );
    }

    if (normalizedScope === "quizzes") {
      await client.query(
        `
          DELETE FROM learning_assignments
          WHERE subject_id IN (
            SELECT id
            FROM learning_subjects
            WHERE school_id = $1
          )
          AND COALESCE(is_exam, false) = false
          AND assignment_type IN ('MCQ', 'ESSAY')
        `,
        [schoolId],
      );
    }

    if (normalizedScope === "official_exams") {
      await client.query(
        `
          DELETE FROM learning_assignments
          WHERE subject_id IN (
            SELECT id
            FROM learning_subjects
            WHERE school_id = $1
          )
          AND COALESCE(is_exam, false) = true
        `,
        [schoolId],
      );
    }

    if (normalizedScope === "attendance") {
      await client.query(
        `
          DELETE FROM attendance
          WHERE user_id IN (
            SELECT id
            FROM users
            WHERE school_id = $1
              AND role = 'SISWA'
          )
        `,
        [schoolId],
      );
    }

    if (normalizedScope === "receipts") {
      await client.query(
        `
          DELETE FROM payment_receipt
          WHERE user_id IN (
            SELECT id
            FROM users
            WHERE school_id = $1
              AND role = 'SISWA'
          )
        `,
        [schoolId],
      );
    }

    await client.query("COMMIT");
    return successResponse(res, 200, "Success Reset Admin Scope", {
      scope: normalizedScope,
      label: RESET_SCOPES[normalizedScope].label,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return errorResponse(res, 500, "Failed Reset Admin Scope", error.message);
  } finally {
    client.release();
  }
};

module.exports = {
  getSettingsSummary,
  resetAdminScope,
};
