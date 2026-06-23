export const supportTypeDefs = `#graphql
  enum TicketStatus {
    OPEN
    IN_PROGRESS
    ESCALATED
    RESOLVED
    CLOSED
  }

  enum TicketPriority {
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  enum MessageSenderType {
    USER
    AGENT
    AI
  }

  type SupportMessage {
    senderId: ID!
    senderType: MessageSenderType!
    content: String!
    createdAt: String!
  }

  type Ticket {
    id: ID!
    userId: ID!
    subject: String!
    description: String!
    status: TicketStatus!
    priority: TicketPriority!
    assignedAgentId: ID
    messages: [SupportMessage!]!
    channel: String!
    resolvedAt: String
    createdAt: String!
    updatedAt: String!
  }

  type TicketList {
    tickets: [Ticket!]!
    total: Int!
  }

  type Query {
    myTickets: [Ticket!]!
    ticket(id: ID!): Ticket!
    allTickets(status: TicketStatus, limit: Int, offset: Int): TicketList!
  }

  type Mutation {
    createTicket(subject: String!, description: String!): Ticket!
    agentReply(ticketId: ID!, message: String!): MessageResponse!
    assignTicket(ticketId: ID!, agentId: ID!): Ticket!
    closeTicket(ticketId: ID!): Ticket!
    escalateTicket(ticketId: ID!): Ticket!
  }
`;