import { Router } from 'express';
import { whatsappController } from './whatsapp.controller';
import { whatsappRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post('/webhook', whatsappRateLimiter, whatsappController.handleWebhook.bind(whatsappController));

export default router;