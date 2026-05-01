const pool = require('../config/database');

const createUser = async (username, hashedPassword, role, schoolId, parentEmail = null, phoneNumber = null) => {
  const result = await pool.query(
    `INSERT INTO users (username, password, role, school_id, parent_email, phone_number)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, role, school_id, parent_email, phone_number, profile_image`,
    [username, hashedPassword, role, schoolId || null, parentEmail, phoneNumber]
  );
  return result.rows[0];
};

const createStudent = async (username, hashedPassword, role, schoolId, classId, parent_email, phone_number = null) => {
  const result = await pool.query(
    `INSERT 
        INTO users 
        (username, password, role, school_id, class_id, parent_email, phone_number) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING 
    id, username, role, school_id, class_id, parent_email, phone_number, profile_image`,
    [username, hashedPassword, role, schoolId, classId, parent_email || null, phone_number || null]
  );
  return result.rows[0];
};

const EditStudent = async (id, username, role, classId, parent_email,phone_number, schoolId ) => {
  const result = await pool.query(
    `UPDATE users
     SET 
       username = $1,
       role = $2,
       class_id = $3,
       parent_email = $4,
       phone_number = $5,
       school_id = $6
     WHERE id = $7
     RETURNING id, username, role, class_id, parent_email, phone_number, profile_image`,
    [username, role, classId, parent_email, phone_number, schoolId, id]
  );

  return result.rows[0];
};

const GetStudent = async (school_id, class_id, limit, offset) => {
  let query = `
    SELECT 
      u.id,
      u.username,
      u.class_id,
      u.parent_email,
      u.phone_number,
      cn.class_name
    FROM users u
    LEFT JOIN class cn ON u.class_id = cn.id
    WHERE u.role = $1
    AND u.school_id = $2
  `;

  let values = ["SISWA", school_id];

  if (class_id) {
    query += ` AND u.class_id = $3`;
    values.push(class_id);
  }
  query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);
  return result.rows;
};

const GetStudentsByHomeroomTeacher = async (teacherId, school_id, limit, offset) => {
  const result = await pool.query(
    `SELECT 
       u.id,
       u.username,
       u.class_id,
       u.parent_email,
       u.phone_number,
       cn.class_name,
       CASE WHEN a.user_id IS NULL THEN false ELSE true END AS checked_in_today,
       a.clock_in,
       a.clock_out,
       a.status AS attendance_status
     FROM users u
     INNER JOIN class cn ON u.class_id = cn.id
     LEFT JOIN attendance a
       ON a.user_id = u.id
      AND a.attendance_date = CURRENT_DATE
     WHERE u.role = 'SISWA'
       AND u.school_id = $1
       AND cn.wali_guru_id = $2
     ORDER BY u.username ASC
     LIMIT $3 OFFSET $4`,
    [school_id, teacherId, limit, offset],
  );

  return result.rows;
};


const getStudentById = async(id)=>{
     const result = await pool.query(
    `SELECT id, username, role, parent_email, class_id, phone_number, school_id, profile_image from users where id = $1`,
    [id]
     )
     return result.rows[0];
}

const getUsersByRoleAndSchool = async (schoolId, role) => {
  const values = [schoolId];
  let query = `
    SELECT id, username, role, school_id, parent_email, phone_number, profile_image
    FROM users
    WHERE school_id = $1
  `;

  if (role) {
    query += ` AND role = $2`;
    values.push(role);
  }

  query += ` ORDER BY username ASC`;

  const result = await pool.query(query, values);
  return result.rows;
};

const getUserById = async (id) => {
  const result = await pool.query(
    `SELECT id, username, password, role, school_id, parent_email, phone_number, profile_image
     FROM users
     WHERE id = $1`,
    [id],
  );

  return result.rows[0];
};

const getStudentsByClass = async (schoolId, classId) => {
  const result = await pool.query(
    `SELECT id, username, parent_email, phone_number, class_id, school_id, profile_image
     FROM users
     WHERE school_id = $1
       AND class_id = $2
       AND role = 'SISWA'
     ORDER BY username ASC`,
    [schoolId, classId],
  );

  return result.rows;
};

const updateUserSchool = async (
  id,
  username,
  role,
  schoolId,
  parentEmail = null,
  phoneNumber = null,
  hashedPassword = null,
) => {
  const values = [username, role, schoolId, id, parentEmail, phoneNumber];
  let query = `
    UPDATE users
    SET username = $1,
        role = $2,
        school_id = $3,
        parent_email = $5,
        phone_number = $6
  `;

  if (hashedPassword) {
    query += `, password = $7`;
    values.push(hashedPassword);
  }

  query += `
    WHERE id = $4
    RETURNING id, username, role, school_id, parent_email, phone_number, profile_image
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
};

const getOwnProfile = async (id) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.role, u.school_id, u.parent_email, u.phone_number, u.profile_image, s.name AS school_name
     FROM users u
     LEFT JOIN schools s ON s.id = u.school_id
     WHERE u.id = $1`,
    [id],
  );

  return result.rows[0];
};

const updateOwnProfile = async ({
  id,
  hashedPassword = null,
  profileImage = undefined,
}) => {
  const values = [id];
  const updates = [];

  if (hashedPassword) {
    values.push(hashedPassword);
    updates.push(`password = $${values.length}`);
  }

  if (profileImage !== undefined) {
    values.push(profileImage);
    updates.push(`profile_image = $${values.length}`);
  }

  if (updates.length === 0) {
    return getOwnProfile(id);
  }

  const result = await pool.query(
    `UPDATE users
     SET ${updates.join(", ")}
     WHERE id = $1
     RETURNING id, username, role, school_id, parent_email, phone_number, profile_image`,
    values,
  );

  return result.rows[0];
};


const deleteUserById = async (id, school_id) => {
  const result = await pool.query(
    `DELETE FROM users WHERE id = $1 AND school_id = $2 RETURNING id, username, role`,
    [id, school_id]
  );
  return result.rows[0];
};

module.exports = { createUser, findByUsername, createStudent, GetStudent, GetStudentsByHomeroomTeacher, EditStudent, getStudentById, getUsersByRoleAndSchool, getUserById, getStudentsByClass, updateUserSchool, getOwnProfile, updateOwnProfile, deleteUserById };
