export const adminTypeDefs = `#graphql
  enum AdminRole {
    SUPER_ADMIN
    OPERATIONS_ADMIN
    FINANCE_ADMIN
    COMPLIANCE_ADMIN
    SUPPORT_AGENT
    CUSTOMER_SUPPORT_MANAGER
  }

  type Admin {
    id: ID!
    fullName: String!
    email: String!
    role: AdminRole!
    isActive: Boolean!
    lastLogin: String
    createdAt: String!
  }

  type DashboardStats {
    users: JSON!
    kyc: JSON!
    support: JSON!
    revenue: JSON!
  }

  type Query {
    adminDashboard: DashboardStats!
    adminUsers(search: String, role: String, limit: Int, offset: Int): JSON!
    adminTransfers(status: TransferStatus, userId: ID, limit: Int, offset: Int): JSON!
    adminKYCs(limit: Int, offset: Int): JSON!
    adminTickets(status: String, limit: Int, offset: Int): JSON!
    topCustomers(limit: Int): JSON!
    growthMetrics: JSON!
    allAdmins: [Admin!]!
  }

  type Mutation {
    adminLogin(email: String!, password: String!): JSON!
    createAdmin(fullName: String!, email: String!, password: String!, role: AdminRole!): Admin!
    updateAdmin(id: ID!, fullName: String, role: AdminRole, isActive: Boolean): Admin!
    deleteAdmin(id: ID!): MessageResponse!
    suspendUser(userId: ID!): MessageResponse!
    unsuspendUser(userId: ID!): MessageResponse!
    adminFreezeWallet(userId: ID!, walletType: String!, reason: String!): MessageResponse!
    adminUnfreezeWallet(userId: ID!, walletType: String!): MessageResponse!
    adminResetPassword(userId: ID!, newPassword: String!): MessageResponse!
    adminRefundTransfer(transferId: ID!): MessageResponse!
    adminApproveKYC(kycId: ID!): MessageResponse!
    adminRejectKYC(kycId: ID!, reason: String!): MessageResponse!
    adminAssignTicket(ticketId: ID!, agentId: ID!): JSON!
    adminCloseTicket(ticketId: ID!): JSON!
  }
`;