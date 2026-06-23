export const productTypeDefs = `#graphql
  type ProductRating {
    userId: ID!
    score: Float!
    review: String
    createdAt: String!
  }

  type Product {
    id: ID!
    merchantId: ID!
    name: String!
    description: String!
    category: String!
    price: Float!
    unit: String!
    quantity: Int!
    images: [String!]!
    isActive: Boolean!
    isApproved: Boolean!
    tags: [String!]!
    location: String
    averageRating: Float!
    totalSold: Int!
    ratings: [ProductRating!]!
    createdAt: String!
    updatedAt: String!
  }

  type ProductList {
    products: [Product!]!
    total: Int!
  }

  type Query {
    product(id: ID!): Product!
    searchProducts(query: String, category: String, minPrice: Float, maxPrice: Float, location: String, limit: Int, offset: Int): ProductList!
    myProducts(limit: Int, offset: Int): ProductList!
    productCategories: [String!]!
  }

  type Mutation {
    createProduct(name: String!, description: String!, category: String!, price: Float!, unit: String!, quantity: Int!, images: [String], tags: [String], location: String): Product!
    updateProduct(id: ID!, name: String, description: String, price: Float, quantity: Int, isActive: Boolean): Product!
    deleteProduct(id: ID!): MessageResponse!
    rateProduct(productId: ID!, score: Float!, review: String): MessageResponse!
    approveProduct(productId: ID!): MessageResponse!
  }
`;