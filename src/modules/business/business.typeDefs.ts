export const businessTypeDefs = `#graphql
  enum BusinessType {
    SOLE_PROPRIETORSHIP
    PARTNERSHIP
    LIMITED_LIABILITY
  }

  enum BusinessStatus {
    PENDING
    APPROVED
    REJECTED
    SUSPENDED
  }

  type Employee {
    name: String!
    role: String!
    salary: Float!
    bankCode: String!
    accountNumber: String!
    accountName: String!
  }

  input EmployeeInput {
    name: String!
    role: String!
    salary: Float!
    bankCode: String!
    accountNumber: String!
    accountName: String!
  }

  type Business {
    id: ID!
    userId: ID!
    businessName: String!
    cacNumber: String
    businessType: BusinessType!
    industry: String!
    address: String!
    email: String!
    phone: String!
    logoUrl: String
    status: BusinessStatus!
    employees: [Employee!]!
    walletBalance: Float!
    rejectionReason: String
    approvedAt: String
    createdAt: String!
    updatedAt: String!
  }

  type BusinessList {
    businesses: [Business!]!
    total: Int!
  }

  type PayrollResult {
    message: String!
    totalPaid: Float!
    count: Int!
  }

  type Query {
    myBusiness: Business!
    allBusinesses(status: BusinessStatus, limit: Int, offset: Int): BusinessList!
  }

  type Mutation {
    createBusiness(businessName: String!, businessType: BusinessType!, industry: String!, address: String!, email: String!, phone: String!, cacNumber: String): Business!
    updateBusiness(businessName: String, address: String, email: String, phone: String): Business!
    addEmployee(employee: EmployeeInput!): Business!
    removeEmployee(accountNumber: String!): Business!
    runPayroll: PayrollResult!
    approveBusiness(businessId: ID!): Business!
    rejectBusiness(businessId: ID!, reason: String!): Business!
    suspendBusiness(businessId: ID!): Business!
  }
`;