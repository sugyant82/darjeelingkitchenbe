import express from 'express'
import cors from "cors"
import { connectDB } from './config/db.js'
import foodRouter from './routes/foodRoute.js'
import userRouter from './routes/userroute.js'
import 'dotenv/config'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'

import bodyParser from 'body-parser';
import admin from './firebaseAdmin.js';


//app config
const app=express()
const port =process.env.PORT

app.use(bodyParser.json());

//middleware
app.use(express.json())

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://darjeelingmomonz.vercel.app',
  'https://darjeelingkitchenadm.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));




//db connection
connectDB();

//api endpoints
app.use("/api/food", foodRouter)
app.use("/images",express.static('uploads'))
app.use("/api/user",userRouter)
app.use("/api/cart",cartRouter)
app.use("/api/order",orderRouter)

app.get("/",(req,res)=>{
    res.send("Api is working")
})

app.post('/verifyToken', async (req, res) => {
    const idToken = req.body.token;
  
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
  
      console.log('✅ Verified UID:', uid);
      res.json({ status: 'success', uid, decodedToken });
    } catch (error) {
      console.error('❌ Token verification failed:', error);
      res.status(401).json({ status: 'error', message: 'Invalid token' });
    }
  });

app.listen(port, ()=>{
    console.log(`Server started on http://localhost:${port}`)
})






