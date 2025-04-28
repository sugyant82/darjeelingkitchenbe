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
const emailTemplateOrderFailed = fs.readFileSync(path.join(__dirname, '../template/order-confirmation-failure-template.html'), 'utf8');

// Replace placeholders with real data
function renderTemplate(template, data) {

    // Extract last 5 characters and capitalize them
    console.log("Original Order ID:", data.orderId);
    console.log("Type of Order ID:", typeof data.orderId);
    console.log("Stringified Order ID:", String(data.orderId));
    const formattedOrderId = String(data.orderId).slice(-5).toUpperCase();

    const deliveryCharge = Number(data.deliveryCharge) || 0; // fallback to 0 if undefined
    const total = Number(data.total) || 0;

    return template
        .replace('{{customerName}}', data.customerName)
        .replace('{{orderItems}}', data.orderItems.map(item => `<li>${item.name} x ${item.quantity} = $${(item.price * item.quantity).toFixed(2)}</li>`).join(''))
        .replace('{{deliveryCharge}}', deliveryCharge.toFixed(2))
        .replace('{{total}}', total.toFixed(2))
        .replace('{{deliveryTime}}', data.deliveryTime)
        .replace('{{orderId}}', formattedOrderId);
}


// Send email function
const sendOrderConfirmationEmail = async (toEmail, customerName, orderId, orderItems, deliveryCharge, totalAmount) => {
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
        deliveryCharge,
        deliveryTime: "within 2 hours",
        orderId,
    });

    const mailOptions = {
        from: `"Darjeeling Momo NZ" <${process.env.SMTP_EMAIL}>`,
        to: toEmail,
        subject: "Your Order is Confirmed - Darjeeling Momo NZ",
        html: htmlContent
    };

    await transporter.sendMail(mailOptions);
};

// Send email function
const sendOrderPaymentFailednEmail = async (toEmail, customerName, orderId, orderItems, deliveryCharge, totalAmount, error) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
    });

    const htmlContent = renderTemplate(emailTemplateOrderFailed, {
        customerName,
        orderItems,
        total: totalAmount,
        orderId,
        errorMessage:error.message,
        errorCode:error.code,
    });

    const mailOptions = {
        from: `"Darjeeling Momo NZ" <${process.env.SMTP_EMAIL}>`,
        to: toEmail,
        subject: "Payment Failed for Your Order - Darjeeling Momo NZ",
        html: htmlContent
    };

    await transporter.sendMail(mailOptions);
};

//placing user order for frontend
const placeOrder = async (req, res) => {

    const frontend_url = "https://darjeelingmomonz.com";
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
            paymentMethod: "stripe",
        })
        await newOrder.save();
        await userModel.findByIdAndUpdate(req.body.userId, { cartData: {} });
    }
    catch{
        console.log(error);
        res.json({ success: false, message: "Error Inserting recod into database" })
    }
    try {
        // Send email confirmation
        const user = await userModel.findById(req.body.userId);
        if (user && user.email) {
            await sendOrderConfirmationEmail(
                user.email,
                `${req.body.address.firstName} ${req.body.address.lastName}`,
                newOrder._id,
                req.body.items,
                deliveryCharge,
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
        // Send email for failed payment
        const user = await userModel.findById(req.body.userId);
        if (user && user.email) {
            await sendOrderPaymentFailednEmail(
                user.email,
                `${req.body.address.firstName} ${req.body.address.lastName}`,
                newOrder._id,
                req.body.items,
                parseFloat(req.body.amount),
                error
            );
        }
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
