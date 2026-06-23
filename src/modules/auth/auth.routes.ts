import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/register',         authController.register.bind(authController));
router.post('/verify-otp',       authController.verifyOtp.bind(authController));
router.post('/login',            authController.login.bind(authController));
router.post('/refresh',          authController.refreshToken.bind(authController));
router.post('/forgot-password',  authController.forgotPassword.bind(authController));
router.post('/reset-password',   authController.resetPassword.bind(authController));
router.post('/resend-otp',       authController.resendOTP.bind(authController));
router.post('/2fa/verify',       authController.verify2FA.bind(authController));

// Protected
router.use(authenticate);
router.post('/2fa/setup',               authController.setup2FA.bind(authController));
router.post('/2fa/enable',              authController.enable2FA.bind(authController));
router.get('/sessions',                 authController.getSessions.bind(authController));
router.delete('/sessions/:deviceId',    authController.revokeSession.bind(authController));
router.post('/logout',                  authController.logout.bind(authController));

export default router;