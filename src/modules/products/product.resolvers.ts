import { productService } from './product.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const productResolvers = {
  Query: {
    product: (_: any, { id }: any) => productService.getProduct(id),
    searchProducts: (_: any, args: any) => productService.searchProducts(args),
    myProducts: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return productService.getMerchantProducts(user.id, args);
    },
    productCategories: () => productService.getCategories(),
  },
  Mutation: {
    createProduct: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return productService.createProduct(user.id, args);
    },
    updateProduct: (_: any, { id, ...data }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return productService.updateProduct(id, user.id, data);
    },
    deleteProduct: async (_: any, { id }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      await productService.deleteProduct(id, user.id);
      return { success: true, message: 'Product deleted.' };
    },
    rateProduct: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      await productService.rateProduct(args.productId, user.id, args.score, args.review);
      return { success: true, message: 'Rating submitted.' };
    },
    approveProduct: async (_: any, { productId }: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      await productService.approveProduct(productId);
      return { success: true, message: 'Product approved.' };
    },
  },
};