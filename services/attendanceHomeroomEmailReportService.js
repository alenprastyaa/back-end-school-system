const fs = require("fs");
const pool = require("../config/database");
const { transporter } = require("../config/mail");
const { createAttendancePdfReport } = require("../utils/pdfReport");

const formatTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
};

const formatDateLabel = (value) =>
  new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

const getAttendanceReportClasses = async (schoolId = null, date = null) => {
  const values = [];
  let whereClause = `
    WHERE c.wali_guru_id IS NOT NULL
      AND COALESCE(w.parent_email, '') <> ''
  `;

  if (schoolId) {
    values.push(schoolId);
    whereClause += ` AND c.school_id = $${values.length}`;
  }

  values.push(date || new Date().toISOString().slice(0, 10));

  const result = await pool.query(
    `
      SELECT
        c.id,
        c.class_name,
        c.school_id,
        s.name AS school_name,
        w.username AS wali_guru_name,
        w.parent_email AS wali_guru_email,
        COUNT(st.id)::int AS total_students,
        COUNT(a.user_id)::int AS present_students,
        COUNT(CASE WHEN a.clock_out IS NOT NULL THEN 1 END)::int AS checked_out_students
      FROM class c
      LEFT JOIN schools s ON s.id = c.school_id
      LEFT JOIN users w ON w.id = c.wali_guru_id
      LEFT JOIN users st ON st.class_id = c.id AND st.role = 'SISWA'
      LEFT JOIN attendance a ON a.user_id = st.id AND a.attendance_date = $${values.length}
      ${whereClause}
      GROUP BY c.id, c.class_name, c.school_id, s.name, w.username, w.parent_email
      ORDER BY s.name ASC, c.class_name ASC
    `,
    values,
  );

  return result.rows;
};

const getAttendanceStudentsByClass = async (classId, date = null) => {
  const reportDate = date || new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `
      SELECT
        st.id,
        st.username,
        a.clock_in,
        a.clock_out,
        a.status
      FROM users st
      LEFT JOIN attendance a ON a.user_id = st.id AND a.attendance_date = $2
      WHERE st.class_id = $1 AND st.role = 'SISWA'
      ORDER BY st.username ASC
    `,
    [classId, reportDate],
  );

  return result.rows.map((item) => ({
    ...item,
    statusLabel: item.clock_in ? "Sudah Absen" : "Belum Absen",
    clockIn: formatTime(item.clock_in),
    clockOut: formatTime(item.clock_out),
  }));
};

