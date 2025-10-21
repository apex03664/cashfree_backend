const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const auth = require('../middleware/auth.js');
const superAdminAuth = require('../middleware/superAdminAuth');

const {
    getPaymentStatus,
    getTransactions,
} = require('../controllers/paymentController.js');

const {
    getAllTransactions,
    getAllPayouts,
    approvePayout,
    rejectPayout,
    processPayout
} = require('../controllers/superAdminController.js');

// ✅ MAKE SURE ALL THESE FUNCTIONS EXIST IN THE CONTROLLER
const {
    configureMerchantWebhook,
    getMerchantWebhookConfig,
    testMerchantWebhook,
    deleteMerchantWebhook
} = require('../controllers/merchantWebhookController.js');
const {
    getMyPayouts,
    requestPayout,
    getMyBalance,
    cancelPayoutRequest,
    getTransactionById,
    getPayoutStatusById,
    searchTransactions,
    searchPayouts
} = require('../controllers/adminController.js');

// ============ MERCHANT APIs (API Key Auth) ============

router.get('/status/:orderId', apiKeyAuth, getPaymentStatus);
router.get('/transactions', apiKeyAuth, getTransactions);

// ============ MERCHANT WEBHOOK CONFIGURATION APIS ============
router.post('/merchant/webhook/configure', auth, configureMerchantWebhook);
router.get('/merchant/webhook/config', auth, getMerchantWebhookConfig);
router.post('/merchant/webhook/test', auth, testMerchantWebhook);
router.delete('/merchant/webhook', auth, deleteMerchantWebhook);



// ============ SUPERADMIN ROUTES (JWT Auth - SuperAdmin Dashboard) ============
router.get('/admin/payouts/all', superAdminAuth, getAllPayouts);
router.post('/admin/payout/:payoutId/approve', superAdminAuth, approvePayout);
router.post('/admin/payout/:payoutId/reject', superAdminAuth, rejectPayout);
router.post('/admin/payout/:payoutId/process', superAdminAuth, processPayout);
router.get('/admin/transactions', superAdminAuth, getAllTransactions);
router.get('/merchant/transactions/search', auth, searchTransactions); // For transactions

// ============ ADMIN APIs (JWT Auth - Merchant Dashboard) ============
router.get('/merchant/payouts', auth, getMyPayouts);
router.post('/merchant/payout/request', auth, requestPayout);
router.get('/merchant/balance', auth, getMyBalance);
router.post('/merchant/payout/:payoutId/cancel', auth, cancelPayoutRequest);
router.get('/merchant/transactions/:transactionId', auth, getTransactionById);

router.get('/merchant/payout/:payoutId/status', auth, getPayoutStatusById);
// ============ SEARCH APIs ============
router.get('/merchant/payouts/search', auth, searchPayouts);          // For payouts



module.exports = router;
