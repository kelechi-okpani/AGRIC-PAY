export const depositWithdrawalTypeDefs = `#graphql
  enum DepositStatus {
    PENDING
    SUCCESS
    FAILED
    ABANDONED
  }

  enum DepositChannel {
    PAYSTACK
    FLUTTERWAVE
    BANK_TRANSFER
    USSD
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
    channel:          DepositChannel!
    reference:        String!
    gatewayReference: String
    paymentUrl:       String
    paidAt:           String
    createdAt:        String!
    updatedAt:        String!
  }

  type DepositList {
    deposits: [Deposit!]!
    total:    Int!
  }

  type DepositInitResponse {
    paymentUrl: String!
    reference:  String!
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
    daily:     JSON!
    monthly:   JSON!
    byChannel: JSON!
  }

  type WithdrawalFeeInfo {
    amount:    Float!
    fee:       Float!
    total:     Float!
    feeNote:   String!
  }

  type Query {
    myDeposits(status: DepositStatus, limit: Int, offset: Int):       DepositList!
    myWithdrawals(status: WithdrawalStatus, limit: Int, offset: Int): WithdrawalList!
    deposit(reference: String!):      Deposit!
    withdrawal(reference: String!):   Withdrawal!
    verifyDeposit(reference: String!): Deposit!
    banks:                            [Bank!]!
    resolveAccount(accountNumber: String!, bankCode: String!): BankAccount!
    withdrawalFee(amount: Float!):    WithdrawalFeeInfo!

    # Admin only
    adminDeposits(status: DepositStatus, userId: ID, channel: DepositChannel, limit: Int, offset: Int): DepositList!
    adminWithdrawals(status: WithdrawalStatus, userId: ID, limit: Int, offset: Int): WithdrawalList!
    depositStats: DepositStats!
  }

  type Mutation {
    initiatePaystackDeposit(amount: Float!, email: String!):   DepositInitResponse!
    initiateFlutterwaveDeposit(amount: Float!, email: String!, phone: String!, name: String!): DepositInitResponse!
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