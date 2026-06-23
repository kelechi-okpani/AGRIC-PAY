export const transferTypeDefs = `#graphql
  enum TransferStatus {
    PENDING
    PROCESSING
    SUCCESS
    FAILED
    REVERSED
  }

  enum TransferType {
    INTERNAL
    BANK
    CROSS_BORDER
    SCHEDULED
    RECURRING
  }

  enum RecurringInterval {
    DAILY
    WEEKLY
    MONTHLY
  }

  type Transfer {
    id: ID!
    fromUserId: ID!
    toUserId: ID
    amount: Float!
    fee: Float!
    currency: String!
    type: TransferType!
    status: TransferStatus!
    reference: String!
    bankCode: String
    accountNumber: String
    accountName: String
    bankName: String
    narration: String
    scheduledAt: String
    recurringInterval: RecurringInterval
    retryCount: Int!
    failureReason: String
    createdAt: String!
    updatedAt: String!
  }

  type TransferList {
    transfers: [Transfer!]!
    total: Int!
  }

  type BankAccount {
    accountName: String!
    accountNumber: String!
    bankCode: String!
  }

  type Bank {
    name: String!
    code: String!
  }

  type Query {
    myTransfers(status: TransferStatus, type: TransferType, limit: Int, offset: Int): TransferList!
    transfer(id: ID!): Transfer!
    banks: [Bank!]!
    resolveAccount(accountNumber: String!, bankCode: String!): BankAccount!
  }

  type Mutation {
    internalTransfer(toPhone: String!, amount: Float!, narration: String): Transfer!
    bankTransfer(amount: Float!, bankCode: String!, accountNumber: String!, accountName: String!, bankName: String!, narration: String): Transfer!
    scheduleTransfer(toPhone: String, bankCode: String, accountNumber: String, accountName: String, amount: Float!, scheduledAt: String!, narration: String): Transfer!
    createRecurringTransfer(toPhone: String!, amount: Float!, interval: RecurringInterval!, endDate: String!, narration: String): Transfer!
    retryTransfer(id: ID!): Transfer!
    cancelTransfer(id: ID!): Transfer!
  }
`;