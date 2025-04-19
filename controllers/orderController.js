import authMiddleware from "../middleware/auth.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Stripe from "stripe";
import orderRouter from "../routes/orderRoute.js";
import nodemailer from "nodemailer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const sendOrderConfirmationEmail = async (toEmail, name, orderId, orderItems, totalAmount) => {
    const transporter = nodemailer.createTransport({
      service: 'gmail', // or use your SMTP provider
      auth: {
        user: process.env.SMTP_EMAIL,      // your email address
        pass: process.env.SMTP_PASSWORD    // your email password or app-specific password
      }
    });
  
    const itemList = orderItems.map(item =>
      `<li>${item.name} x ${item.quantity} = $${item.price * item.quantity}</li>`
    ).join("");
  
    const mailOptions = {
      from: `"Darjeeling Momo" <${process.env.SMTP_EMAIL}>`,
      to: toEmail,
      subject: "Your Order Confirmation",
      html: `
        <h3>Hi ${name},</h3>
        <p>Thanks for your order. Your order ID is <strong>${orderId}</strong>.</p>
        <ul>${itemList}</ul>
        <p><strong>Total:</strong> $${totalAmount.toFixed(2)}</p>
        <p>We will notify you once your order is on the way!</p>
        <p>Cheers,<br>Darjeeling Momo Team</p>
      `
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
                parseFloat(req.body.amount) + parseFloat(deliveryCharge)
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
