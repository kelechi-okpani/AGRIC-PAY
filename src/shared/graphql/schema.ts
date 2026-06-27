import { makeExecutableSchema } from '@graphql-tools/schema';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import GraphQLJSON from 'graphql-type-json';

import { authTypeDefs } from '../../modules/auth/auth.typeDefs';
import { authResolvers } from '../../modules/auth/auth.resolvers';
import { walletTypeDefs } from '../../modules/wallets/wallet.typeDefs';
import { walletResolvers } from '../../modules/wallets/wallet.resolvers';
import { transferTypeDefs } from '../../modules/transfers/transfer.typeDefs';
import { transferResolvers } from '../../modules/transfers/transfer.resolvers';
import { kycTypeDefs } from '../../modules/kyc/kyc.typeDefs';
import { kycResolvers } from '../../modules/kyc/kyc.resolvers';
import { productTypeDefs } from '../../modules/products/product.typeDefs';
import { productResolvers } from '../../modules/products/product.resolvers';
import { orderTypeDefs } from '../../modules/orders/order.typeDefs';
import { orderResolvers } from '../../modules/orders/order.resolvers';
import { adminTypeDefs } from '../../modules/admin/admin.typeDefs';
import { adminResolvers } from '../../modules/admin/admin.resolvers';
import { cardTypeDefs } from '../../modules/cards/card.typeDefs';
import { cardResolvers } from '../../modules/cards/card.resolvers';
import { cryptoTypeDefs } from '../../modules/crypto/crypto.typeDefs';
import { cryptoResolvers } from '../../modules/crypto/crypto.resolvers';
import { deliveryTypeDefs } from '../../modules/delivery/delivery.typeDefs';
import { deliveryResolvers } from '../../modules/delivery/delivery.resolvers';
import { businessTypeDefs } from '../../modules/business/business.typeDefs';
import { businessResolvers } from '../../modules/business/business.resolvers';
import { userTypeDefs } from '../../modules/users/user.typeDefs';
import { userResolvers } from '../../modules/users/user.resolvers';
import { supportTypeDefs } from '../../modules/support/support.typeDefs';
import { supportResolvers } from '../../modules/support/support.resolvers';
import { depositWithdrawalTypeDefs } from '@modules/wallets/funding/deposit-withdrawal.typeDefs';
import { depositWithdrawalResolvers } from '@modules/wallets/funding/deposit-withdrawal.resolvers';

const rootTypeDefs = `#graphql
  scalar JSON
  scalar DateTime

  type MessageResponse {
    message: String!
    success: Boolean!
  }
`;

export const schema = makeExecutableSchema({
  typeDefs: mergeTypeDefs([
    rootTypeDefs,
    authTypeDefs,
    walletTypeDefs,
    transferTypeDefs,
    kycTypeDefs,
    productTypeDefs,
    orderTypeDefs,
    adminTypeDefs,
    cardTypeDefs,
    cryptoTypeDefs,
    deliveryTypeDefs,
    businessTypeDefs,
    userTypeDefs,
    supportTypeDefs,
    depositWithdrawalTypeDefs,
    
  ]),
  resolvers: mergeResolvers([
    { JSON: GraphQLJSON },
    authResolvers,
    walletResolvers,
    transferResolvers,
    kycResolvers,
    productResolvers,
    orderResolvers,
    adminResolvers,
    cardResolvers,
    cryptoResolvers,
    deliveryResolvers,
    businessResolvers,
    userResolvers,
    supportResolvers,
    depositWithdrawalResolvers,
  ]),
});