export const cardTypeDefs = `#graphql
  type CardTransaction {
    amount: Float!
    currency: String!
    type: String!
    description: String!
    reference: String!
    createdAt: String!
  }

  type Card {
    id: ID!
    userId: ID!
    maskedNumber: String!
    expiryMonth: String
    expiryYear: String
    currency: String!
    balance: Float!
    isActive: Boolean!
    isFrozen: Boolean!
    isTerminated: Boolean!
    spendLimit: Float
    createdAt: String!
    updatedAt: String!
  }

  type Query {
    myCards: [Card!]!
    cardTransactions(cardId: ID!, from: String!, to: String!): JSON!
  }

  type Mutation {
    createCard: Card!
    fundCard(cardId: ID!, amountUSD: Float!): Card!
    freezeCard(cardId: ID!): Card!
    unfreezeCard(cardId: ID!): Card!
    terminateCard(cardId: ID!): Card!
  }
`;