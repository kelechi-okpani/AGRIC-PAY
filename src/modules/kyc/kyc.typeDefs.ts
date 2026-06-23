export const kycTypeDefs = `#graphql
  enum KYCStatus {
    PENDING
    APPROVED
    REJECTED
    RESUBMISSION_REQUIRED
  }

  enum DocumentType {
    NIN_SLIP
    PASSPORT
    DRIVERS_LICENSE
  }

  type KYCRecord {
    id: ID!
    userId: ID!
    bvnVerified: Boolean!
    ninVerified: Boolean!
    faceMatchScore: Float
    faceMatchPassed: Boolean!
    documentType: DocumentType
    documentUrl: String
    selfieUrl: String
    status: KYCStatus!
    rejectionReason: String
    resubmissionNote: String
    createdAt: String!
    updatedAt: String!
  }

  type KYCStatusResponse {
    kyc: KYCRecord
    kycLevel: Int!
  }

  type FaceMatchResponse {
    message: String!
    score: Float!
  }

  type Query {
    myKYCStatus: KYCStatusResponse!
    pendingKYCs(limit: Int, offset: Int): JSON!
  }

  type Mutation {
    submitBVN(bvn: String!): MessageResponse!
    submitNIN(nin: String!): MessageResponse!
    submitFaceMatch(selfieBase64: String!): FaceMatchResponse!
    uploadKYCDocument(documentType: DocumentType!, documentBase64: String!): MessageResponse!
    approveKYC(kycId: ID!): MessageResponse!
    rejectKYC(kycId: ID!, reason: String!): MessageResponse!
    requestKYCResubmission(kycId: ID!, note: String!): MessageResponse!
  }
`;