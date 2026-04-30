const pool = require("../config/database");

const ensurePaymentReceiptPaymentDateColumn = async () => {
  await pool.query(`
    ALTER TABLE payment_receipt
    ADD COLUMN IF NOT EXISTS payment_date DATE
  `);

  await pool.query(`
    UPDATE payment_receipt
    SET payment_date = COALESCE(payment_date, created_at::date)
    WHERE payment_date IS NULL
  `);
};

module.exports = { ensurePaymentReceiptPaymentDateColumn };
