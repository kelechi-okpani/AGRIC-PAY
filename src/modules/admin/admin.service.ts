import { Admin, IAdmin } from './admin.model';
import { User } from '../auth/auth.model';
import { Transfer } from '../transfers/transfer.model';
import { Order } from '../orders/order.model';
import { KYC } from '../kyc/kyc.model';
import { Ticket } from '../support/ticket.model';
import { Wallet } from '../wallets/wallet.model';
import { hashPassword, comparePassword } from '../../shared/utils/hash';
import { signAccessToken } from '../../shared/utils/jwt';
import { AdminRole, TransferStatus, OrderStatus, KYCStatus } from '../../core/types/enums';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../../core/errors/AppError';
import { walletService } from '../wallets/wallet.service';
import { transferService } from '../transfers/transfer.service';
import { kycService } from '../kyc/kyc.service';
import { logger } from '../../shared/utils/logger';

export class AdminService {

  // ── AUTH ──────────────────────────────────────────────────
  async login(email: string, password: string): Promise<{ accessToken: string; admin: Partial<IAdmin> }> {
    const admin = await Admin.findOne({ email, isActive: true }).select('+password');
    if (!admin) throw new UnauthorizedError('Invalid credentials');

    const valid = await comparePassword(password, admin.password);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    admin.lastLogin = new Date();
    await admin.save();

    const accessToken = signAccessToken({ id: admin._id.toString(), email: admin.email, role: admin.role });

    logger.info(`[Admin] Login: ${admin.email} (${admin.role})`);

    return {
      accessToken,
      admin: { _id: admin._id, fullName: admin.fullName, email: admin.email, role: admin.role },
    };
  }

  async createAdmin(data: { fullName: string; email: string; password: string; role: AdminRole }, createdBy: string): Promise<IAdmin> {
    const existing = await Admin.findOne({ email: data.email });
    if (existing) throw new ConflictError('Email already in use');

    const hashed = await hashPassword(data.password);
    return Admin.create({ ...data, password: hashed, createdBy });
  }

  async updateAdmin(adminId: string, data: Partial<IAdmin>): Promise<IAdmin> {
    const admin = await Admin.findByIdAndUpdate(adminId, data, { new: true });
    if (!admin) throw new NotFoundError('Admin');
    return admin;
  }

  async deleteAdmin(adminId: string): Promise<void> {
    await Admin.findByIdAndDelete(adminId);
  }

  // ── USER MANAGEMENT ───────────────────────────────────────
  async getUsers(filters: { search?: string; role?: string; limit?: number; offset?: number }) {
    const query: any = {};
    if (filters.search) query.$or = [{ fullName: new RegExp(filters.search, 'i') }, { phone: new RegExp(filters.search, 'i') }];
    if (filters.role) query.role = filters.role;

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      User.countDocuments(query),
    ]);

    return { users, total };
  }

  async suspendUser(userId: string, adminId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { isSuspended: true });
    logger.info(`[Admin] User ${userId} suspended by ${adminId}`);
  }

  async unsuspendUser(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { isSuspended: false });
  }

  async freezeUserWallet(userId: string, walletType: string, reason: string, adminId: string): Promise<void> {
    await walletService.freezeWallet(userId, walletType as any, reason);
    logger.info(`[Admin] Wallet frozen: user=${userId} type=${walletType} by admin=${adminId}`);
  }

  async unfreezeUserWallet(userId: string, walletType: string): Promise<void> {
    await walletService.unfreezeWallet(userId, walletType as any);
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    const hashed = await hashPassword(newPassword);
    await User.findByIdAndUpdate(userId, { password: hashed });
  }

  // ── TRANSFER MANAGEMENT ───────────────────────────────────
  async getAllTransfers(filters: { status?: TransferStatus; userId?: string; limit?: number; offset?: number }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.userId) query.fromUserId = filters.userId;

    const [transfers, total] = await Promise.all([
      Transfer.find(query).populate('fromUserId', 'fullName phone').sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Transfer.countDocuments(query),
    ]);

    return { transfers, total };
  }

  async adminRefundTransfer(transferId: string, adminId: string): Promise<void> {
    await transferService.refundTransfer(transferId, adminId);
  }

  // ── ANALYTICS ─────────────────────────────────────────────
  async getDashboardStats() {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      activeUsers,
      pendingKYC,
      openTickets,
      dailyTransfers,
      monthlyTransfers,
      dailyOrders,
      monthlyOrders,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true, isSuspended: false }),
      KYC.countDocuments({ status: KYCStatus.PENDING }),
      Ticket.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] } }),
      Transfer.aggregate([{ $match: { status: TransferStatus.SUCCESS, createdAt: { $gte: startOfDay } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Transfer.aggregate([{ $match: { status: TransferStatus.SUCCESS, createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { status: OrderStatus.DELIVERED, createdAt: { $gte: startOfDay } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { status: OrderStatus.DELIVERED, createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
    ]);

    return {
      users: { total: totalUsers, active: activeUsers },
      kyc: { pending: pendingKYC },
      support: { open: openTickets },
      revenue: {
        daily: {
          transfers: dailyTransfers[0]?.total || 0,
          transferCount: dailyTransfers[0]?.count || 0,
          orders: dailyOrders[0]?.total || 0,
          orderCount: dailyOrders[0]?.count || 0,
        },
        monthly: {
          transfers: monthlyTransfers[0]?.total || 0,
          transferCount: monthlyTransfers[0]?.count || 0,
          orders: monthlyOrders[0]?.total || 0,
          orderCount: monthlyOrders[0]?.count || 0,
        },
      },
    };
  }

  async getTopCustomers(limit = 10) {
    return Transfer.aggregate([
      { $match: { status: TransferStatus.SUCCESS } },
      { $group: { _id: '$fromUserId', totalVolume: { $sum: '$amount' }, transactionCount: { $sum: 1 } } },
      { $sort: { totalVolume: -1 } },
      { $limit: limit },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { userId: '$_id', fullName: '$user.fullName', phone: '$user.phone', totalVolume: 1, transactionCount: 1 } },
    ]);
  }

  async getGrowthMetrics() {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }).reverse();

    const metrics = await Promise.all(
      months.map(async ({ year, month }) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        const [users, transfers, orders] = await Promise.all([
          User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
          Transfer.countDocuments({ status: TransferStatus.SUCCESS, createdAt: { $gte: start, $lte: end } }),
          Order.countDocuments({ status: OrderStatus.DELIVERED, createdAt: { $gte: start, $lte: end } }),
        ]);
        return { month: `${year}-${String(month).padStart(2, '0')}`, users, transfers, orders };
      })
    );

    return metrics;
  }
}

export const adminService = new AdminService();