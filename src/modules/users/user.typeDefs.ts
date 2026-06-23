export const userTypeDefs = `#graphql
  type Beneficiary {
    name: String!
    phone: String
    bankCode: String
    accountNumber: String
    accountName: String
    type: String!
  }

  input BeneficiaryInput {
    name: String!
    phone: String
    bankCode: String
    accountNumber: String
    accountName: String
    type: String!
  }

  type LinkedBankAccount {
    bankCode: String!
    bankName: String!
    accountNumber: String!
    accountName: String!
    monoAccountId: String
  }

  type UserProfile {
    id: ID!
    userId: ID!
    avatar: String
    dateOfBirth: String
    address: String
    state: String
    country: String!
    preferredLanguage: String!
    pushNotifications: Boolean!
    whatsappNotifications: Boolean!
    smsNotifications: Boolean!
    emailNotifications: Boolean!
    beneficiaries: [Beneficiary!]!
    linkedBankAccounts: [LinkedBankAccount!]!
    createdAt: String!
    updatedAt: String!
  }

  type UserWithProfile {
    id: ID!
    phone: String!
    fullName: String!
    email: String
    role: String!
    kycLevel: Int!
    isVerified: Boolean!
    profile: UserProfile
  }

  type Query {
    me: UserWithProfile!
    myProfile: UserProfile!
    myBeneficiaries: [Beneficiary!]!
  }

  type Mutation {
    updateProfile(address: String, state: String, dateOfBirth: String, preferredLanguage: String): UserProfile!
    uploadAvatar(base64Image: String!): MessageResponse!
    addBeneficiary(beneficiary: BeneficiaryInput!): UserProfile!
    removeBeneficiary(accountNumber: String!): UserProfile!
    updateNotificationPreferences(pushNotifications: Boolean, whatsappNotifications: Boolean, smsNotifications: Boolean, emailNotifications: Boolean): UserProfile!
    linkBankAccount(bankCode: String!, bankName: String!, accountNumber: String!, accountName: String!, monoAccountId: String): UserProfile!
  }
`;