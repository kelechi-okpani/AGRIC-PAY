import { Request, Response, NextFunction } from 'express';
import { aiService } from './ai.service';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { ValidationError } from '../../core/errors/AppError';

export class AIController {

  async detectIntent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { message } = req.body;
      if (!message) throw new ValidationError('Message is required');

      const userId = (req as any).user?.id;
      const result = await aiService.detectIntent(message);
      const response = await aiService.generateResponse(userId, message);

      res.json({
        success: true,
        intent: result.intent,
        entities: result.entities,
        confidence: result.confidence,
        response,
      });
    } catch (err) {
      next(err);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const history = await aiService.getConversationHistory(userId);
      res.json({ success: true, history });
    } catch (err) {
      next(err);
    }
  }

  async clearHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      await aiService.clearHistory(userId);
      res.json({ success: true, message: 'Conversation history cleared.' });
    } catch (err) {
      next(err);
    }
  }

  async getState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const state = await aiService.getConversationState(userId);
      res.json({ success: true, state });
    } catch (err) {
      next(err);
    }
  }

  async clearState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      await aiService.clearConversationState(userId);
      res.json({ success: true, message: 'Conversation state cleared.' });
    } catch (err) {
      next(err);
    }
  }
}

export const aiController = new AIController();