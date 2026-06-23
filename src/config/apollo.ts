import { ApolloServer } from '@apollo/server';
import { GraphQLContext } from '../core/types/context';
import { schema } from '../shared/graphql/schema';
import { formatGraphQLError } from '../core/errors/errorHandler';
import { env } from './env';
import { GraphQLError } from 'graphql';


export const createApolloServer = () => {
  return new ApolloServer<GraphQLContext>({
    schema,
    formatError: (_formattedError, error) =>
      error instanceof GraphQLError ? formatGraphQLError(error) : _formattedError,
    introspection: env.NODE_ENV !== 'production',
    includeStacktraceInErrorResponses: env.NODE_ENV !== 'production',
  });
};

// export const createApolloServer = () => {
//   return new ApolloServer<GraphQLContext>({
//     schema,
//     formatError: formatGraphQLError,
//     introspection: env.NODE_ENV !== 'production',
//     includeStacktraceInErrorResponses: env.NODE_ENV !== 'production',
//   });
// };