const buildEmailHtml = ({
  className,
  schoolName,
  waliName,
  reportDate,
  totalStudents,
  presentStudents,
  absentStudents,
  checkedOutStudents,
  absentPreview,
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Laporan Absensi</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 40px 20px; color: #1e293b;">
  
  <table width="100%" max-width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width: 600px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; border-collapse: collapse;">
    
    <!-- Header Section -->
    <tr>
      <td style="background-color: #1e293b; padding: 32px 30px; text-align: left; border-bottom: 4px solid #3b82f6;">
        <p style="margin: 0 0 6px; color: #94a3b8; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Rekapitulasi Kehadiran Harian</p>
        <h1 style="margin: 0 0 8px; color: #f8fafc; font-size: 26px; font-weight: 700;">Kelas ${className}</h1>
        <p style="margin: 0; color: #cbd5e1; font-size: 14px; font-weight: 500;">${schoolName || "Sekolah"} &bull; ${formatDateLabel(reportDate)}</p>
      </td>
    </tr>

    <!-- Body Section -->
    <tr>
      <td style="padding: 30px;">
        <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #334155;">
          Yth. Bapak/Ibu <strong>${waliName || "Wali Kelas"}</strong>,<br>
          Berikut adalah ringkasan absensi siswa pada hari ini:
        </p>

        <!-- Stats Data Table -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
          <tr>
            <!-- Total Siswa -->
            <td width="25%" style="padding: 16px 10px; background-color: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Total Siswa</div>
              <div style="font-size: 22px; font-weight: 800; color: #0f172a;">${totalStudents}</div>
            </td>
            <!-- Hadir -->
            <td width="25%" style="padding: 16px 10px; background-color: #f0fdf4; border: 1px solid #bbf7d0; text-align: center;">
              <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase; margin-bottom: 6px;">Sudah Absen</div>
              <div style="font-size: 22px; font-weight: 800; color: #15803d;">${presentStudents}</div>
            </td>
            <!-- Belum Absen -->
            <td width="25%" style="padding: 16px 10px; background-color: #fef2f2; border: 1px solid #fecaca; text-align: center;">
              <div style="font-size: 11px; font-weight: 700; color: #991b1b; text-transform: uppercase; margin-bottom: 6px;">Belum Absen</div>
              <div style="font-size: 22px; font-weight: 800; color: #b91c1c;">${absentStudents}</div>
            </td>
            <!-- Check-out -->
            <td width="25%" style="padding: 16px 10px; background-color: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Check-out</div>
              <div style="font-size: 22px; font-weight: 800; color: #0f172a;">${checkedOutStudents}</div>
            </td>
          </tr>
        </table>

        <!-- Absent Students Alert -->
        ${absentPreview ? `
        <div style="background-color: #fff1f2; border: 1px solid #ffe4e6; border-left: 4px solid #e11d48; padding: 16px 20px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 6px; font-size: 14px; color: #9f1239; font-weight: 700; text-transform: uppercase;">Daftar Siswa Belum Absen:</h3>
          <p style="margin: 0; font-size: 14px; color: #881337; line-height: 1.5; font-weight: 500;">${absentPreview}</p>
        </div>
        ` : `
        <div style="background-color: #f0fdfa; border: 1px solid #ccfbf1; border-left: 4px solid #0d9488; padding: 16px 20px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 14px; color: #0f766e; font-weight: 600;">Seluruh siswa di kelas ini telah tercatat hadir pada sistem.</p>
        </div>
        `}

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">

        <!-- Footer Instructions -->
        <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
          <strong style="color: #475569;">Pemberitahuan:</strong> Detail lengkap daftar presensi siswa beserta stempel waktu <em>(timestamp)</em> dapat Anda lihat pada lampiran dokumen PDF email ini. Laporan ini di-generate secara otomatis oleh sistem.
        </p>
      </td>
    </tr>
  </table>

</body>
</html>
`;

const sendHomeroomAttendanceEmailReports = async ({ schoolId = null, date = null } = {}) => {
  const reportDate = date || new Date().toISOString().slice(0, 10);
  const classes = await getAttendanceReportClasses(schoolId, reportDate);
  const results = [];

  for (const currentClass of classes) {
    const students = await getAttendanceStudentsByClass(currentClass.id, reportDate);
    const absentStudents = students.filter((item) => !item.clock_in);
    const absentCount = Math.max(
      0,
      Number(currentClass.total_students || 0) - Number(currentClass.present_students || 0),
    );

    let pdfPath = null;
    try {
      pdfPath = await createAttendancePdfReport({
        filenamePrefix: `attendance-email-${currentClass.class_name.replace(/\s+/g, "-").toLowerCase()}`,
        title: `Laporan Absensi Kelas ${currentClass.class_name}`,
        subtitle: `Tanggal ${formatDateLabel(reportDate)} | ${currentClass.school_name || "Sekolah"}`,
        summaryLines: [
          `Wali Kelas: ${currentClass.wali_guru_name || "-"}`,
          `Total Siswa: ${currentClass.total_students || 0}`,
          `Sudah Absen: ${currentClass.present_students || 0}`,
          `Belum Absen: ${absentCount}`,
          `Sudah Check-out: ${currentClass.checked_out_students || 0}`,
        ],
        studentRows: students,
      });

      const absentPreview = absentStudents.length
        ? absentStudents.map((item) => item.username).slice(0, 10).join(", ")
        : "";

      await transporter.sendMail({
        from: `"Sistem Informasi Sekolah" <${process.env.EMAIL_USER}>`,
        to: currentClass.wali_guru_email,
        subject: `Rekap Absensi Harian - ${currentClass.class_name} - ${formatDateLabel(reportDate)}`,
        html: buildEmailHtml({
          className: currentClass.class_name,
          schoolName: currentClass.school_name,
          waliName: currentClass.wali_guru_name,
          reportDate,
          totalStudents: currentClass.total_students || 0,
          presentStudents: currentClass.present_students || 0,
          absentStudents: absentCount,
          checkedOutStudents: currentClass.checked_out_students || 0,
          absentPreview: absentPreview && absentStudents.length > 10
            ? `${absentPreview}, dan lainnya`
            : absentPreview,
        }),
        attachments: [
          {
            filename: `${currentClass.class_name}-attendance-${reportDate}.pdf`,
            path: pdfPath,
            contentType: "application/pdf",
          },
        ],
      });

      results.push({
        class_id: currentClass.id,
        class_name: currentClass.class_name,
        wali_guru_name: currentClass.wali_guru_name,
        target: currentClass.wali_guru_email,
        success: true,
      });
    } catch (error) {
      results.push({
        class_id: currentClass.id,
        class_name: currentClass.class_name,
        wali_guru_name: currentClass.wali_guru_name,
        target: currentClass.wali_guru_email,
        success: false,
        error: error.message,
      });
    } finally {
      if (pdfPath && fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }
  }

  return {
    date: reportDate,
    total_classes: classes.length,
    success_count: results.filter((item) => item.success).length,
    failed_count: results.filter((item) => !item.success).length,
    results,
  };
};

module.exports = {
  sendHomeroomAttendanceEmailReports,
};