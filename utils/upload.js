import { format } from "morgan";
import cloudinary from "../config/cloudinary.js";

export const UploadImage = async (img, oldImg) => {
    return new Promise(async (resolve, reject) => {
        try {
            ///--------------------- cloudinary -------------
            if (oldImg) {
                const spliturl = oldImg.split("/");
                const img_id = spliturl[spliturl.length - 1].split(".")[0];
                await cloudinary.uploader.destroy(img_id);
            }

            const base64 = img.toString("base64");
            const imgPath = `data:image/webp;base64,${base64}`;
            const cloudinaryUpload = await cloudinary.uploader.upload(imgPath, {
                public_id: `IMG_${Date.now()}`,
                resource_type: "auto",
                format: "webp",
            });

            return resolve(cloudinaryUpload.url);
        } catch (err) {
            console.log("upload image error ", err);
            reject(err);
        }
    });
};

export const UploadFile = async (file, oldFile) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Check if there's an old file to delete
            if (oldFile) {
                const spliturl = oldFile.split("/");
                const file_id = spliturl[spliturl.length - 1].split(".")[0];
                await cloudinary.uploader.destroy(file_id, {
                    resource_type: "raw", // 'raw' is used for non-image/video files like PDFs
                });
            }

            // Convert the file to a base64 string and prepare it for upload
            const base64 = file.data.toString("base64");
            const filePath = `data:${file.mimetype};base64,${base64}`;
            const cloudinaryUpload = await cloudinary.uploader.upload(filePath, {
                public_id: `FILE_${Date.now()}`,
                resource_type: "raw", // 'raw' for files like PDFs
                format: "pdf", // Explicitly specify the format if you want it to be treated as a PDF
            });

            // Resolve the promise with the uploaded file's URL
            return resolve(cloudinaryUpload.url);
        } catch (err) {
            // Reject the promise in case of an error
            reject(err);
        }
    });
};
