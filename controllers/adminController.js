const crypto = require('crypto');
const Payout = require('../models/Payout');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { calculatePayinCommission, calculatePayoutCommission } = require('../utils/commissionCalculator');
const { getSettlementStatusMessage } = require('../utils/settlementCalculator');

// ============ GET MY BALANCE (Updated with T+1 settlement tracking) ============

exports.getMyBalance = async (req, res) => {
    try {
        console.log(`💰 Admin ${req.user.name} checking balance`);

        // Get all successful transactions
        const successfulTransactions = await Transaction.find({
            merchantId: req.merchantId,
            status: 'paid'
        });

        // ✅ SEPARATE SETTLED AND UNSETTLED
        const settledTransactions = successfulTransactions.filter(t => t.settlementStatus === 'settled');
        const unsettledTransactions = successfulTransactions.filter(t => t.settlementStatus === 'unsettled');

        // Calculate settled revenue and commission
        let settledRevenue = 0;
        let settledCommission = 0;

        settledTransactions.forEach(transaction => {
            settledRevenue += transaction.amount;
            const commissionInfo = calculatePayinCommission(transaction.amount);
            settledCommission += commissionInfo.commission;
        });

        // Calculate unsettled revenue and commission
        let unsettledRevenue = 0;
        let unsettledCommission = 0;

        unsettledTransactions.forEach(transaction => {
            unsettledRevenue += transaction.amount;
            const commissionInfo = calculatePayinCommission(transaction.amount);
            unsettledCommission += commissionInfo.commission;
        });

        const totalRevenue = settledRevenue + unsettledRevenue;
        const totalCommission = settledCommission + unsettledCommission;
        const totalRefunded = successfulTransactions.reduce((sum, t) => sum + (t.refundAmount || 0), 0);

        // Get payouts
        const completedPayouts = await Payout.find({
            merchantId: req.merchantId,
            status: 'completed'
        });
        const pendingPayouts = await Payout.find({
            merchantId: req.merchantId,
            status: { $in: ['requested', 'pending', 'processing'] }
        });

        const totalPaidOut = completedPayouts.reduce((sum, p) => sum + p.netAmount, 0);
        const totalPending = pendingPayouts.reduce((sum, p) => sum + p.netAmount, 0);

        // ✅ CALCULATE SETTLED BALANCE (available for payout)
        const settledNetRevenue = settledRevenue - totalRefunded - settledCommission;
        const availableBalance = settledNetRevenue - totalPaidOut - totalPending;

        // ✅ CALCULATE UNSETTLED BALANCE (locked until settlement)
        const unsettledNetRevenue = unsettledRevenue - unsettledCommission;

        // ✅ Calculate maximum payout amount (considering commission)
        let maxPayoutGrossAmount = availableBalance;
        if (availableBalance > 0) {
            if (availableBalance > 1000) {
                maxPayoutGrossAmount = availableBalance / 0.9823; // Accounting for 1.77% commission
            } else if (availableBalance > 500) {
                maxPayoutGrossAmount = Math.min(availableBalance + 35.40, 1000);
            } else {
                maxPayoutGrossAmount = availableBalance;
            }
        }

        // ✅ Get next settlement info
        const nextUnsettledTransaction = unsettledTransactions
            .sort((a, b) => new Date(a.expectedSettlementDate) - new Date(b.expectedSettlementDate))[0];

        const nextSettlementText = nextUnsettledTransaction
            ? getSettlementStatusMessage(
                nextUnsettledTransaction.paidAt,
                nextUnsettledTransaction.expectedSettlementDate
            )
            : 'No pending settlements';

        const nextSettlementStatus = nextUnsettledTransaction
            ? nextUnsettledTransaction.settlementStatus
            : null;


        res.json({
            success: true,
            merchant: {
                merchantId: req.merchantId,
                merchantName: req.merchantName,
                merchantEmail: req.user.email,
                freePayoutsRemaining: req.user.freePayoutsUnder500 || 0  // ✅ ADD THIS
            },

            balance: {
                // ✅ SETTLED BALANCE (can withdraw)
                settled_revenue: settledRevenue.toFixed(2),
                settled_commission: settledCommission.toFixed(2),
                settled_net_revenue: settledNetRevenue.toFixed(2),
                available_balance: availableBalance.toFixed(2),

                // ✅ UNSETTLED BALANCE (locked)
                unsettled_revenue: unsettledRevenue.toFixed(2),
                unsettled_commission: unsettledCommission.toFixed(2),
                unsettled_net_revenue: unsettledNetRevenue.toFixed(2),

                // TOTALS
                total_revenue: totalRevenue.toFixed(2),
                total_refunded: totalRefunded.toFixed(2),
                total_commission: totalCommission.toFixed(2),
                commission_deducted: totalCommission.toFixed(2),
                net_revenue: (settledNetRevenue + unsettledNetRevenue).toFixed(2),
                total_paid_out: totalPaidOut.toFixed(2),
                pending_payouts: totalPending.toFixed(2),

                commission_structure: {
                    payin: '3.8% ',
                    payout_500_to_1000: '₹30 ',
                    payout_above_1000: '(1.77%)'
                }
            },
            settlement_info: {
                // Counts
                settled_transactions: settledTransactions.length,
                unsettled_transactions: unsettledTransactions.length,

                // Next settlement
                next_settlement: nextSettlementText,
                next_settlement_date: nextUnsettledTransaction?.expectedSettlementDate?.toISOString() || null,
                next_settlement_status: nextSettlementStatus,

                // Settlement policy
                settlement_policy: 'T+1 settlement (24 hours after payment)',
                weekend_policy: 'Saturday and Sunday are off. Weekend payments settle on Monday.',

                // Examples for clarity
                settlement_examples: {
                    'Monday payment': 'Settles Tuesday (24 hours)',
                    'Tuesday payment': 'Settles Wednesday (24 hours)',
                    'Wednesday payment': 'Settles Thursday (24 hours)',
                    'Thursday payment': 'Settles Friday (24 hours)',
                    'Friday payment': 'Settles Monday (skip weekend)',
                    'Saturday payment': 'Settles Monday (skip Sunday)',
                    'Sunday payment': 'Settles Monday (24+ hours)'
                }
            },
            transaction_summary: {
                total_transactions: successfulTransactions.length,
                settled_transactions: settledTransactions.length,
                unsettled_transactions: unsettledTransactions.length,
                total_payouts_completed: completedPayouts.length,
                pending_payout_requests: pendingPayouts.length,
                avg_commission_per_transaction: successfulTransactions.length > 0
                    ? (totalCommission / successfulTransactions.length).toFixed(2)
                    : '0.00'
            },
            payout_eligibility: {
                can_request_payout: availableBalance > 0,
                minimum_payout_amount: 0,
                maximum_payout_amount: maxPayoutGrossAmount.toFixed(2),
                available_for_payout: availableBalance.toFixed(2),
                reason: availableBalance <= 0
                    ? 'No settled balance available. Wait for T+1 settlement (24 hours after payment).'
                    : availableBalance < 500
                        ? `Available balance is ₹${availableBalance.toFixed(2)} (after commission)`
                        : 'Eligible for payout'
            }
        });

        console.log(`✅ Balance returned to ${req.user.name}:`);
        console.log(`   - Available: ₹${availableBalance.toFixed(2)}`);
        console.log(`   - Settled: ${settledTransactions.length} transactions`);
        console.log(`   - Unsettled: ${unsettledTransactions.length} transactions`);
        console.log(`   - Next settlement: ${nextSettlementText}`);

    } catch (error) {
        console.error('❌ Get My Balance Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch balance'
        });
    }
};
exports.getTransactionById = async (req, res) => {
    try {
        const { transactionId } = req.params;

        // Fetch transaction (optionally add merchantId match for extra safety)
        const txn = await Transaction.findOne({
            transactionId: transactionId, // or _id: transactionId
            // merchantId: req.merchantId,  // Optionally restrict to only merchant's txns
        });

        if (!txn) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        res.json({
            success: true,
            transaction: txn
        });
    } catch (error) {
        console.error('Error fetching transaction by ID:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transaction'
        });
    }
};
exports.requestPayout = async (req, res) => {
    try {
        const {
            amount,
            transferMode,
            beneficiaryDetails,
            notes,
            description
        } = req.body;

        console.log(`💰 Admin ${req.user.name} requesting payout`);

        // Validation
        if (!transferMode || !beneficiaryDetails) {
            return res.status(400).json({
                success: false,
                error: 'transferMode and beneficiaryDetails are required'
            });
        }

        // ✅ Calculate total settled balance (all paid transactions that haven't been paid out)
        const settledTransactions = await Transaction.find({
            merchantId: req.merchantId,
            status: 'paid',
            settlementStatus: 'settled'
        });

        if (settledTransactions.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No settled balance available for payout'
            });
        }

        // ✅ Calculate total available balance
        const totalSettledAmount = settledTransactions.reduce((sum, t) => sum + t.amount, 0);

        // ✅ Get total already paid out
        const completedPayouts = await Payout.find({
            merchantId: req.merchantId,
            status: { $in: ['requested', 'processing', 'completed'] }
        });

        const totalPaidOut = completedPayouts.reduce((sum, p) => sum + p.amount, 0);

        // ✅ Calculate available balance
        const availableBalance = totalSettledAmount - totalPaidOut;

        if (availableBalance <= 0) {
            return res.status(400).json({
                success: false,
                error: 'No balance available for payout',
                availableBalance: 0
            });
        }

        // ✅ Determine final payout amount
        let finalAmount = amount || availableBalance;

        // ✅ Validate requested amount
        if (finalAmount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Requested amount must be greater than 0'
            });
        }

        if (finalAmount > availableBalance) {
            return res.status(400).json({
                success: false,
                error: `Requested amount ₹${finalAmount} exceeds available balance ₹${availableBalance}`,
                availableBalance: availableBalance
            });
        }

        console.log(`📊 Payout requested: ₹${finalAmount} out of ₹${availableBalance} available`);

        // --- Balance and Commission Calculation ---
        const merchant = await User.findById(req.merchantId);
        const payoutCommissionInfo = calculatePayoutCommission(finalAmount, merchant);
        const payoutCommission = payoutCommissionInfo.commission;
        const netAmount = payoutCommissionInfo.netAmount;

        // --- Create Payout Request ---
        const payoutId = `PAYOUT_REQ_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        const payout = new Payout({
            payoutId,
            merchantId: req.merchantId,
            merchantName: req.merchantName,
            amount: finalAmount,
            commission: payoutCommission,
            commissionType: payoutCommissionInfo.commissionType,
            commissionBreakdown: payoutCommissionInfo.breakdown,
            netAmount,
            description: description || '',
            currency: 'INR',
            transferMode,
            beneficiaryDetails,
            status: 'requested',
            adminNotes: notes || '',
            requestedBy: req.user._id,
            requestedByName: req.user.name,
            requestedAt: new Date()
        });

        await payout.save();

        // --- Decrement Free Payouts if applicable ---
        if (payoutCommissionInfo.commissionType === 'free') {
            merchant.freePayoutsUnder500 -= 1;
            await merchant.save();
        }

        console.log(`✅ Payout request created: ${payoutId} for ₹${finalAmount}`);

        res.json({
            success: true,
            payout: {
                payoutId,
                amount: amount || 'full',
                actualAmount: finalAmount,
                commission: payoutCommission,
                netAmount,
                status: 'requested',
                requestedAt: payout.requestedAt,
                remaining_balance: availableBalance - finalAmount
            },
            message: amount
                ? `Payout request of ₹${finalAmount} submitted successfully`
                : `Full payout request of ₹${finalAmount} submitted successfully`
        });

    } catch (error) {
        console.error('❌ Request Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payout request'
        });
    }
};


// ============ GET MY PAYOUTS (Unchanged) ============
exports.getMyPayouts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,


            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log(`📋 Admin ${req.user.name} fetching their payouts - Page ${page}`);

        let query = { merchantId: req.merchantId };

        if (status) {
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        }



        const totalCount = await Payout.countDocuments(query);

        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const payouts = await Payout.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('processedBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email')
            .select('-beneficiaryDetails.accountNumber')
            .lean();

        const maskedPayouts = payouts.map(payout => {
            if (payout.beneficiaryDetails?.accountNumber) {
                const accNum = payout.beneficiaryDetails.accountNumber;
                payout.beneficiaryDetails.accountNumber = 'XXXX' + accNum.slice(-4);
            }
            return payout;
        });

        const allMyPayouts = await Payout.find({ merchantId: req.merchantId });
        const totalRequested = allMyPayouts.reduce((sum, p) => sum + p.amount, 0);
        const totalCompleted = allMyPayouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.netAmount, 0);
        const totalPending = allMyPayouts.filter(p => p.status === 'requested' || p.status === 'pending' || p.status === 'processing').reduce((sum, p) => sum + p.netAmount, 0);
        const totalCommission = allMyPayouts.reduce((sum, p) => sum + p.commission, 0);

        res.json({
            success: true,
            payouts: maskedPayouts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalCount,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            },
            summary: {
                total_payout_requests: allMyPayouts.length,
                requested_payouts: allMyPayouts.filter(p => p.status === 'requested').length,
                pending_payouts: allMyPayouts.filter(p => p.status === 'pending' || p.status === 'processing').length,
                completed_payouts: allMyPayouts.filter(p => p.status === 'completed').length,
                failed_payouts: allMyPayouts.filter(p => p.status === 'failed').length,
                cancelled_payouts: allMyPayouts.filter(p => p.status === 'cancelled').length,
                total_amount_requested: totalRequested.toFixed(2),
                total_completed: totalCompleted.toFixed(2),
                total_pending: totalPending.toFixed(2),
                total_commission_paid: totalCommission.toFixed(2)
            },
            merchant_info: {
                merchantId: req.merchantId,
                merchantName: req.merchantName,
                merchantEmail: req.user.email
            }
        });

        console.log(`✅ Returned ${maskedPayouts.length} payouts to admin ${req.user.name}`);

    } catch (error) {
        console.error('❌ Get My Payouts Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payout history'
        });
    }
};

// ============ CANCEL PAYOUT REQUEST (Unchanged) ============
exports.cancelPayoutRequest = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { reason } = req.body;

        console.log(`❌ Admin ${req.user.name} cancelling payout: ${payoutId}`);

        const payout = await Payout.findOne({
            payoutId,
            merchantId: req.merchantId
        });

        if (!payout) {
            return res.status(404).json({
                success: false,
                error: 'Payout request not found'
            });
        }

        if (payout.status !== 'requested') {
            return res.status(400).json({
                success: false,
                error: `Cannot cancel payout with status: ${payout.status}. Only 'requested' payouts can be cancelled.`
            });
        }

        // --- Rollback Free Payout --- 
        if (payout.commissionType === 'free') {
            const merchant = await User.findById(payout.merchantId);
            if (merchant) {
                merchant.freePayoutsUnder500 += 1;
                await merchant.save();
            }
        }

        payout.status = 'cancelled';
        payout.rejectedBy = req.user._id;
        payout.rejectedByName = req.user.name;
        payout.rejectedAt = new Date();
        payout.rejectionReason = reason || 'Cancelled by merchant';

        await payout.save();

        // Rollback associated transactions
        await Transaction.updateMany({
            payoutId: payout._id
        }, {
            $set: {
                payoutStatus: 'unpaid',
                payoutId: null
            }
        });

        res.json({
            success: true,
            message: 'Payout request cancelled successfully',
            payout: {
                payoutId: payout.payoutId,
                status: payout.status,
                cancelledAt: payout.rejectedAt,
                reason: payout.rejectionReason
            }
        });

    } catch (error) {
        console.error('❌ Cancel Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel payout request'
        });
    }
};
// Get payout status by payoutId
exports.getPayoutStatusById = async (req, res) => {
    try {
        const payoutId = req.params.payoutId;

        const payout = await Payout.findOne({ payoutId }).lean();

        if (!payout) {
            return res.status(404).json({
                success: false,
                error: 'Payout not found'
            });
        }

        res.json({
            success: true,
            payoutId: payout.payoutId,
            status: payout.status,
            amount: payout.amount,
            netAmount: payout.netAmount,
            requestedAt: payout.requestedAt,
            approvedAt: payout.approvedAt,
            completedAt: payout.completedAt,
            rejectionReason: payout.rejectionReason,
            utr: payout.utr,
            adminNotes: payout.adminNotes
        });
    } catch (error) {
        console.error('Get Payout Status Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payout status'
        });
    }
};
