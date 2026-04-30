const pool = require('../config/database')


const CreateReceipt = async (image_path, payment_date, description, userId) => {
    const result = await pool.query(
        `INSERT INTO payment_receipt (image_path, periode, payment_date, description, user_id) 
         VALUES ($1, TO_CHAR($2::date, 'YYYY-MM'), $2, $3, $4) 
         RETURNING id, image_path, payment_date, description, created_at`,
        [image_path, payment_date, description, userId]
    );

    return result.rows[0];
};

const GetReceipts = async(user_id)=>{
     const result = await pool.query(
    `SELECT id, image_path, description, payment_date, created_at
     FROM payment_receipt
     WHERE user_id = $1
     ORDER BY payment_date DESC NULLS LAST, created_at DESC`,
    [user_id]
     )
     return result.rows;
}

const GetReceiptsByStudentId = async (studentId) => {
  const result = await pool.query(
    `SELECT id, image_path, description, payment_date, created_at
     FROM payment_receipt
     WHERE user_id = $1
     ORDER BY payment_date DESC NULLS LAST, created_at DESC`,
    [studentId],
  );

  return result.rows;
};

module.exports = {CreateReceipt, GetReceipts, GetReceiptsByStudentId}
