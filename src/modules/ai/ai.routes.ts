import { Router, Request, Response } from 'express';
import { aiService } from './ai.service';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { message } = req.body;
    const { intent, entities, confidence } = await aiService.detectIntent(message);
    const response = await aiService.generateResponse(userId, message);
    res.json({ success: true, intent, entities, confidence, response });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/history', authenticate, async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  await aiService.clearHistory(userId);
  res.json({ success: true, message: 'Conversation history cleared.' });
});

export default router;