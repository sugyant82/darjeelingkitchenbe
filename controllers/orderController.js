import authMiddleware from "../middleware/auth.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Setup __dirname for ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read HTML email template
const emailTemplate = fs.readFileSync(path.join(__dirname, '../template/order-confirmation-template.html'), 'utf8');

// Replace placeholders with real data
function renderTemplate(template, data) {
  return template
    .replace('{{customerName}}', data.customerName)
    .replace('{{orderItems}}', data.orderItems.map(item => `<li>${item.name} x ${item.quantity} = $${(item.price * item.quantity).toFixed(2)}</li>`).join(''))
    .replace('{{total}}', `$${data.total.toFixed(2)}`)
    .replace('{{deliveryTime}}', data.deliveryTime);
}

// Send email function
const sendOrderConfirmationEmail = async (toEmail, customerName, orderId, orderItems, totalAmount) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD
    }
  });

  const htmlContent = renderTemplate(emailTemplate, {
    customerName,
    orderItems,
    total: totalAmount,
    deliveryTime: "within 2 hours",
  });

  const mailOptions = {
    from: `"Darjeeling Momo NZ" <${process.env.SMTP_EMAIL}>`,
    to: toEmail,
    subject: "Your Order is Confirmed - Darjeeling Momo NZ",
    html: htmlContent
  };

  await transporter.sendMail(mailOptions);
};

//placing user order for frontend
const placeOrder = async (req, res) => {

    const frontend_url = "https://darjeelingmomonz.vercel.app";
    const deliveryCharge = req.body.deliveryCharges ? parseFloat(req.body.deliveryCharges).toFixed(2) : 0;
    //const frontend_url = //process.env.FE_URL;

    try {
        const newOrder = new orderModel({
            userId: req.body.userId,
            items: req.body.items,
            amount: req.body.amount,
            orderTime: req.body.orderTime,
            deliveryCharges: deliveryCharge,
            address: req.body.address,
        })
        await newOrder.save();
        await userModel.findByIdAndUpdate(req.body.userId, { cartData: {} });

        // Send email confirmation
        const user = await userModel.findById(req.body.userId);
        if (user && user.email) {
            await sendOrderConfirmationEmail(
                user.email,
                `${req.body.address.firstName} ${req.body.address.lastName}`,
                newOrder._id,
                req.body.items,
                parseFloat(req.body.amount)
            );
        }

        const line_items = req.body.items.map((item) => ({
            price_data: {
                currency: "nzd",
                product_data: {
                    name: item.name
                },
                unit_amount: item.price * 100
            },
            quantity: item.quantity
        }))

        line_items.push({
            price_data: {
                currency: "nzd",
                product_data: {
                    name: "Delivery Charges"
                },
                unit_amount: deliveryCharge * 100
            },
            quantity: 1
        })

        const session = await stripe.checkout.sessions.create({
            line_items: line_items,
            mode: 'payment',
            success_url: `${frontend_url}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url: `${frontend_url}/verify?success=false&orderId=${newOrder._id}`
        })

        res.json({ success: true, session_url: session.url });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error" })
    }
}

const verifyOrder = async (req, res) => {
    const { orderId, success } = req.body;

    try {
        if (success == "true") {
            await orderModel.findByIdAndUpdate(orderId, { payment: true });
            res.json({ success: true, message: "Paid" })
        }
        else {
            await orderModel.findByIdAndDelete(orderId);
            res.json({ success: false, message: "Not Paid" })
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error" })
    }
}

//userorders for frontend
const userOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({ userId: req.body.userId });
        res.json({ success: true, data: orders })
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error" });

    }
}

//Listing orders for admin panel
const listOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({});
        res.json({ success: true, data: orders })
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error" });
    }
}

//api for updating order status
const updateStatus = async (req, res) => {
    try {
        await orderModel.findByIdAndUpdate(req.body.orderId, { status: req.body.status });
        res.json({ success: true, message: "Status Updated" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error" });
    }
}

export { placeOrder, verifyOrder, userOrders, listOrders, updateStatus }
