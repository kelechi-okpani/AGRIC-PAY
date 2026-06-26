export const depositWithdrawalTypeDefs = `#graphql
  enum DepositStatus {
    PENDING
    SUCCESS
    FAILED
    ABANDONED
  }

  enum WithdrawalStatus {
    PENDING
    PROCESSING
    SUCCESS
    FAILED
    REVERSED
  }

  type Deposit {
    id:               ID!
    userId:           ID!
    amount:           Float!
    currency:         String!
    status:           DepositStatus!
    reference:        String!
    gatewayReference: String
    paidAt:           String
    createdAt:        String!
    updatedAt:        String!
  }

  type DepositList {
    deposits: [Deposit!]!
    total:    Int!
  }

  type Withdrawal {
    id:               ID!
    userId:           ID!
    amount:           Float!
    fee:              Float!
    netAmount:        Float!
    currency:         String!
    status:           WithdrawalStatus!
    reference:        String!
    gatewayReference: String
    bankCode:         String!
    bankName:         String!
    accountNumber:    String!
    accountName:      String!
    narration:        String
    failureReason:    String
    processedAt:      String
    createdAt:        String!
    updatedAt:        String!
  }

  type WithdrawalList {
    withdrawals: [Withdrawal!]!
    total:       Int!
  }

  type BankAccount {
    accountName:   String!
    accountNumber: String!
    bankCode:      String!
  }

  type Bank {
    name: String!
    code: String!
  }

  type DepositStats {
    daily:   JSON!
    monthly: JSON!
  }

  type WithdrawalFeeInfo {
    amount:  Float!
    fee:     Float!
    total:   Float!
    feeNote: String!
  }

  type VirtualAccount {
    bankName:      String!
    accountNumber: String!
    accountName:   String!
  }

  type Query {
    myDeposits(status: DepositStatus, limit: Int, offset: Int):       DepositList!
    myWithdrawals(status: WithdrawalStatus, limit: Int, offset: Int): WithdrawalList!
    deposit(reference: String!):    Deposit!
    withdrawal(reference: String!): Withdrawal!
    banks:                          [Bank!]!
    resolveAccount(accountNumber: String!, bankCode: String!): BankAccount!
    withdrawalFee(amount: Float!):  WithdrawalFeeInfo!
    myVirtualAccount:               VirtualAccount!

    # Admin only
    adminDeposits(status: DepositStatus, userId: ID, limit: Int, offset: Int):       DepositList!
    adminWithdrawals(status: WithdrawalStatus, userId: ID, limit: Int, offset: Int): WithdrawalList!
    depositStats: DepositStats!
  }

  type Mutation {
    initiateWithdrawal(
      amount:        Float!
      bankCode:      String!
      bankName:      String!
      accountNumber: String!
      accountName:   String!
      narration:     String
    ): Withdrawal!

    # Admin only
    adminReverseWithdrawal(reference: String!): MessageResponse!
  }
`;