import express from "express";
import { addFood, listFood, removeFood } from "../controllers/foodController.js";
import multer from "multer";

const foodRouter = express.Router();

// Image storage engine
const storage = multer.diskStorage({
    destination: "uploads",
    filename: (req, file, cb) => {
        return cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({ storage: storage });

foodRouter.post("/add", upload.single("image"), (req, res, next) => {
    // Add a timeout before calling the next middleware (addFood)
    setTimeout(() => {
        addFood(req, res, next);
    }, 2000); // Delay of 2000 milliseconds (2 seconds)
});

foodRouter.get("/list",listFood)

foodRouter.post("/remove",removeFood);

export default foodRouter;
