import { Product, IProduct } from './product.model';
import { cloudinaryService } from '../../infrastructure/cloudinary';
import { AppError, NotFoundError, ValidationError, ForbiddenError } from '../../core/errors/AppError';
import { UserRole } from '../../core/types/enums';

export class ProductService {

  async createProduct(merchantId: string, data: {
    name: string;
    description: string;
    category: string;
    price: number;
    unit: string;
    quantity: number;
    images?: string[];
    tags?: string[];
    location?: string;
  }): Promise<IProduct> {
    return Product.create({ merchantId, ...data, isApproved: false });
  }

  async updateProduct(productId: string, merchantId: string, data: Partial<IProduct>): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, merchantId });
    if (!product) throw new NotFoundError('Product');
    Object.assign(product, data);
    return product.save();
  }

  async deleteProduct(productId: string, merchantId: string): Promise<void> {
    const product = await Product.findOneAndDelete({ _id: productId, merchantId });
    if (!product) throw new NotFoundError('Product');
  }

  async getProduct(productId: string): Promise<IProduct> {
    const product = await Product.findById(productId).populate('merchantId', 'fullName phone');
    if (!product) throw new NotFoundError('Product');
    return product;
  }

  async searchProducts(filters: {
    query?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    location?: string;
    limit?: number;
    offset?: number;
  }) {
    const query: any = { isActive: true, isApproved: true, quantity: { $gt: 0 } };

    if (filters.query) query.$text = { $search: filters.query };
    if (filters.category) query.category = filters.category;
    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = filters.minPrice;
      if (filters.maxPrice) query.price.$lte = filters.maxPrice;
    }
    if (filters.location) query.location = new RegExp(filters.location, 'i');

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('merchantId', 'fullName phone')
        .sort({ averageRating: -1, totalSold: -1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      Product.countDocuments(query),
    ]);

    return { products, total };
  }

  async getMerchantProducts(merchantId: string, filters: { limit?: number; offset?: number }) {
    const [products, total] = await Promise.all([
      Product.find({ merchantId }).skip(filters.offset || 0).limit(filters.limit || 20),
      Product.countDocuments({ merchantId }),
    ]);
    return { products, total };
  }

  async rateProduct(productId: string, userId: string, score: number, review?: string): Promise<void> {
    const product = await Product.findById(productId);
    if (!product) throw new NotFoundError('Product');

    const existing = product.ratings.find((r) => r.userId.toString() === userId);
    if (existing) {
      existing.score = score;
      existing.review = review;
    } else {
      product.ratings.push({ userId: userId as any, score, review, createdAt: new Date() });
    }

    product.averageRating = product.ratings.reduce((sum, r) => sum + r.score, 0) / product.ratings.length;
    await product.save();
  }

  async approveProduct(productId: string): Promise<void> {
    await Product.findByIdAndUpdate(productId, { isApproved: true });
  }

  async getCategories(): Promise<string[]> {
    return ['Grains', 'Tubers', 'Vegetables', 'Fruits', 'Livestock', 'Poultry', 'Dairy', 'Processed Goods'];
  }
}

export const productService = new ProductService();