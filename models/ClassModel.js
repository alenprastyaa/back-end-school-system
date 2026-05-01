const pool = require('../config/database')

const createClass = async (class_name, school_id, wali_guru_id = null) => {
  const result = await pool.query(
    `INSERT INTO class (class_name, school_id, wali_guru_id)
     VALUES ($1, $2, $3)
     RETURNING id, class_name, school_id, wali_guru_id`,
    [class_name, school_id || null, wali_guru_id]
  );
  return result.rows[0];
};

const getClass = async(school_id)=>{
     const result = await pool.query(
    `SELECT
       c.id,
       c.class_name,
       c.school_id,
       c.wali_guru_id,
       u.username AS wali_guru_name,
       u.parent_email AS wali_guru_email,
       u.phone_number AS wali_guru_phone_number
     FROM class c
     LEFT JOIN users u ON c.wali_guru_id = u.id
     WHERE c.school_id = $1
     ORDER BY c.class_name ASC`,
    [school_id]
     )
     return result.rows;
}

const getClassById = async(id)=>{
     const result = await pool.query(
    `SELECT id, class_name, school_id, wali_guru_id from class where id = $1`,
    [id]
     )
     return result.rows[0];
}

const updateClass = async (id, class_name, school_id, wali_guru_id = null) => {
  const result = await pool.query(
    `UPDATE class
     SET class_name = $1,
         school_id = $2,
         wali_guru_id = $3
     WHERE id = $4
     RETURNING id, class_name, school_id, wali_guru_id`,
    [class_name, school_id, wali_guru_id, id],
  );

  return result.rows[0];
};

const getClassByWaliGuru = async (wali_guru_id, school_id) => {
  const result = await pool.query(
    `SELECT
       c.id,
       c.class_name,
       c.school_id,
       c.wali_guru_id,
       u.username AS wali_guru_name,
       u.parent_email AS wali_guru_email,
       u.phone_number AS wali_guru_phone_number
     FROM class c
     LEFT JOIN users u ON c.wali_guru_id = u.id
     WHERE c.wali_guru_id = $1 AND c.school_id = $2`,
    [wali_guru_id, school_id],
  );

  return result.rows[0];
};

const deleteClass = async (id, school_id) => {
  const result = await pool.query(
    `DELETE FROM class WHERE id = $1 AND school_id = $2 RETURNING id, class_name`,
    [id, school_id]
  );
  return result.rows[0];
};

module.exports = {createClass, getClass, getClassById, updateClass, getClassByWaliGuru, deleteClass}
