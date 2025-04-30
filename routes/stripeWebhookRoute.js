import express from 'express';
import Stripe from 'stripe';
import orderModel from '../models/orderModel.js';
import userModel from '../models/userModel.js';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const stripeWebhookRouter = express.Router();
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Setup __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load email templates
const emailTemplateSuccess = fs.readFileSync(path.join(__dirname, '../template/order-confirmation-template.html'), 'utf8');
const emailTemplateFailure = fs.readFileSync(path.join(__dirname, '../template/order-confirmation-failure-template.html'), 'utf8');

// Helper to render email template
function renderTemplate(template, data) {
    const formattedOrderId = String(data.orderId).slice(-5).toUpperCase();
    const deliveryCharge = Number(data.deliveryCharge) || 0;
    const total = Number(data.total) || 0;

    return template
        .replace('{{customerName}}', data.customerName)
        .replace('{{orderItems}}', data.orderItems.map(item =>
            `<li>${item.name} x ${item.quantity} = $${(item.price * item.quantity).toFixed(2)}</li>`).join(''))
        .replace('{{deliveryCharge}}', deliveryCharge.toFixed(2))
        .replace('{{total}}', total.toFixed(2))
        .replace('{{deliveryTime}}', data.deliveryTime || 'within 2 hours')
        .replace('{{orderId}}', formattedOrderId)
        .replace('{{errorMessage}}', data.errorMessage || '')
        .replace('{{errorCode}}', data.errorCode || '');
}

// Email senders
const sendSuccessEmail = async (toEmail, customerName, orderId, orderItems, deliveryCharge, totalAmount) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
    });

    const html = renderTemplate(emailTemplateSuccess, {
        customerName, orderItems, deliveryCharge, total: totalAmount, orderId
    });

    await transporter.sendMail({
        from: `"Darjeeling Momo NZ" <${process.env.SMTP_EMAIL}>`,
        to: toEmail,
        subject: "Your Order is Confirmed - Darjeeling Momo NZ",
        html
    });
};

const sendFailureEmail = async (toEmail, customerName, orderId, orderItems, deliveryCharge, totalAmount, error) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
    });

    const html = renderTemplate(emailTemplateFailure, {
        customerName, orderItems, deliveryCharge, total: totalAmount, orderId,
        errorMessage: error.message,
        errorCode: error.code || "N/A"
    });

    await transporter.sendMail({
        from: `"Darjeeling Momo NZ" <${process.env.SMTP_EMAIL}>`,
        to: toEmail,
        subject: "Payment Failed for Your Order - Darjeeling Momo NZ",
        html
    });
};

// Webhook endpoint
stripeWebhookRouter.post('/', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const orderId = session.metadata.orderId;
            console.log("orderId is : ", orderId);
            const order = await orderModel.findById(orderId);

            console.log("Order status before update is : ", order.status);
            console.log("Order firstNAme : ", order.address.firstName);
            console.log("Order amount : ", order.amount);

            if (!order) return res.status(404).send("Order not found");

            const user = await userModel.findById(order.userId);
            if (user && user.email) {
                console.log("user email is is : ", user.email);
                
                await sendSuccessEmail(user.email,
                    `${order.address.firstName} ${order.address.lastName}`,
                    orderId, order.items, order.deliveryCharges, order.amount);
            }

            order.status = 'paid';
            await order.save();
        }

        if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
            const session = event.data.object;
            const orderId = session.metadata?.orderId;
            if (!orderId) return res.status(200).send(); // not our order

            const order = await orderModel.findById(orderId);
            const user = await userModel.findById(order.userId);
            if (user && user.email) {
                await sendFailureEmail(user.email,
                    `${order.address.firstName} ${order.address.lastName}`,
                    orderId, order.items, order.deliveryCharges, order.amount,
                    { message: 'Your payment was not successful.', code: 'FAILED' });
            }

            order.status = 'payment_failed';
            await order.save();
        }

        res.status(200).send();
    } catch (error) {
        console.error("Webhook error: ", error);
        res.status(500).send("Internal Server Error");
    }
});

export default stripeWebhookRouter;
