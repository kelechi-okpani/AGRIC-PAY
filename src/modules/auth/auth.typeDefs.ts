export const authTypeDefs = `#graphql
  type AuthUser {
    id: ID!
    phone: String!
    fullName: String!
    email: String
    role: String!
    kycLevel: Int!
    isVerified: Boolean!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: AuthUser!
  }

  type MessageResponse {
    message: String!
    success: Boolean!
  }

  type TwoFASetup {
    qrCode: String!
    secret: String!
  }

  type Session {
    deviceId: String!
    deviceName: String!
    lastLogin: String!
    ip: String!
  }

  type Mutation {
    register(phone: String!, fullName: String!, email: String, role: String): MessageResponse!
    verifyOtp(phone: String!, otp: String!, deviceId: String, deviceName: String): AuthPayload!
    login(phone: String!, password: String, deviceId: String, deviceName: String): JSON!
    refreshToken(refreshToken: String!): JSON!
    forgotPassword(phone: String!): MessageResponse!
    resetPassword(phone: String!, otp: String!, newPassword: String!): MessageResponse!
    resendOtp(phone: String!): MessageResponse!
    setup2FA: TwoFASetup!
    enable2FA(token: String!): MessageResponse!
    verify2FA(userId: String!, token: String!): JSON!
    logout: MessageResponse!
    revokeSession(deviceId: String!): MessageResponse!
  }

  type Query {
    sessions: [Session!]!
  }
`;