const pool = require("../config/database");

const ensureUserProfileColumn = async () => {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_image TEXT
  `);
};

module.exports = { ensureUserProfileColumn };
