import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { json } from 'body-parser';

import { connectDB } from './config/db';
import { env } from './config/env';
import { logger } from './shared/utils/logger';
import { schema } from './shared/graphql/schema';
import { formatGraphQLError, expressErrorHandler } from './core/errors/errorHandler';
import { globalRateLimiter, authRateLimiter } from './middleware/rateLimiter';
import { initSocket } from './websocket/socket';
import { GraphQLContext } from './core/types/context';
import { verifyAccessToken } from './shared/utils/jwt';

// Workers
import { startOtpWorker } from './jobs/otp.job';
import { startTransferWorker } from './jobs/transfer.job';
import { startNotificationWorker } from './jobs/notification.job';
import { startWebhookWorker } from './jobs/webhook.job';

// Routes
import whatsappRoutes from './modules/whatsapp/whatsapp.routes';
import aiRoutes from './modules/ai/ai.routes';
import authRoutes from './modules/auth/auth.routes';
import transferRoutes from './modules/transfers/transfer.routes';

// Event handlers (register side effects)
import './events/handlers/kyc.handler';

const app = express();
const httpServer = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(json({ limit: '10mb' }));
app.use(globalRateLimiter);

// REST routes
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', transferRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', app: env.APP_NAME, version: '1.0.0' }));

const apolloServer = new ApolloServer<GraphQLContext>({
  schema,
  // wrap existing formatter to match Apollo Server's expected signature
  formatError: (formattedError, error) => {
    try {
      // formatGraphQLError expects the original GraphQLError
      return formatGraphQLError(error as any) as any;
    } catch {
      return formattedError as any;
    }
  },
  introspection: env.NODE_ENV !== 'production',
});

// const apolloServer = new ApolloServer<GraphQLContext>({
//   schema,
//   formatError: formatGraphQLError,
//   introspection: env.NODE_ENV !== 'production',
// });

const bootstrap = async () => {
  await connectDB();
  await apolloServer.start();

  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req }): Promise<GraphQLContext> => {
        let user, admin;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          try {
            const decoded = verifyAccessToken(authHeader.split(' ')[1]) as any;
            if (decoded.phone) user = decoded;
            else if (decoded.email) admin = decoded;
          } catch {}
        }
        return { req, user, admin };
      },
    })
  );

  app.use(expressErrorHandler);

  initSocket(httpServer);

  // Start all BullMQ workers
  startOtpWorker();
  startTransferWorker();
  startNotificationWorker();
  startWebhookWorker();
  logger.info('⚙️  All BullMQ workers started');

  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 AgroFinPay running on http://localhost:${env.PORT}`);
    logger.info(`📊 GraphQL at http://localhost:${env.PORT}/graphql`);
    logger.info(`💬 WhatsApp webhook at http://localhost:${env.PORT}/api/whatsapp/webhook`);
    logger.info(`🌿 Environment: ${env.NODE_ENV}`);
  });
};

bootstrap().catch((err) => {
  logger.error('Bootstrap failed:', err);
  process.exit(1);
});

export default app;