export const deliveryTypeDefs = `#graphql
  enum DeliveryStatus {
    ASSIGNED
    PICKED_UP
    IN_TRANSIT
    DELIVERED
    FAILED
  }

  type Delivery {
    id: ID!
    orderId: ID!
    agentId: ID!
    status: DeliveryStatus!
    pickupAddress: String!
    deliveryAddress: String!
    deliveryFee: Float!
    proofImageUrl: String
    agentNotes: String
    pickedUpAt: String
    deliveredAt: String
    createdAt: String!
    updatedAt: String!
  }

  type DeliveryList {
    deliveries: [Delivery!]!
    total: Int!
  }

  type Query {
    orderDelivery(orderId: ID!): Delivery
    myDeliveries(status: DeliveryStatus, limit: Int, offset: Int): DeliveryList!
  }

  type Mutation {
    updateDeliveryStatus(deliveryId: ID!, status: DeliveryStatus!, notes: String): Delivery!
    submitProofOfDelivery(deliveryId: ID!, imageBase64: String!): Delivery!
  }
`;