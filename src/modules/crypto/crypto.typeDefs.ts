export const cryptoTypeDefs = `#graphql
  enum CryptoTransactionType {
    BUY
    SELL
    SWAP
  }

  enum CryptoStatus {
    PENDING
    PROCESSING
    SUCCESS
    FAILED
  }

  type CryptoTransaction {
    id: ID!
    userId: ID!
    type: CryptoTransactionType!
    asset: String!
    fromAsset: String
    toAsset: String
    fromAmount: Float!
    toAmount: Float!
    rate: Float!
    status: CryptoStatus!
    reference: String!
    failureReason: String
    createdAt: String!
    updatedAt: String!
  }

  type CryptoHistory {
    transactions: [CryptoTransaction!]!
    total: Int!
  }

  type Query {
    exchangeRates: JSON!
    cryptoHistory(limit: Int, offset: Int): CryptoHistory!
  }

  type Mutation {
    buyCrypto(asset: String!, ngnAmount: Float!): CryptoTransaction!
    sellCrypto(asset: String!, cryptoAmount: Float!): CryptoTransaction!
    swapCrypto(fromAsset: String!, toAsset: String!, fromAmount: Float!): CryptoTransaction!
  }
`;