const pool = require('../config/database')

const createAttendance = async (userId,imageUrl,status = "hadir") => {
  const result = await pool.query(
    `INSERT INTO attendance 
     (user_id, attendance_date, image, clock_in, status)
     VALUES ($1, CURRENT_DATE, $2, NOW(), $3)
     RETURNING *`,
    [userId, imageUrl, status]
  );
  return result.rows[0];
};

const checkAttendanceToday = async (userId) => {
  const result = await pool.query(
    `
    SELECT * FROM attendance
    WHERE user_id = $1
    AND attendance_date = CURRENT_DATE
    `,
    [userId]
  );

  return result.rows[0];
};

const addCheckOut = async (userId) => {
  const result = await pool.query(
    `UPDATE attendance
     SET clock_out = NOW()
     WHERE user_id = $1
       AND attendance_date = CURRENT_DATE
       AND clock_out IS NULL
     RETURNING *`,
    [userId]
  );
  return result.rows[0];
}



const getAttandace = async (userId, limit, offset) => {
  let query = `
  SELECT u.username, a.attendance_date, a.image, a.clock_in, a.clock_out, a.status
    FROM attendance a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.user_id = $1
  `
  let values = [userId]
  query += ` ORDER BY a.attendance_date DESC, a.clock_in DESC`;
  query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  values.push(limit, offset);

   const result = await pool.query(query, values);
  return result.rows;
};

const getAttendanceByStudentId = async (studentId, limit, offset) => {
  const result = await pool.query(
    `SELECT u.username, a.attendance_date, a.image, a.clock_in, a.clock_out, a.status
     FROM attendance a
     LEFT JOIN users u ON a.user_id = u.id
     WHERE a.user_id = $1
     ORDER BY a.attendance_date DESC, a.clock_in DESC
     LIMIT $2 OFFSET $3`,
    [studentId, limit, offset],
  );

  return result.rows;
};

module.exports = {createAttendance, addCheckOut, checkAttendanceToday, getAttandace, getAttendanceByStudentId}
