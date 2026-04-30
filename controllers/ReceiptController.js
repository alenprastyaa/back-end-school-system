const { CreateReceipt, GetReceipts } = require("../models/ReceiptModel");
const { successResponse, errorResponse } = require("../utils/response");
const { uploadImage } = require("../utils/upload");
const fs = require("fs");

const removeLocalUpload = (filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};

const CreateReceipts = async (req, res)=>{
    try {
    const { payment_date, description } = req.body;
    const userId = req.userId;

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Image is required",
        });
    }

    if (!payment_date) {
        removeLocalUpload(req.file.path);
        return errorResponse(res, 400, "Tanggal pembayaran wajib diisi");
    }

    const imageUrl = await uploadImage(req.file);
    removeLocalUpload(req.file.path);

    const receipt = await CreateReceipt(imageUrl, payment_date, description, userId);
    return successResponse(res, 201, "Success Create Receipt", receipt);
    } catch (error) {
        removeLocalUpload(req.file?.path);
        return errorResponse(res, 500, "Faild Create Receipt", error.message);
    }
}

const GetReceipt = async (req, res) => {
    try {
        const userId = req.userId;
        const receipt = await GetReceipts(userId);
        return successResponse(res, 200, "Success Get Data Receipt", receipt);
    } catch (error) {
        return errorResponse(res, 500, "Failed Get Data Receipt");
    }
};


module.exports = {CreateReceipts, GetReceipt}
