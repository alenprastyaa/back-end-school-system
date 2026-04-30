const pool = require('../config/database')

const createSchool = async (name) => {
  const result = await pool.query(
    'INSERT INTO schools (name) VALUES ($1) RETURNING id, name',
    [name || null]
  );
  return result.rows[0];
};

const findSchoolByName = async (name) => {
  const result = await pool.query('SELECT * FROM schools WHERE name = $1', [name]);
  return result.rows[0];
};
const findSchoolById = async (id) => {
  const result = await pool.query('SELECT * FROM schools WHERE id = $1', [id]);
  return result.rows[0];
};
const getAllSchools = async () => {
  const result = await pool.query(
    `SELECT id, name
     FROM schools
     ORDER BY name ASC`,
  );
  return result.rows;
};

module.exports = { createSchool, findSchoolByName, findSchoolById, getAllSchools }
