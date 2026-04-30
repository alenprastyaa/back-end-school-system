const pool = require("../config/database");

let schemaReadyPromise = null;

const ensureAcademicPeriodSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS academic_years (
          id SERIAL PRIMARY KEY,
          school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
          name VARCHAR(50) NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS academic_semesters (
          id SERIAL PRIMARY KEY,
          academic_year_id INT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          name VARCHAR(50) NOT NULL,
          code VARCHAR(30) NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS academic_years_school_name_unique
        ON academic_years (school_id, name)
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS academic_semesters_year_code_unique
        ON academic_semesters (academic_year_id, UPPER(code))
      `);
    })();
  }

  return schemaReadyPromise;
};

const getAcademicYearsBySchool = async (schoolId) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      SELECT
        ay.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sem.id,
              'academic_year_id', sem.academic_year_id,
              'name', sem.name,
              'code', sem.code,
              'start_date', sem.start_date,
              'end_date', sem.end_date,
              'is_active', sem.is_active,
              'created_at', sem.created_at,
              'updated_at', sem.updated_at
            )
            ORDER BY sem.start_date ASC, sem.id ASC
          ) FILTER (WHERE sem.id IS NOT NULL),
          '[]'::json
        ) AS semesters
      FROM academic_years ay
      LEFT JOIN academic_semesters sem ON sem.academic_year_id = ay.id
      WHERE ay.school_id = $1
      GROUP BY ay.id
      ORDER BY ay.start_date DESC, ay.id DESC
    `,
    [schoolId],
  );

  return result.rows.map((item) => ({
    ...item,
    semesters: Array.isArray(item.semesters) ? item.semesters : [],
  }));
};

const getAcademicYearById = async (id) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      SELECT *
      FROM academic_years
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0];
};

const createAcademicYear = async ({ schoolId, name, startDate, endDate }) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      INSERT INTO academic_years (
        school_id,
        name,
        start_date,
        end_date
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [schoolId, name, startDate, endDate],
  );
  return result.rows[0];
};

const updateAcademicYear = async ({ id, name, startDate, endDate }) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      UPDATE academic_years
      SET name = $2,
          start_date = $3,
          end_date = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, name, startDate, endDate],
  );
  return result.rows[0];
};

const activateAcademicYear = async (id) => {
  await ensureAcademicPeriodSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const yearResult = await client.query(
      `
        SELECT *
        FROM academic_years
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );
    const academicYear = yearResult.rows[0];

    if (!academicYear) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `
        UPDATE academic_years
        SET is_active = CASE WHEN id = $2 THEN true ELSE false END,
            updated_at = NOW()
        WHERE school_id = $1
      `,
      [academicYear.school_id, id],
    );

    const activeSemesterResult = await client.query(
      `
        SELECT sem.id
        FROM academic_semesters sem
        INNER JOIN academic_years ay ON ay.id = sem.academic_year_id
        WHERE sem.academic_year_id = $1
          AND sem.is_active = true
          AND ay.school_id = $2
        LIMIT 1
      `,
      [id, academicYear.school_id],
    );

    await client.query(
      `
        UPDATE academic_semesters
        SET is_active = CASE
              WHEN $1::int IS NOT NULL AND id = $1 THEN true
              ELSE false
            END,
            updated_at = NOW()
        WHERE academic_year_id IN (
          SELECT id FROM academic_years WHERE school_id = $2
        )
      `,
      [activeSemesterResult.rows[0]?.id || null, academicYear.school_id],
    );

    await client.query("COMMIT");
    return getAcademicYearById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getSemesterById = async (id) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      SELECT
        sem.*,
        ay.school_id,
        ay.name AS academic_year_name
      FROM academic_semesters sem
      INNER JOIN academic_years ay ON ay.id = sem.academic_year_id
      WHERE sem.id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0];
};

const createSemester = async ({ academicYearId, name, code, startDate, endDate }) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      INSERT INTO academic_semesters (
        academic_year_id,
        name,
        code,
        start_date,
        end_date
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [academicYearId, name, code, startDate, endDate],
  );
  return result.rows[0];
};

const updateSemester = async ({ id, name, code, startDate, endDate }) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      UPDATE academic_semesters
      SET name = $2,
          code = $3,
          start_date = $4,
          end_date = $5,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, name, code, startDate, endDate],
  );
  return result.rows[0];
};

const activateSemester = async (id) => {
  await ensureAcademicPeriodSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const semesterResult = await client.query(
      `
        SELECT
          sem.*,
          ay.school_id
        FROM academic_semesters sem
        INNER JOIN academic_years ay ON ay.id = sem.academic_year_id
        WHERE sem.id = $1
        LIMIT 1
      `,
      [id],
    );
    const semester = semesterResult.rows[0];

    if (!semester) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `
        UPDATE academic_years
        SET is_active = CASE WHEN id = $2 THEN true ELSE false END,
            updated_at = NOW()
        WHERE school_id = $1
      `,
      [semester.school_id, semester.academic_year_id],
    );

    await client.query(
      `
        UPDATE academic_semesters
        SET is_active = CASE WHEN id = $2 THEN true ELSE false END,
            updated_at = NOW()
        WHERE academic_year_id IN (
          SELECT id FROM academic_years WHERE school_id = $1
        )
      `,
      [semester.school_id, id],
    );

    await client.query("COMMIT");
    return getSemesterById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getActiveAcademicPeriod = async (schoolId) => {
  await ensureAcademicPeriodSchema();
  const result = await pool.query(
    `
      SELECT
        ay.id AS academic_year_id,
        ay.name AS academic_year_name,
        ay.start_date AS academic_year_start_date,
        ay.end_date AS academic_year_end_date,
        sem.id AS semester_id,
        sem.name AS semester_name,
        sem.code AS semester_code,
        sem.start_date AS semester_start_date,
        sem.end_date AS semester_end_date
      FROM academic_years ay
      LEFT JOIN academic_semesters sem
        ON sem.academic_year_id = ay.id
       AND sem.is_active = true
      WHERE ay.school_id = $1
        AND ay.is_active = true
      ORDER BY ay.start_date DESC
      LIMIT 1
    `,
    [schoolId],
  );

  return result.rows[0] || null;
};

module.exports = {
  ensureAcademicPeriodSchema,
  getAcademicYearsBySchool,
  getAcademicYearById,
  createAcademicYear,
  updateAcademicYear,
  activateAcademicYear,
  getSemesterById,
  createSemester,
  updateSemester,
  activateSemester,
  getActiveAcademicPeriod,
};
