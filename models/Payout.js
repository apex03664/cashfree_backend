const mongoose = require('mongoose');

const PayoutSchema = new mongoose.Schema({
    payoutId: { type: String, required: true, unique: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    merchantName: String,

    amount: { type: Number, required: true },
    commission: { type: Number, required: true },
    commissionType: { type: String, enum: ['flat', 'percentage'] }, // ✅ NEW
    commissionBreakdown: { type: Object }, // ✅ NEW: Stores detailed breakdown
    netAmount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    transferMode: { type: String, enum: ['bank_transfer', 'upi'], required: true },
    beneficiaryDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        bankName: String,
        branchName: String,
        upiId: String
    },

    status: {
        type: String,
        enum: ['requested', 'rejected', 'pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'requested'
    },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedByName: String,
    requestedAt: Date,

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedByName: String,
    approvedAt: Date,

    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedByName: String,
    processedAt: Date,

    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedByName: String,
    rejectedAt: Date,
    rejectionReason: String,
    // Payout.js
    commissionType: {
        type: String,
        enum: ['free', 'tier1', 'tier2', 'percentage', 'flat'], // ✅ ADD 'flat'
        default: 'tier1'
    },
    description: { type: String }
    ,
    commissionBreakdown: {
        type: Object,
        default: {}
    }
    ,
    adminNotes: String,
    utr: String,

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payout', PayoutSchema);
