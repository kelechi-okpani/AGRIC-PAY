export const orderTypeDefs = `#graphql
  enum OrderStatus {
    PENDING
    CONFIRMED
    PROCESSING
    DISPATCHED
    IN_TRANSIT
    DELIVERED
    CANCELLED
    REFUNDED
  }

  type OrderItem {
    productId: ID!
    name: String!
    price: Float!
    quantity: Int!
    unit: String!
    subtotal: Float!
  }

  type Order {
    id: ID!
    buyerId: ID!
    sellerId: ID!
    items: [OrderItem!]!
    totalAmount: Float!
    deliveryFee: Float!
    status: OrderStatus!
    reference: String!
    deliveryAddress: String!
    deliveryAgentId: ID
    proofOfDeliveryUrl: String
    estimatedDeliveryDate: String
    deliveredAt: String
    cancelReason: String
    createdAt: String!
    updatedAt: String!
  }

  type OrderList {
    orders: [Order!]!
    total: Int!
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }

  type Query {
    order(id: ID!): Order!
    myOrders(status: OrderStatus, limit: Int, offset: Int): OrderList!
    mySalesOrders(status: OrderStatus, limit: Int, offset: Int): OrderList!
  }

  type Mutation {
    placeOrder(items: [OrderItemInput!]!, deliveryAddress: String!): Order!
    confirmOrder(orderId: ID!): Order!
    cancelOrder(orderId: ID!, reason: String!): Order!
    updateOrderStatus(orderId: ID!, status: OrderStatus!, proofUrl: String): Order!
    assignDeliveryAgent(orderId: ID!, agentId: ID!): Order!
  }
`;