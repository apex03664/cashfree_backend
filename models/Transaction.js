const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    transactionId: {
        type: String,
        required: true,
        unique: true,
    },
    orderId: {
        type: String,
        required: true,
        unique: true,
    },
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    
    // Razorpay Fields
    razorpayPaymentLinkId: String,
    razorpayPaymentId: String,
    razorpayOrderId: String,
    razorpayReferenceId: String,
    
 
    
    // Payment Gateway
    paymentGateway: String, // 'razorpay' or 'cashfree'
    
    // URLs
    callbackUrl: String,
    successUrl: String,
    failureUrl: String,

    // Merchant
    merchantName: {
        type: String,
        required: true,
    },
    
    // Customer Details
    customerId: {
        type: String,
        required: true,
    },
    customerName: {
        type: String,
        required: true,
    },
    customerEmail: {
        type: String,
        required: true,
    },
    customerPhone: {
        type: String,
        required: true,
    },
    
    // Payment Details
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    currency: {
        type: String,
        default: 'INR',
    },
    description: {
        type: String,
        default: '',
    },
    
    // Status
    status: {
        type: String,
        enum: ['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partial_refund', 'expired'],
        default: 'created',
    },
    
    // Payment Method
    paymentMethod: String, // 'upi', 'card', 'netbanking', 'wallet'
    
    // ✅ ACQUIRER DATA - Bank/Payment Details
    acquirerData: {
        utr: String, // UTR for UPI/NEFT/RTGS
        rrn: String, // Retrieval Reference Number (UPI)
        bank_transaction_id: String, // Bank's transaction ID
        auth_code: String, // Card authorization code
        card_last4: String, // Last 4 digits of card
        card_network: String, // Visa, Mastercard, etc.
        bank_name: String, // Bank name
        vpa: String // UPI VPA (e.g., user@paytm)
    },
    
    // Settlement Info
    settlementStatus: {
        type: String,
        enum: ['unsettled', 'settled', 'on_hold'],
        default: 'unsettled'
    },
    settlementDate: {
        type: Date,
        default: null
    },

    // Payout Info
    payoutId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payout',
        default: null
    },
    payoutStatus: {
        type: String,
        enum: ['unpaid', 'requested', 'paid'],
        default: 'unpaid'
    },
   expectedSettlementDate: {
    type: Date,
    default: null // ✅ Will be calculated properly when payment is marked as 'paid'
}
,// User.js (Admin schema)


    
    // Timestamps
    paidAt: Date,
    
    // Failure Data
    failureReason: String,
    failureCode: String,
    
    // Webhook Data
    webhookData: Object,
    
    // Refund Data
    refundAmount: {
        type: Number,
        default: 0,
    },
    refundReason: String,
    refundedAt: Date,
    refundId: String,
    
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

TransactionSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Indexes for fast queries
TransactionSchema.index({ merchantId: 1, createdAt: -1 });
TransactionSchema.index({ orderId: 1 });
TransactionSchema.index({ transactionId: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ 'acquirerData.utr': 1 }); // ✅ Index for UTR search
TransactionSchema.index({ razorpayPaymentId: 1 });
TransactionSchema.index({ customerEmail: 1 });
TransactionSchema.index({ customerPhone: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
