import { Business, IBusiness } from './business.model';
import { walletService } from '../wallets/wallet.service';
import { paystackService } from '../../infrastructure/paystack';
import { notificationQueue } from '../../queues';
import { WalletType } from '../../core/types/enums';
import { AppError, NotFoundError, ConflictError } from '../../core/errors/AppError';
import { v4 as uuidv4 } from 'uuid';

export class BusinessService {

  async createBusiness(userId: string, data: Partial<IBusiness>): Promise<IBusiness> {
    const existing = await Business.findOne({ userId });
    if (existing) throw new ConflictError('You already have a business account');

    return Business.create({ userId, ...data });
  }

  async getBusiness(userId: string): Promise<IBusiness> {
    const business = await Business.findOne({ userId });
    if (!business) throw new NotFoundError('Business');
    return business;
  }

  async updateBusiness(userId: string, data: Partial<IBusiness>): Promise<IBusiness> {
    const business = await Business.findOneAndUpdate({ userId }, data, { new: true });
    if (!business) throw new NotFoundError('Business');
    return business;
  }

  async addEmployee(userId: string, employee: IBusiness['employees'][0]): Promise<IBusiness> {
    const business = await Business.findOne({ userId });
    if (!business) throw new NotFoundError('Business');
    if (business.status !== 'APPROVED') throw new AppError('Business must be approved to add employees', 403);

    business.employees.push(employee);
    return business.save();
  }

  async removeEmployee(userId: string, accountNumber: string): Promise<IBusiness> {
    const business = await Business.findOne({ userId });
    if (!business) throw new NotFoundError('Business');

    business.employees = business.employees.filter((e) => e.accountNumber !== accountNumber);
    return business.save();
  }

  async runPayroll(userId: string): Promise<{ message: string; totalPaid: number; count: number }> {
    const business = await Business.findOne({ userId, status: 'APPROVED' });
    if (!business) throw new NotFoundError('Business');
    if (business.employees.length === 0) throw new AppError('No employees to pay', 400);

    const totalSalary = business.employees.reduce((sum, e) => sum + e.salary, 0);

    // Debit business wallet
    await walletService.debit(userId, WalletType.NGN, totalSalary, `Payroll — ${new Date().toDateString()}`, {});

    // Initiate transfers to each employee
    for (const employee of business.employees) {
      const reference = `PAY-${uuidv4()}`;
      try {
        const recipientCode = await paystackService.createTransferRecipient({
          type: 'nuban',
          name: employee.accountName,
          account_number: employee.accountNumber,
          bank_code: employee.bankCode,
          currency: 'NGN',
        });

        await paystackService.initiateTransfer({
          source: 'balance',
          amount: employee.salary * 100,
          recipient: recipientCode,
          reason: `${business.businessName} salary payment`,
          reference,
        });
      } catch (err) {
        // Log failure but continue payroll
        console.error(`Payroll failed for ${employee.name}:`, err);
      }
    }

    await notificationQueue.add('payroll-complete', {
      userId,
      channel: 'WHATSAPP',
      message: `✅ Payroll processed!\nEmployees paid: ${business.employees.length}\nTotal: ₦${totalSalary.toLocaleString()}`,
    });

    return { message: 'Payroll processed successfully', totalPaid: totalSalary, count: business.employees.length };
  }

  async approveBusiness(businessId: string, adminId: string): Promise<IBusiness> {
    const business = await Business.findByIdAndUpdate(
      businessId,
      { status: 'APPROVED', approvedAt: new Date() },
      { new: true }
    );
    if (!business) throw new NotFoundError('Business');

    await notificationQueue.add('business-approved', {
      userId: business.userId.toString(),
      channel: 'WHATSAPP',
      message: `🎉 Your business account *${business.businessName}* has been approved! You can now run payroll, create invoices, and make bulk payments.`,
    });

    return business;
  }

  async rejectBusiness(businessId: string, reason: string): Promise<IBusiness> {
    const business = await Business.findByIdAndUpdate(
      businessId,
      { status: 'REJECTED', rejectionReason: reason },
      { new: true }
    );
    if (!business) throw new NotFoundError('Business');

    await notificationQueue.add('business-rejected', {
      userId: business.userId.toString(),
      channel: 'WHATSAPP',
      message: `❌ Your business account application was rejected.\nReason: ${reason}\n\nPlease update your details and reapply.`,
    });

    return business;
  }

  async suspendBusiness(businessId: string): Promise<IBusiness> {
    const business = await Business.findByIdAndUpdate(businessId, { status: 'SUSPENDED' }, { new: true });
    if (!business) throw new NotFoundError('Business');
    return business;
  }

  async getAllBusinesses(filters: { status?: string; limit?: number; offset?: number }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;

    const [businesses, total] = await Promise.all([
      Business.find(query).populate('userId', 'fullName phone').sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Business.countDocuments(query),
    ]);

    return { businesses, total };
  }
}

export const businessService = new BusinessService();