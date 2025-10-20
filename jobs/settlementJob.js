const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const { isReadyForSettlement, calculateExpectedSettlementDate } = require('../utils/settlementCalculator');

// ✅ Main settlement function
async function processSettlement() {
    const now = new Date();
    const currentDay = now.getDay();
    
    console.log(`🔄 Settlement started at ${now.toISOString()}`);
    
    // Skip weekends
    if (currentDay === 0 || currentDay === 6) {
        console.log('⏸️ Weekend - Skipped');
        return { success: true, settledCount: 0, notReadyCount: 0 };
    }

    // Only transactions paid 24+ hours ago
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const unsettledTransactions = await Transaction.find({
        status: 'paid',
        settlementStatus: 'unsettled',
        paidAt: { $lte: twentyFourHoursAgo }
    });

    console.log(`📦 Found ${unsettledTransactions.length} transactions to check`);

    let settledCount = 0;
    let notReadyCount = 0;

    for (const transaction of unsettledTransactions) {
        // Add settlement date if missing
        if (!transaction.expectedSettlementDate && transaction.paidAt) {
            transaction.expectedSettlementDate = calculateExpectedSettlementDate(transaction.paidAt);
            await transaction.save();
        }

        // Check if ready
        if (isReadyForSettlement(transaction.paidAt, transaction.expectedSettlementDate)) {
            transaction.settlementStatus = 'settled';
            transaction.settlementDate = now;
            await transaction.save();
            settledCount++;
            console.log(`✅ Settled: ${transaction.transactionId}`);
        } else {
            notReadyCount++;
        }
    }

    console.log(`✅ Complete: ${settledCount} settled, ${notReadyCount} not ready`);
    return { success: true, settledCount, notReadyCount };
}

// ✅ Cron: Monday-Friday at 4 PM IST
const settlementJob = cron.schedule('0 16 * * 1-5', async () => {
    try {
        console.log('🤖 Auto settlement triggered');
        await processSettlement();
    } catch (error) {
        console.error('❌ Auto settlement error:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

// ✅ Manual trigger
async function manualSettlement() {
    return await processSettlement();
}

module.exports = { 
    settlementJob,
    manualSettlement
};
