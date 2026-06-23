export const walletTypeDefs = `#graphql
  enum WalletType {
    NGN
    USD
    CRYPTO
  }

  enum TransactionType {
    CREDIT
    DEBIT
  }

  type WalletTransaction {
    id: ID!
    type: TransactionType!
    amount: Float!
    balanceBefore: Float!
    balanceAfter: Float!
    reference: String!
    description: String!
    metadata: JSON
    createdAt: String!
  }

  type Wallet {
    id: ID!
    userId: ID!
    type: WalletType!
    balance: Float!
    ledgerBalance: Float!
    currency: String!
    isActive: Boolean!
    isFrozen: Boolean!
    frozenReason: String
    createdAt: String!
    updatedAt: String!
  }

  type WalletBalance {
    balance: Float!
    currency: String!
    isFrozen: Boolean!
  }

  type DepositResponse {
    paymentUrl: String!
    reference: String!
  }

  type WithdrawResponse {
    message: String!
    reference: String!
  }

  type TransactionHistory {
    total: Int!
    transactions: [WalletTransaction!]!
  }

  type Query {
    myWallets: [Wallet!]!
    walletBalance(type: WalletType!): WalletBalance!
    transactionHistory(type: WalletType!, limit: Int, offset: Int, transactionType: TransactionType): TransactionHistory!
  }

  type Mutation {
    initiateDeposit(amount: Float!, email: String!): DepositResponse!
    withdraw(amount: Float!, bankCode: String!, accountNumber: String!, accountName: String!): WithdrawResponse!
    freezeWallet(type: WalletType!, reason: String!): MessageResponse!
    unfreezeWallet(type: WalletType!): MessageResponse!
  }
`;